/**
 * @vitest-environment happy-dom
 *
 * `sdk.tools`: registering handlers for the tools of the manifest, and the MCP round trip over a
 * real `MessageChannel` through the same event path the SDK uses for every port message.
 */
import { describe, expect, it } from 'vitest'

import { processEvent } from '../../client/events'
import { HAEXSPACE_MESSAGE_TYPES } from '../../messages'
import type { ExtensionManifest, HaexHubEvent } from '../../types'
import { ToolsAPI } from '../tools'

const manifest: ExtensionManifest = {
  name: 'mail',
  version: '1.0.0',
  publicKey: 'ab',
  permissions: {},
  tools: [
    {
      name: 'count_unread',
      title: { de: 'Ungelesene zählen', en: 'Count unread' },
      description: 'Counts unread mails.',
      inputSchema: { type: 'object', properties: {} },
      effect: 'read',
      examples: { de: ['Wie viele ungelesene Mails habe ich?'], en: ['How many unread mails?'] },
    },
  ],
}

describe('ToolsAPI.register', () => {
  it('refuses a tool the manifest does not declare', () => {
    const tools = new ToolsAPI({ manifest: () => manifest, send: () => {} })
    expect(() => tools.register('delete_all', () => 'x')).toThrow(/not declared/)
  })

  it('stops offering a tool once it is unregistered', async () => {
    const sent: Record<string, unknown>[] = []
    const tools = new ToolsAPI({ manifest: () => manifest, send: (message) => sent.push(message) })
    const unregister = tools.register('count_unread', () => 3)
    unregister()
    await tools.receive({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(sent).toEqual([{ jsonrpc: '2.0', id: 1, result: { tools: [] } }])
  })
})

describe('sdk.tools over the port', () => {
  it('answers a tools/call from the host on the same port', async () => {
    const channel = new MessageChannel()
    const host = channel.port1
    const extension = channel.port2

    const tools = new ToolsAPI({
      manifest: () => manifest,
      send: (message) => extension.postMessage({ type: HAEXSPACE_MESSAGE_TYPES.MCP, message }),
    })
    tools.register('count_unread', () => ({ unread: 3 }))
    extension.addEventListener('message', (event: MessageEvent) =>
      processEvent(
        event.data as HaexHubEvent,
        () => {},
        new Map(),
        () => {},
        () => {},
        undefined,
        (message) => void tools.receive(message),
      ),
    )
    extension.start()

    const reply = new Promise<Record<string, unknown>>((resolve) => {
      host.addEventListener('message', (event: MessageEvent) => resolve(event.data))
    })
    host.start()
    host.postMessage({
      type: HAEXSPACE_MESSAGE_TYPES.MCP,
      message: { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'count_unread', arguments: {} } },
    })

    expect(await reply).toEqual({
      type: HAEXSPACE_MESSAGE_TYPES.MCP,
      message: {
        jsonrpc: '2.0',
        id: 7,
        result: { content: [{ type: 'text', text: '{"unread":3}' }], isError: false },
      },
    })
    host.close()
    extension.close()
  })
})
