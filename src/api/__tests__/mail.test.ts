import { describe, it, expect } from 'vitest'
import { MailAPI } from '../mail'
import { MAIL_COMMANDS } from '../../commands/mail'
import type { HaexVaultSdk } from '../../client'
import type { ImapConfig } from '../../types/mail'

/** Captures the command and args passed to `client.request`. */
function makeMailApi() {
  const calls: Array<{ command: string; args: Record<string, unknown> }> = []
  const fakeClient = {
    request: async (command: string, args: Record<string, unknown>) => {
      calls.push({ command, args })
      return undefined
    },
  } as unknown as HaexVaultSdk
  return { mail: new MailAPI(fakeClient), calls }
}

const imap: ImapConfig = {
  host: 'imap.example.test',
  port: 993,
  security: 'tls',
  username: 'user@example.test',
  password: 'secret',
}

describe('MailAPI.startWatchingAsync', () => {
  it('sends the imap config with the watch', async () => {
    const { mail, calls } = makeMailApi()

    await mail.startWatchingAsync('acc-1', 'INBOX', 300, imap)

    expect(calls).toEqual([
      {
        command: MAIL_COMMANDS.startWatch,
        args: { accountId: 'acc-1', mailboxName: 'INBOX', intervalSeconds: 300, imap },
      },
    ])
  })

  it('leaves imap out for hosts that resolve the credentials from accountId', async () => {
    const { mail, calls } = makeMailApi()

    await mail.startWatchingAsync('acc-1', 'INBOX', 300)

    // JSON drops undefined fields, so the host sees no `imap` key at all.
    expect(JSON.parse(JSON.stringify(calls[0]!.args))).toEqual({
      accountId: 'acc-1',
      mailboxName: 'INBOX',
      intervalSeconds: 300,
    })
  })
})
