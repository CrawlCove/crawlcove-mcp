/**
 * The dataset layer: one normalised page shape that both sources map onto —
 *   1. the Crawl Cove desktop app's Reports JSON export (crawlcove-export-spec), and
 *   2. crawlcove-cli's JSON result (also what crawl_site produces live) —
 * plus the pure queries the MCP tools expose. No MCP types in here, so it is
 * unit-testable and reusable from plain scripts.
 */
export interface Page {
    url: string;
    finalUrl: string | null;
    statusCode: number | null;
    title: string | null;
    titleLength: number | null;
    metaDescription: string | null;
    metaLength: number | null;
    h1Count: number | null;
    canonical: string | null;
    robotsMeta: string | null;
    indexable: boolean;
    redirectHops: number;
    fetchError: string | null;
    /** Same-origin links from this page to pages that are broken. null when the source has no link graph (desktop export). */
    brokenInternalLinks: string[] | null;
    depth: number | null;
    wordCount: number | null;
    contentType: string | null;
}
export type DatasetSource = 'desktop-export' | 'cli-result' | 'live-crawl';
export interface Dataset {
    source: DatasetSource;
    /** Where it came from: a file path, or the seed URL for a live crawl. */
    origin: string;
    loadedAt: string;
    pages: Page[];
    /** Only for live crawls / CLI results: URLs robots.txt kept the crawler out of. */
    robotsBlocked: string[];
    /** Only for live crawls / CLI results: true when the page cap stopped the crawl early. */
    truncated: boolean;
}
export declare const ISSUE_TYPES: readonly ['broken-page', 'missing-title', 'long-title', 'duplicate-title', 'missing-meta-description', 'long-meta-description', 'missing-h1', 'multiple-h1', 'noindex', 'redirect-chain', 'missing-canonical'];
export type IssueType = (typeof ISSUE_TYPES)[number];
export declare const ISSUE_DESCRIPTIONS: Record<IssueType, string>;
export interface Issue {
    type: IssueType;
    url: string;
    detail: string;
}
interface DesktopExportPage {
    url: string;
    finalUrl: string | null;
    statusCode: number | null;
    contentType: string | null;
    depth: number | null;
    indexable: boolean;
    title: string | null;
    titleLength: number | null;
    metaDescription: string | null;
    metaLength: number | null;
    canonical: string | null;
    robotsMeta: string | null;
    h1Count: number | null;
    wordCount: number | null;
    redirectHops: number;
    fetchError: string | null;
}
interface CliPage {
    url: string;
    finalUrl: string;
    statusCode: number | null;
    redirectHops: number;
    fetchError: string | null;
    title: string | null;
    titleLength: number | null;
    metaDescription: string | null;
    metaLength: number | null;
    h1Count: number | null;
    canonical: string | null;
    robotsMeta: string | null;
    indexable: boolean;
    brokenInternalLinks: string[];
}
export interface CliResultLike {
    seedUrl: string;
    pages: CliPage[];
    robotsBlocked?: string[];
    truncated?: boolean;
}
/** Identify which of the two supported JSON shapes `data` is, or null if neither. */
export declare function detectShape(data: unknown): 'desktop-export' | 'cli-result' | null;
export declare function fromDesktopExport(data: {
    pages: DesktopExportPage[];
}, origin: string, now?: Date): Dataset;
export declare function fromCliResult(data: CliResultLike, origin: string, source?: 'cli-result' | 'live-crawl', now?: Date): Dataset;
/** Parse already-read JSON text into a Dataset, whichever supported shape it is. Throws with a clear message otherwise. */
export declare function fromJsonText(text: string, origin: string): Dataset;
export declare function isBrokenPage(p: Page): boolean;
export declare function isNoindex(p: Page): boolean;
/** Every issue on every page, in ISSUE_TYPES order then page order. */
export declare function findIssues(dataset: Dataset, only?: IssueType): Issue[];
export declare function countIssues(dataset: Dataset): Record<IssueType, number>;
/** Find a page by URL, tolerating a missing/extra trailing slash and scheme-less input. */
export declare function findPage(dataset: Dataset, url: string): Page | undefined;
export interface BrokenLink {
    source: string;
    target: string;
    detail: string;
}
/** Source → target pairs for broken internal links (CLI/live datasets), or null when the dataset has no link graph. */
export declare function listBrokenLinks(dataset: Dataset): BrokenLink[] | null;
export interface PageFilter {
    status?: number;
    indexable?: boolean;
    urlContains?: string;
}
export declare function listPages(dataset: Dataset, filter?: PageFilter): Page[];
/** One-paragraph description of a dataset, used by every tool's text output. */
export declare function describe(dataset: Dataset): string;
export {};
