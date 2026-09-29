import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, MAX_LIVE_PAGES } from '../src/server.js'

const cliFixturePath = fileURLToPath(new URL('./fixtures/cli-result.json', import.meta.url))
const desktopFixturePath = fileURLToPath(new URL('./fixtures/desktop-export.json', import.meta.url))
const cliFixture = JSON.parse(readFileSync(cliFixturePath, 'utf8'))

type ToolResult = { content: Array<{ type: string; text?: string }>; structuredContent?: Record<string, unknown>; isError?: boolean }

describe('crawlcove MCP server over an in-memory transport', () => {
  let client: Client
  let crawlCalls: Array<{ url: string; maxPages: number; ignoreRobots: boolean }>

  beforeEach(async () => {
    crawlCalls = []
    const { server } = createServer({
      crawl: (async (url: string, opts: { maxPages: number; ignoreRobots: boolean }) => {
        crawlCalls.push({ url, maxPages: opts.maxPages, ignoreRobots: opts.ignoreRobots })
        return { ...cliFixture, seedUrl: url }
      }) as never,
      now: () => new Date('2026-09-29T01:00:00.000Z')
    })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    client = new Client({ name: 'test', version: '0.0.0' })
    await client.connect(clientTransport)
  })

  afterEach(async () => {
    await client.close()
  })

  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }) as Promise<ToolResult>
  const textOf = (r: ToolResult) => r.content.map((c) => c.text ?? '').join('\n')

  it('advertises the six tools', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['crawl_site', 'get_issues', 'get_page', 'list_broken_links', 'list_pages', 'load_export'])
  })

  it('query tools explain what to do when nothing is loaded', async () => {
    const r = await call('get_issues')
    expect(r.isError).toBe(true)
    expect(textOf(r)).toMatch(/No crawl data loaded yet/)
  })

  it('crawl_site uses the default page cap, records the dataset, and reports issue counts', async () => {
    const r = await call('crawl_site', { url: 'https://acme.test/' })
    expect(r.isError).toBeUndefined()
    expect(crawlCalls).toEqual([{ url: 'https://acme.test/', maxPages: 50, ignoreRobots: false }])
    expect(textOf(r)).toMatch(/live crawl of https:\/\/acme.test\/: 6 pages, 11 issues/)
    expect(r.structuredContent).toMatchObject({ pageCount: 6, robotsBlocked: 1 })
  })

  it('crawl_site rejects an invalid URL and an over-cap maxPages at the schema boundary', async () => {
    const bad = await call('crawl_site', { url: 'not a url' })
    expect(bad.isError).toBe(true)
    const over = await call('crawl_site', { url: 'https://acme.test/', maxPages: MAX_LIVE_PAGES + 1 })
    expect(over.isError).toBe(true)
    expect(crawlCalls).toEqual([])
  })

  it('load_export reads a crawlcove-cli file and a desktop export, then get_issues / get_page / list_broken_links answer from it', async () => {
    const loaded = await call('load_export', { path: cliFixturePath })
    expect(textOf(loaded)).toMatch(/crawlcove-cli result .*cli-result.json: 6 pages/)

    const issues = await call('get_issues', { type: 'missing-title' })
    expect(textOf(issues)).toMatch(/1 missing-title issue\(s\)/)
    expect(textOf(issues)).toMatch(/https:\/\/acme.test\/about/)

    const page = await call('get_page', { url: 'acme.test/about' })
    expect(textOf(page)).toMatch(/Title: \(none\)/)
    expect(textOf(page)).toMatch(/Issues: missing-title, missing-meta-description, missing-h1, missing-canonical/)

    const links = await call('list_broken_links')
    expect(textOf(links)).toMatch(/1 broken internal link\(s\)/)
    expect(textOf(links)).toMatch(/https:\/\/acme.test\/ → https:\/\/acme.test\/missing \(HTTP 404\)/)

    const desktop = await call('load_export', { path: desktopFixturePath })
    expect(textOf(desktop)).toMatch(/Crawl Cove desktop export .*: 7 pages/)
    const noGraph = await call('list_broken_links')
    expect(textOf(noGraph)).toMatch(/no link graph/)
    expect(noGraph.structuredContent).toMatchObject({ hasLinkGraph: false })
  })

  it('load_export fails cleanly on a missing file or the wrong shape', async () => {
    const missing = await call('load_export', { path: '/nonexistent/file.json' })
    expect(missing.isError).toBe(true)
    expect(textOf(missing)).toMatch(/Could not read/)
    const { server } = createServer({ readFile: () => '{"hello":"world"}' })
    const [ct, st] = InMemoryTransport.createLinkedPair()
    await server.connect(st)
    const c2 = new Client({ name: 't2', version: '0' })
    await c2.connect(ct)
    const wrong = (await c2.callTool({ name: 'load_export', arguments: { path: 'x.json' } })) as ToolResult
    expect(wrong.isError).toBe(true)
    expect(textOf(wrong)).toMatch(/neither a Crawl Cove desktop export/)
    await c2.close()
  })

  it('get_page reports an unknown URL and list_pages filters', async () => {
    await call('load_export', { path: cliFixturePath })
    const nope = await call('get_page', { url: 'https://acme.test/zzz' })
    expect(nope.isError).toBe(true)
    const pages = await call('list_pages', { status: 404 })
    expect(textOf(pages)).toMatch(/1 of 6 pages match/)
    expect(pages.structuredContent).toMatchObject({ total: 1 })
  })
})

describe('the built stdio binary', () => {
  it('starts, lists tools, and loads an export over stdio', async () => {
    const transport = new StdioClientTransport({ command: 'node', args: [fileURLToPath(new URL('../dist/cli.js', import.meta.url))] })
    const client = new Client({ name: 'stdio-test', version: '0' })
    await client.connect(transport)
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(6)
    const r = (await client.callTool({ name: 'load_export', arguments: { path: desktopFixturePath } })) as ToolResult
    expect(r.content[0].text).toMatch(/7 pages/)
    await client.close()
  }, 20_000)
})
