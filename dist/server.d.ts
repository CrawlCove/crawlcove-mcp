import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { crawlSite } from 'crawlcove';
import { type Dataset } from './dataset.js';
/** Hard ceiling on a live crawl from the MCP server — bigger sites are what the desktop app is for. */
export declare const MAX_LIVE_PAGES = 200;
export interface ServerOptions {
    /** Injected for tests: replaces the live crawler. */
    crawl?: typeof crawlSite;
    /** Injected for tests: replaces file reading. */
    readFile?: (path: string) => string;
    now?: () => Date;
}
export interface ServerState {
    dataset: Dataset | null;
}
/** Build the MCP server. `state` is exposed so tests (and embedders) can inspect the active dataset. */
export declare function createServer(opts?: ServerOptions): {
    server: McpServer;
    state: ServerState;
};
