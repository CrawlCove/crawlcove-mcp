import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { crawlSite, DEFAULT_CRAWL_OPTIONS, SeedBlockedByRobotsError } from 'crawlcove';
import { countIssues, describe, findIssues, findPage, fromCliResult, fromJsonText, ISSUE_DESCRIPTIONS, ISSUE_TYPES, listBrokenLinks, listPages } from './dataset.js';
/** Hard ceiling on a live crawl from the MCP server — bigger sites are what the desktop app is for. */
export const MAX_LIVE_PAGES = 200;
const DEFAULT_LIVE_PAGES = 50;
const DEFAULT_LIST_LIMIT = 50;
const DESKTOP_URL = 'https://crawlcove.com/?utm_source=github&utm_medium=crawlcove-mcp';
const NO_DATASET = 'No crawl data loaded yet. Call crawl_site with a URL for a live crawl (up to ' +
    `${MAX_LIVE_PAGES} pages), or load_export with the path to a Crawl Cove desktop export or crawlcove-cli JSON file.`;
function text(t, structured) {
    return { content: [{ type: 'text', text: t }], ...(structured ? { structuredContent: structured } : {}) };
}
function fail(t) {
    return { content: [{ type: 'text', text: t }], isError: true };
}
/** Build the MCP server. `state` is exposed so tests (and embedders) can inspect the active dataset. */
export function createServer(opts = {}) {
    const crawl = opts.crawl ?? crawlSite;
    const readFile = opts.readFile ?? ((p) => readFileSync(p, 'utf8'));
    const now = opts.now ?? (() => new Date());
    const state = { dataset: null };
    const server = new McpServer({ name: 'crawlcove', version: '1.0.0' });
    server.registerTool('crawl_site', {
        title: 'Crawl a site',
        description: `Crawl a website live (same-origin, breadth-first, robots.txt respected) and make the result the active dataset for the other tools. ` +
            `Capped at ${MAX_LIVE_PAGES} pages; for a full-site audit with history and Search Console data, use the Crawl Cove desktop app and load its export with load_export.`,
        inputSchema: {
            url: z.string().url().describe('Start URL, e.g. https://example.com/'),
            maxPages: z.number().int().min(1).max(MAX_LIVE_PAGES).optional().describe(`Page cap (default ${DEFAULT_LIVE_PAGES}, max ${MAX_LIVE_PAGES})`),
            ignoreRobots: z.boolean().optional().describe('Crawl URLs robots.txt disallows. Only for sites you own.')
        }
    }, async ({ url, maxPages, ignoreRobots }) => {
        try {
            const result = await crawl(url, {
                ...DEFAULT_CRAWL_OPTIONS,
                userAgent: 'crawlcove-mcp/1.0 (+https://github.com/CrawlCove/crawlcove-mcp)',
                maxPages: Math.min(maxPages ?? DEFAULT_LIVE_PAGES, MAX_LIVE_PAGES),
                ignoreRobots: ignoreRobots ?? false
            });
            state.dataset = fromCliResult(result, url, 'live-crawl', now());
        }
        catch (err) {
            if (err instanceof SeedBlockedByRobotsError) {
                return fail(`robots.txt disallows ${url} for this crawler, so nothing was fetched. If you own the site, call again with ignoreRobots: true.`);
            }
            return fail(`Crawl failed: ${err.message}`);
        }
        const counts = countIssues(state.dataset);
        return text(describe(state.dataset) + '\n\nIssue counts:\n' + formatCounts(counts) + '\n\nNext: get_issues for the list, get_page for one URL, list_broken_links for link sources.', {
            pageCount: state.dataset.pages.length,
            truncated: state.dataset.truncated,
            robotsBlocked: state.dataset.robotsBlocked.length,
            issueCounts: counts
        });
    });
    server.registerTool('load_export', {
        title: 'Load a crawl export',
        description: 'Load a Crawl Cove desktop app JSON export (Reports → Export → JSON) or a crawlcove-cli JSON result from disk and make it the active dataset. ' +
            'Desktop exports carry more per-page data (depth, word count, content type) and have no page cap.',
        inputSchema: { path: z.string().describe('Absolute path to the .json file') }
    }, async ({ path }) => {
        let raw;
        try {
            raw = readFile(path);
        }
        catch (err) {
            return fail(`Could not read ${path}: ${err.message}`);
        }
        try {
            state.dataset = fromJsonText(raw, path);
        }
        catch (err) {
            return fail(err.message);
        }
        const counts = countIssues(state.dataset);
        return text(describe(state.dataset) + '\n\nIssue counts:\n' + formatCounts(counts), {
            source: state.dataset.source,
            pageCount: state.dataset.pages.length,
            issueCounts: counts
        });
    });
    server.registerTool('get_issues', {
        title: 'List SEO issues',
        description: 'List the SEO issues found in the active dataset, optionally one type only. Types: ' +
            ISSUE_TYPES.map((t) => `${t} (${ISSUE_DESCRIPTIONS[t]})`).join('; ') +
            '.',
        inputSchema: {
            type: z.enum(ISSUE_TYPES).optional().describe('Restrict to one issue type'),
            limit: z.number().int().min(1).max(500).optional().describe(`Max issues to return (default ${DEFAULT_LIST_LIMIT})`)
        }
    }, async ({ type, limit }) => {
        if (!state.dataset)
            return fail(NO_DATASET);
        const all = findIssues(state.dataset, type);
        const shown = all.slice(0, limit ?? DEFAULT_LIST_LIMIT);
        const counts = countIssues(state.dataset);
        const head = type ? `${all.length} ${type} issue(s)` : `${all.length} issue(s) across ${Object.values(counts).filter((n) => n > 0).length} types`;
        const body = shown.map((i) => `- [${i.type}] ${i.url} — ${i.detail}`).join('\n');
        const more = all.length > shown.length ? `\n…and ${all.length - shown.length} more (raise limit or filter by type).` : '';
        return text(`${head} in ${state.dataset.pages.length} pages.\n${type ? '' : formatCounts(counts) + '\n'}\n${body || '(none)'}${more}`, {
            total: all.length,
            counts,
            issues: shown
        });
    });
    server.registerTool('get_page', {
        title: 'Get one page',
        description: 'Return everything the crawl recorded about one URL (status, title, meta description, H1 count, canonical, robots, redirects, broken links out).',
        inputSchema: { url: z.string().describe('The page URL as crawled; a missing trailing slash or scheme is tolerated') }
    }, async ({ url }) => {
        if (!state.dataset)
            return fail(NO_DATASET);
        const page = findPage(state.dataset, url);
        if (!page)
            return fail(`${url} is not in the active dataset (${state.dataset.pages.length} pages). Use list_pages with urlContains to search.`);
        const issues = findIssues(state.dataset).filter((i) => i.url === page.url);
        const lines = [
            `URL: ${page.url}`,
            page.finalUrl && page.finalUrl !== page.url ? `Final URL: ${page.finalUrl} (${page.redirectHops} redirect hop(s))` : null,
            `Status: ${page.statusCode ?? 'none'}${page.fetchError ? ` (fetch error: ${page.fetchError})` : ''}`,
            `Indexable: ${page.indexable ? 'yes' : 'no'}${page.robotsMeta ? ` (robots meta: ${page.robotsMeta})` : ''}`,
            `Title: ${page.title ?? '(none)'}${page.titleLength !== null ? ` [${page.titleLength} chars]` : ''}`,
            `Meta description: ${page.metaDescription ?? '(none)'}${page.metaLength !== null ? ` [${page.metaLength} chars]` : ''}`,
            `H1 count: ${page.h1Count ?? 'n/a'}`,
            `Canonical: ${page.canonical ?? '(none)'}`,
            page.depth !== null ? `Depth: ${page.depth}` : null,
            page.wordCount !== null ? `Word count: ${page.wordCount}` : null,
            page.brokenInternalLinks && page.brokenInternalLinks.length > 0 ? `Broken links out: ${page.brokenInternalLinks.join(', ')}` : null,
            issues.length > 0 ? `Issues: ${issues.map((i) => i.type).join(', ')}` : 'Issues: none'
        ].filter((l) => l !== null);
        return text(lines.join('\n'), { page, issues });
    });
    server.registerTool('list_broken_links', {
        title: 'List broken internal links',
        description: 'Broken internal links as source page → broken target pairs, so you know which page to fix. Needs a live crawl or crawlcove-cli dataset; a desktop export lists the broken pages instead (its link graph lives in the app).',
        inputSchema: { limit: z.number().int().min(1).max(500).optional().describe(`Max entries (default ${DEFAULT_LIST_LIMIT})`) }
    }, async ({ limit }) => {
        if (!state.dataset)
            return fail(NO_DATASET);
        const cap = limit ?? DEFAULT_LIST_LIMIT;
        const links = listBrokenLinks(state.dataset);
        if (links === null) {
            const broken = findIssues(state.dataset, 'broken-page');
            const shown = broken.slice(0, cap);
            return text(`${broken.length} broken page(s). This desktop export has no link graph, so sources are not listed here — open the run in Crawl Cove (${DESKTOP_URL}) for inlinks, or crawl_site for a live crawl with sources.\n` +
                shown.map((i) => `- ${i.url} — ${i.detail}`).join('\n'), { brokenPages: shown, total: broken.length, hasLinkGraph: false });
        }
        const shown = links.slice(0, cap);
        return text(`${links.length} broken internal link(s).\n` +
            (shown.map((l) => `- ${l.source} → ${l.target} (${l.detail})`).join('\n') || '(none)') +
            (links.length > shown.length ? `\n…and ${links.length - shown.length} more.` : ''), { brokenLinks: shown, total: links.length, hasLinkGraph: true });
    });
    server.registerTool('list_pages', {
        title: 'List pages',
        description: 'List crawled pages with status and title, optionally filtered by status code, indexability, or a URL substring.',
        inputSchema: {
            status: z.number().int().optional().describe('Only pages with this HTTP status'),
            indexable: z.boolean().optional().describe('Only indexable (true) or non-indexable (false) pages'),
            urlContains: z.string().optional().describe('Only URLs containing this substring'),
            limit: z.number().int().min(1).max(1000).optional().describe(`Max pages (default ${DEFAULT_LIST_LIMIT})`)
        }
    }, async ({ status, indexable, urlContains, limit }) => {
        if (!state.dataset)
            return fail(NO_DATASET);
        const pages = listPages(state.dataset, { status, indexable, urlContains });
        const shown = pages.slice(0, limit ?? DEFAULT_LIST_LIMIT);
        return text(`${pages.length} of ${state.dataset.pages.length} pages match.\n` +
            shown.map((p) => `- ${p.statusCode ?? 'ERR'} ${p.url}${p.title ? ` — ${p.title}` : ''}`).join('\n') +
            (pages.length > shown.length ? `\n…and ${pages.length - shown.length} more.` : ''), { total: pages.length, pages: shown.map((p) => ({ url: p.url, statusCode: p.statusCode, title: p.title, indexable: p.indexable })) });
    });
    return { server, state };
}
function formatCounts(counts) {
    return Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([t, n]) => `- ${t}: ${n}`)
        .join('\n') || '- none';
}
