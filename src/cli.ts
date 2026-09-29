#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

const { server } = createServer()
const transport = new StdioServerTransport()
await server.connect(transport)
// stdout is the protocol channel; anything human-facing goes to stderr.
console.error('crawlcove-mcp ready (stdio). Tools: crawl_site, load_export, get_issues, get_page, list_broken_links, list_pages')
