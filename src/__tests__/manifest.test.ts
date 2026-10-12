import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readManifest } from '../manifest'
import type { ManifestTool } from '../types'

const countUnread: ManifestTool = {
  name: 'count_unread',
  title: { de: 'Ungelesene zählen', en: 'Count unread' },
  description: 'Counts unread items.',
  inputSchema: { type: 'object', properties: {} },
  effect: 'read',
  examples: { de: ['Wie viele ungelesene habe ich?'], en: ['How many unread do I have?'] },
}

let root: string | null = null

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = null
  vi.restoreAllMocks()
})

function extension(manifest: Record<string, unknown>): string {
  root = mkdtempSync(join(tmpdir(), 'vault-sdk-manifest-'))
  mkdirSync(join(root, 'haextension'))
  writeFileSync(join(root, 'haextension', 'manifest.json'), JSON.stringify(manifest))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'mail', version: '1.2.0' }))
  return root
}

describe('readManifest', () => {
  it('keeps the tools an extension offers to the agent', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const manifest = readManifest({ rootDir: extension({ publicKey: 'ab', tools: [countUnread] }) })
    expect(manifest?.tools).toEqual([countUnread])
  })

  it('has no tools when the manifest declares none', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const manifest = readManifest({ rootDir: extension({ publicKey: 'ab' }) })
    expect(manifest?.tools ?? null).toBeNull()
  })
})
