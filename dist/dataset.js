/**
 * The dataset layer: one normalised page shape that both sources map onto —
 *   1. the Crawl Cove desktop app's Reports JSON export (crawlcove-export-spec), and
 *   2. crawlcove-cli's JSON result (also what crawl_site produces live) —
 * plus the pure queries the MCP tools expose. No MCP types in here, so it is
 * unit-testable and reusable from plain scripts.
 */
export const ISSUE_TYPES = [
    'broken-page',
    'missing-title',
    'long-title',
    'duplicate-title',
    'missing-meta-description',
    'long-meta-description',
    'missing-h1',
    'multiple-h1',
    'noindex',
    'redirect-chain',
    'missing-canonical'
];
export const ISSUE_DESCRIPTIONS = {
    'broken-page': 'The page returned a 4xx/5xx status or could not be fetched',
    'missing-title': 'No <title>',
    'long-title': '<title> longer than 60 characters (may be truncated in search results)',
    'duplicate-title': 'The same <title> is used on more than one page',
    'missing-meta-description': 'No <meta name="description">',
    'long-meta-description': 'Meta description longer than 160 characters',
    'missing-h1': 'No <h1> on a 200 HTML page',
    'multiple-h1': 'More than one <h1>',
    noindex: 'The page carries a robots noindex directive',
    'redirect-chain': 'The URL went through 2 or more redirects',
    'missing-canonical': 'No <link rel="canonical"> on an indexable page'
};
const TITLE_MAX = 60;
const META_MAX = 160;
/** Identify which of the two supported JSON shapes `data` is, or null if neither. */
export function detectShape(data) {
    if (typeof data !== 'object' || data === null)
        return null;
    const d = data;
    if (!Array.isArray(d.pages))
        return null;
    if (typeof d.schemaVersion === 'string' && typeof d.auditRunId === 'number')
        return 'desktop-export';
    if (typeof d.seedUrl === 'string')
        return 'cli-result';
    return null;
}
export function fromDesktopExport(data, origin, now = new Date()) {
    return {
        source: 'desktop-export',
        origin,
        loadedAt: now.toISOString(),
        truncated: false,
        robotsBlocked: [],
        pages: data.pages.map((p) => ({
            url: p.url,
            finalUrl: p.finalUrl,
            statusCode: p.statusCode,
            title: p.title,
            titleLength: p.titleLength,
            metaDescription: p.metaDescription,
            metaLength: p.metaLength,
            h1Count: p.h1Count,
            canonical: p.canonical,
            robotsMeta: p.robotsMeta,
            indexable: p.indexable,
            redirectHops: p.redirectHops,
            fetchError: p.fetchError,
            brokenInternalLinks: null,
            depth: p.depth,
            wordCount: p.wordCount,
            contentType: p.contentType
        }))
    };
}
export function fromCliResult(data, origin, source = 'cli-result', now = new Date()) {
    return {
        source,
        origin,
        loadedAt: now.toISOString(),
        truncated: data.truncated ?? false,
        robotsBlocked: data.robotsBlocked ?? [],
        pages: data.pages.map((p) => ({
            url: p.url,
            finalUrl: p.finalUrl,
            statusCode: p.statusCode,
            title: p.title,
            titleLength: p.titleLength,
            metaDescription: p.metaDescription,
            metaLength: p.metaLength,
            h1Count: p.h1Count,
            canonical: p.canonical,
            robotsMeta: p.robotsMeta,
            indexable: p.indexable,
            redirectHops: p.redirectHops,
            fetchError: p.fetchError,
            brokenInternalLinks: p.brokenInternalLinks,
            depth: null,
            wordCount: null,
            contentType: null
        }))
    };
}
/** Parse already-read JSON text into a Dataset, whichever supported shape it is. Throws with a clear message otherwise. */
export function fromJsonText(text, origin) {
    let data;
    try {
        data = JSON.parse(text);
    }
    catch (err) {
        throw new Error(`${origin} is not valid JSON: ${err.message}`);
    }
    const shape = detectShape(data);
    if (shape === 'desktop-export')
        return fromDesktopExport(data, origin);
    if (shape === 'cli-result')
        return fromCliResult(data, origin);
    throw new Error(`${origin} is neither a Crawl Cove desktop export (schemaVersion + pages) nor a crawlcove-cli result (seedUrl + pages).`);
}
/* ---------- queries ---------- */
export function isBrokenPage(p) {
    return p.fetchError !== null || (p.statusCode !== null && p.statusCode >= 400);
}
export function isNoindex(p) {
    return p.robotsMeta !== null && /noindex/i.test(p.robotsMeta);
}
/** Every issue on every page, in ISSUE_TYPES order then page order. */
export function findIssues(dataset, only) {
    const issues = [];
    const want = (t) => only === undefined || only === t;
    const pages = dataset.pages;
    const okHtml = (p) => p.statusCode === 200 && p.fetchError === null;
    const titleCounts = new Map();
    for (const p of pages) {
        if (okHtml(p) && p.title)
            titleCounts.set(p.title, (titleCounts.get(p.title) ?? 0) + 1);
    }
    const byType = Object.fromEntries(ISSUE_TYPES.map((t) => [t, []]));
    for (const p of pages) {
        if (isBrokenPage(p)) {
            byType['broken-page'].push({ type: 'broken-page', url: p.url, detail: p.fetchError ?? `HTTP ${p.statusCode}` });
            continue; // the remaining checks are meaningless on a page that did not load
        }
        if (!okHtml(p))
            continue; // redirects that were not followed, non-200s without a body
        if (!p.title || p.title.trim() === '')
            byType['missing-title'].push({ type: 'missing-title', url: p.url, detail: 'no <title>' });
        else {
            if ((p.titleLength ?? p.title.length) > TITLE_MAX)
                byType['long-title'].push({ type: 'long-title', url: p.url, detail: `${p.titleLength ?? p.title.length} chars: "${p.title}"` });
            if ((titleCounts.get(p.title) ?? 0) > 1)
                byType['duplicate-title'].push({ type: 'duplicate-title', url: p.url, detail: `"${p.title}" is used on ${titleCounts.get(p.title)} pages` });
        }
        if (!p.metaDescription || p.metaDescription.trim() === '')
            byType['missing-meta-description'].push({ type: 'missing-meta-description', url: p.url, detail: 'no meta description' });
        else if ((p.metaLength ?? p.metaDescription.length) > META_MAX)
            byType['long-meta-description'].push({ type: 'long-meta-description', url: p.url, detail: `${p.metaLength ?? p.metaDescription.length} chars` });
        if (p.h1Count === 0)
            byType['missing-h1'].push({ type: 'missing-h1', url: p.url, detail: 'no <h1>' });
        else if (p.h1Count !== null && p.h1Count > 1)
            byType['multiple-h1'].push({ type: 'multiple-h1', url: p.url, detail: `${p.h1Count} <h1> elements` });
        if (isNoindex(p))
            byType.noindex.push({ type: 'noindex', url: p.url, detail: `robots meta: ${p.robotsMeta}` });
        if (p.redirectHops >= 2)
            byType['redirect-chain'].push({ type: 'redirect-chain', url: p.url, detail: `${p.redirectHops} hops → ${p.finalUrl}` });
        if (p.indexable && (p.canonical === null || p.canonical === ''))
            byType['missing-canonical'].push({ type: 'missing-canonical', url: p.url, detail: 'indexable page without a canonical' });
    }
    // redirect chains are recorded on the requested URL even when the final page broke — add them for broken pages too
    for (const p of pages) {
        if (isBrokenPage(p) && p.redirectHops >= 2)
            byType['redirect-chain'].push({ type: 'redirect-chain', url: p.url, detail: `${p.redirectHops} hops → ${p.finalUrl}` });
    }
    for (const t of ISSUE_TYPES)
        if (want(t))
            issues.push(...byType[t]);
    return issues;
}
export function countIssues(dataset) {
    const counts = Object.fromEntries(ISSUE_TYPES.map((t) => [t, 0]));
    for (const i of findIssues(dataset))
        counts[i.type] += 1;
    return counts;
}
/** Find a page by URL, tolerating a missing/extra trailing slash and scheme-less input. */
export function findPage(dataset, url) {
    const norm = (u) => u.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
    const target = norm(url);
    return dataset.pages.find((p) => p.url === url) ?? dataset.pages.find((p) => norm(p.url) === target || (p.finalUrl !== null && norm(p.finalUrl) === target));
}
/** Source → target pairs for broken internal links (CLI/live datasets), or null when the dataset has no link graph. */
export function listBrokenLinks(dataset) {
    if (dataset.pages.some((p) => p.brokenInternalLinks === null))
        return null;
    const detailOf = new Map(dataset.pages.map((p) => [p.url, p.fetchError ?? (p.statusCode !== null ? `HTTP ${p.statusCode}` : 'unknown')]));
    const out = [];
    for (const p of dataset.pages) {
        for (const target of p.brokenInternalLinks ?? [])
            out.push({ source: p.url, target, detail: detailOf.get(target) ?? 'not crawled' });
    }
    return out;
}
export function listPages(dataset, filter = {}) {
    return dataset.pages.filter((p) => (filter.status === undefined || p.statusCode === filter.status) &&
        (filter.indexable === undefined || p.indexable === filter.indexable) &&
        (filter.urlContains === undefined || p.url.includes(filter.urlContains)));
}
/** One-paragraph description of a dataset, used by every tool's text output. */
export function describe(dataset) {
    const counts = countIssues(dataset);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const where = dataset.source === 'desktop-export'
        ? `Crawl Cove desktop export ${dataset.origin}`
        : dataset.source === 'cli-result'
            ? `crawlcove-cli result ${dataset.origin}`
            : `live crawl of ${dataset.origin}`;
    return (`${where}: ${dataset.pages.length} pages, ${total} issues` +
        (dataset.truncated ? ' (crawl stopped at the page cap — the desktop app has no cap)' : '') +
        (dataset.robotsBlocked.length > 0 ? `, ${dataset.robotsBlocked.length} URLs skipped per robots.txt` : '') +
        '.');
}
