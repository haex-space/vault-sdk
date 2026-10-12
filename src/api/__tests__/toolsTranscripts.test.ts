import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { ManifestTool } from '../../types'
import { ToolsServer, type ToolHandler } from '../tools/server'

/** JSON-RPC as the tests read it: deep, untyped access to recorded messages. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

/** One line of a holzi transcript (`transcripts/README.md`). */
type Line = { dir: 'c2s' | 's2c'; message: Json }

function transcript(name: string): Line[] {
  return readFileSync(join(__dirname, 'transcripts', `${name}.jsonl`), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Line)
}

const text = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } as const

/** The tools of holzi's in-memory server, as an extension would declare them. */
const manifestTools: ManifestTool[] = [
  { name: 'echo', description: 'Echoes the given text back', inputSchema: text },
  { name: 'slow', description: 'Waits until it is cancelled', inputSchema: text },
  { name: 'fail', description: 'Always fails', inputSchema: { type: 'object' as const } },
].map((tool) => ({
  ...tool,
  title: { de: tool.name, en: tool.name },
  effect: 'read' as const,
  examples: { de: [tool.name], en: [tool.name] },
}))

type Started = { aborted: boolean }

/** Lets started tool calls finish; `receive` does not wait for them. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

function server() {
  const sent: Json[] = []
  const slow: Started[] = []
  const handlers = new Map<string, ToolHandler>([
    ['echo', (input) => String(input.text)],
    [
      'slow',
      (_input, { signal }) =>
        new Promise((_resolve, reject) => {
          const started: Started = { aborted: false }
          slow.push(started)
          signal.addEventListener('abort', () => {
            started.aborted = true
            reject(new Error('cancelled'))
          })
        }),
    ],
    [
      'fail',
      () => {
        throw new Error('the tool failed')
      },
    ],
  ])
  const tools = new ToolsServer({
    manifest: { name: 'agent-tools', version: '1.0.0', publicKey: 'ab', permissions: {}, tools: manifestTools },
    handlers,
    send: (message) => sent.push(message),
  })
  return { tools, sent, slow }
}

/** Feeds every `c2s` line and returns what the server sent, waiting for pending handlers. */
async function replay(name: string) {
  const s = server()
  for (const line of transcript(name)) {
    if (line.dir === 'c2s') await s.tools.receive(line.message)
  }
  await settle()
  return s
}

function expectedReplies(name: string) {
  return transcript(name)
    .filter((line) => line.dir === 's2c')
    .map((line) => line.message)
}

describe('ToolsServer replays holzi transcripts', () => {
  it('handshake: answers initialize with the requested version and the tools capability', async () => {
    const { sent } = await replay('handshake')
    const [expected] = expectedReplies('handshake')
    expect(sent).toHaveLength(1)
    expect(sent[0].id).toBe(expected.id)
    expect(sent[0].result.protocolVersion).toBe(expected.result.protocolVersion)
    expect(sent[0].result.capabilities).toEqual(expected.result.capabilities)
    expect(sent[0].result.serverInfo).toEqual({ name: 'agent-tools', version: '1.0.0' })
  })

  it('list: lists the declared tools with name, description and schema', async () => {
    const { sent } = await replay('list')
    const [expected] = expectedReplies('list')
    expect(sent[0].id).toBe(expected.id)
    const pick = (tools: Json[]) =>
      tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
    expect(pick(sent[0].result.tools)).toEqual(pick(expected.result.tools))
  })

  it('call-ok: returns the text of the handler', async () => {
    const { sent } = await replay('call-ok')
    expect(sent).toEqual(expectedReplies('call-ok'))
  })

  it('call-invalid-input: reports a tool error naming the field, without running the handler', async () => {
    const { sent } = await replay('call-invalid-input')
    const [expected] = expectedReplies('call-invalid-input')
    expect(sent[0].id).toBe(expected.id)
    expect(sent[0].result.isError).toBe(true)
    expect(sent[0].result.content).toEqual([{ type: 'text', text: 'invalid input: text: required' }])
  })

  it('call-error: reports what the handler threw as a tool error', async () => {
    const { sent } = await replay('call-error')
    expect(sent).toEqual(expectedReplies('call-error'))
  })

  it('call-cancelled: aborts the running handler and does not answer the cancelled call', async () => {
    const { sent, slow } = await replay('call-cancelled')
    expect(slow).toEqual([{ aborted: true }])
    expect(sent).toEqual([])
  })

  it('server-request-rejected: ignores a response to a request it never sent', async () => {
    const { sent } = await replay('server-request-rejected')
    expect(sent).toEqual([])
  })
})

describe('ToolsServer', () => {
  it('answers ping and refuses every other unknown request with method not found', async () => {
    const { tools, sent } = server()
    await tools.receive({ jsonrpc: '2.0', id: 1, method: 'ping' })
    await tools.receive({ jsonrpc: '2.0', id: 2, method: 'resources/list' })
    await tools.receive({ jsonrpc: '2.0', method: 'notifications/unknown' })
    expect(sent).toEqual([
      { jsonrpc: '2.0', id: 1, result: {} },
      { jsonrpc: '2.0', id: 2, error: { code: -32601, message: 'resources/list' } },
    ])
  })

  it('refuses a call of a tool that is not declared or has no handler', async () => {
    const { tools, sent } = server()
    await tools.receive({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nope', arguments: {} } })
    await settle()
    expect(sent[0]).toMatchObject({ id: 3, error: { code: -32602 } })
  })

  it('lists only declared tools that have a handler', async () => {
    const s = server()
    const tools = new ToolsServer({
      manifest: { name: 'x', version: '1.0.0', publicKey: 'ab', permissions: {}, tools: manifestTools },
      handlers: new Map([['echo', () => 'hi']]),
      send: (message) => s.sent.push(message),
    })
    await tools.receive({ jsonrpc: '2.0', id: 4, method: 'tools/list' })
    expect(s.sent[0].result.tools.map((tool: { name: string }) => tool.name)).toEqual(['echo'])
  })

  it('returns an object result as JSON text', async () => {
    const sent: Json[] = []
    const tools = new ToolsServer({
      manifest: { name: 'x', version: '1.0.0', publicKey: 'ab', permissions: {}, tools: manifestTools },
      handlers: new Map([['echo', () => ({ unread: 3 })]]),
      send: (message) => sent.push(message),
    })
    await tools.receive({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'echo', arguments: { text: 'x' } },
    })
    await settle()
    expect(sent[0].result).toEqual({ content: [{ type: 'text', text: '{"unread":3}' }], isError: false })
  })
})
