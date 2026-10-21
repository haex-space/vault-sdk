import { describe, it, expect } from 'vitest'
import { MailAPI } from '../mail'
import { MAIL_COMMANDS } from '../../commands/mail'
import type { HaexVaultSdk } from '../../client'
import type { ImapConfig, MailSearchCriteria } from '../../types/mail'

/** Captures the command and args passed to `client.request`; `answer` is what the host replies. */
function makeMailApi(answer?: unknown) {
  const calls: Array<{ command: string; args: Record<string, unknown> }> = []
  const fakeClient = {
    request: async (command: string, args: Record<string, unknown>) => {
      calls.push({ command, args })
      return answer
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

describe('MailAPI.searchMessagesAsync', () => {
  it('sends the criteria as an object and returns the host answer', async () => {
    const criteria: MailSearchCriteria = { subject: 'Rechnung', unseen: true, since: '2026-01-01' }
    const { mail, calls } = makeMailApi({ uids: [12, 9], total: 2 })

    const result = await mail.searchMessagesAsync(imap, 'INBOX', criteria)

    expect(result).toEqual({ uids: [12, 9], total: 2 })
    expect(calls).toEqual([
      { command: MAIL_COMMANDS.search, args: { imap, mailbox: 'INBOX', criteria, limit: undefined } },
    ])
  })

  it('passes a limit when one is asked for', async () => {
    const { mail, calls } = makeMailApi({ uids: [], total: 0 })

    await mail.searchMessagesAsync(imap, 'INBOX', { text: 'x' }, 25)

    expect(calls[0]!.args).toMatchObject({ limit: 25 })
  })
})

describe('MailAPI.createMailboxAsync', () => {
  it('names the mailbox and says whether it was created', async () => {
    const { mail, calls } = makeMailApi({ created: false })

    await expect(mail.createMailboxAsync(imap, 'Steuer')).resolves.toBe(false)

    expect(calls).toEqual([
      { command: MAIL_COMMANDS.createMailbox, args: { imap, mailbox: 'Steuer' } },
    ])
  })

  it('reports a new mailbox as created', async () => {
    const { mail } = makeMailApi({ created: true })

    await expect(mail.createMailboxAsync(imap, 'Steuer')).resolves.toBe(true)
  })
})

describe('MailAPI.deleteMessagesAsync', () => {
  it('names the mailbox and exactly the UIDs to delete', async () => {
    const { mail, calls } = makeMailApi()

    await mail.deleteMessagesAsync(imap, 'INBOX', [9, 12])

    expect(calls).toEqual([
      { command: MAIL_COMMANDS.deleteMessages, args: { imap, mailbox: 'INBOX', uids: [9, 12] } },
    ])
  })
})

describe('mail commands', () => {
  it('keep the names the host registers', () => {
    expect(MAIL_COMMANDS.search).toBe('extension_mail_search')
    expect(MAIL_COMMANDS.createMailbox).toBe('extension_mail_create_mailbox')
    expect(MAIL_COMMANDS.deleteMessages).toBe('extension_mail_delete_messages')
  })
})
