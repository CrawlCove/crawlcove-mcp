# Changelog

## 1.0.0 — 2026-09-29

Initial release. Stdio MCP server with six tools:

- `crawl_site` — live crawl (same-origin, robots.txt respected, capped at 200
  pages) via [crawlcove-cli](https://github.com/CrawlCove/crawlcove-cli)'s
  crawler; becomes the active dataset.
- `load_export` — load a Crawl Cove desktop JSON export
  ([crawlcove-export-spec](https://github.com/CrawlCove/crawlcove-export-spec))
  or a crawlcove-cli JSON result from disk.
- `get_issues` — 11 issue types (broken pages, missing/long/duplicate titles,
  missing/long meta descriptions, missing/multiple H1, noindex, redirect
  chains, missing canonical), filterable by type.
- `get_page` — everything recorded about one URL, tolerant of a missing
  scheme or trailing slash.
- `list_broken_links` — source → target pairs (live/CLI datasets) or the
  broken pages (desktop export, which carries no link graph).
- `list_pages` — filter by status, indexability, URL substring.

Every tool returns readable text plus `structuredContent`.
