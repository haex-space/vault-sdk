import { describe, it, expect } from 'vitest'
import { WebAPI } from '../web'
import type { HaexVaultSdk } from '../../client'

/** Captures the args passed to `client.request` so we can assert on the body. */
function makeWebApi() {
  const calls: Array<Record<string, unknown>> = []
  const fakeClient = {
    request: async (_command: string, args: Record<string, unknown>) => {
      calls.push(args)
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: '', // empty base64 → empty ArrayBuffer
        url: 'https://example.test',
      }
    },
  } as unknown as HaexVaultSdk
  return { web: new WebAPI(fakeClient), calls }
}

function decodeBase64(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf8')
}

describe('WebAPI request body encoding', () => {
  it('base64-encodes a string body (host always decodes from base64)', async () => {
    const { web, calls } = makeWebApi()
    const xml = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"/>'

    await web.fetchAsync('https://dav.example.test', { method: 'PROPFIND', body: xml })

    expect(calls).toHaveLength(1)
    const sentBody = calls[0]!.body as string
    // Must NOT be the raw string — symbol '<' (0x3C) is invalid base64 and
    // is exactly what broke the host decode previously.
    expect(sentBody).not.toBe(xml)
    expect(decodeBase64(sentBody)).toBe(xml)
  })

  it('base64-encodes UTF-8 multibyte string bodies correctly', async () => {
    const { web, calls } = makeWebApi()
    const body = 'SUMMARY:Tschüss — café ☕'

    await web.fetchAsync('https://dav.example.test', { method: 'PUT', body })

    expect(decodeBase64(calls[0]!.body as string)).toBe(body)
  })

  it('omits the body param when no body is given', async () => {
    const { web, calls } = makeWebApi()

    await web.fetchAsync('https://dav.example.test', { method: 'GET' })

    expect(calls[0]!.body).toBeUndefined()
  })
})
