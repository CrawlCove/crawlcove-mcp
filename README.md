# crawlcove-mcp

An MCP server that gives Claude, Cursor, Claude Code and any other MCP client your site's SEO crawl data — ask "which pages are missing meta descriptions?", "what links to the 404s?", or "crawl staging and tell me what's wrong" and get answers from a real crawl, not a guess.

## Setup

Requires Node 18+. Nothing to install: MCP clients run the server with `npx` straight from GitHub (the npm package is coming).

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "crawlcove": {
      "command": "npx",
      "args": ["-y", "github:CrawlCove/crawlcove-mcp"]
    }
  }
}
```

**Claude Code:**

```sh
claude mcp add crawlcove -- npx -y github:CrawlCove/crawlcove-mcp
```

**Cursor** — `.cursor/mcp.json` in your project (or the global one):

```json
{
  "mcpServers": {
    "crawlcove": {
      "command": "npx",
      "args": ["-y", "github:CrawlCove/crawlcove-mcp"]
    }
  }
}
```

The first start takes a few seconds while `npx` fetches the package; after that it is cached.

## Tools

| Tool | What it does |
|---|---|
| `crawl_site` `{url, maxPages?, ignoreRobots?}` | Live crawl of a site (same-origin, breadth-first, robots.txt respected), up to **200 pages**. Becomes the active dataset. |
| `load_export` `{path}` | Load a Crawl Cove desktop app JSON export (Reports → Export → JSON) or a `crawlcove-cli` JSON result from disk. No page cap. |
| `get_issues` `{type?, limit?}` | The SEO issues in the active dataset. Types: `broken-page`, `missing-title`, `long-title`, `duplicate-title`, `missing-meta-description`, `long-meta-description`, `missing-h1`, `multiple-h1`, `noindex`, `redirect-chain`, `missing-canonical`. |
| `get_page` `{url}` | Everything recorded about one URL: status, title, meta description, H1 count, canonical, robots, redirect hops, broken links out. |
| `list_broken_links` `{limit?}` | Broken internal links as *source page → broken target*, so you know which page to fix. |
| `list_pages` `{status?, indexable?, urlContains?, limit?}` | Pages with status and title, filtered. |

Things to ask once it is connected:

- "Crawl https://staging.example.com and list every issue."
- "Which pages are missing meta descriptions? Draft one for each."
- "What links to the 404s?"
- "Load ~/Downloads/crawl-export.json and show me the noindex pages."

## Where the data comes from

- **Live crawls** use the same crawler as [crawlcove-cli](https://github.com/CrawlCove/crawlcove-cli): same-origin links only, robots.txt honoured (a `User-agent: crawlcove-cli` group is respected over `*`), a hard cap of 200 pages so an assistant cannot accidentally hammer a site. Broken-link *sources* are available because the crawler keeps the link graph.
- **Desktop exports** follow [crawlcove-export-spec](https://github.com/CrawlCove/crawlcove-export-spec) and carry more per page (depth, word count, content type, X-Robots-Tag-aware indexability) with no page cap — but no link graph, so `list_broken_links` lists the broken pages and points you at the app for inlinks.

## Works with CrawlCove

This server is the assistant-facing half of [Crawl Cove](https://crawlcove.com/?utm_source=github&utm_medium=crawlcove-mcp), a desktop SEO crawler for Windows and Mac. For anything past 200 pages, for history over time, for Search Console data next to the crawl, or to fix findings in bulk, run the crawl in the desktop app and hand its export to `load_export`.

## Development

```sh
npm ci && npm run build && npm test
```

`dist/` is committed (it is what `npx github:…` runs); CI fails if it is stale. The server logic is in `src/server.ts`; the pure dataset layer (`src/dataset.ts`) has no MCP dependency and is exported for scripting.

## Related tools

- [crawlcove-cli](https://github.com/CrawlCove/crawlcove-cli) — the command line crawler this server uses for live crawls.
- [crawlcove-action](https://github.com/CrawlCove/crawlcove-action) — the same checks as a GitHub Action on every PR.
- [crawlcove-export-spec](https://github.com/CrawlCove/crawlcove-export-spec) — the JSON Schema for the desktop export `load_export` reads.
- [crawl-cove-connector](https://github.com/CrawlCove/crawl-cove-connector) — WordPress plugin that applies Crawl Cove's approved fixes to Yoast, Rank Math, SEOPress or AIOSEO.
- [crawlcove-redirect-chain-checker](https://github.com/CrawlCove/crawlcove-redirect-chain-checker) — follow every hop of a URL’s redirects; flags chains, loops, HTTPS downgrades and meta refreshes.
- [crawlcove-sitemap-validator](https://github.com/CrawlCove/crawlcove-sitemap-validator) — validate an XML sitemap or sitemap index against the protocol and search-engine limits.
- [crawlcove-robots-txt-tester](https://github.com/CrawlCove/crawlcove-robots-txt-tester) — lint a robots.txt and test which URLs each crawler may fetch, with the deciding line.

## License

MIT — see [LICENSE](LICENSE).
