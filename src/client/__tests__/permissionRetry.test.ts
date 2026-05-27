import { describe, it, expect, vi } from 'vitest'
import {
  PermissionWaiterRegistry,
  withPermissionRetry,
  permissionKey,
} from '../permissionRetry'
import { PermissionErrorCode, type PermissionPromptError } from '../../types'

function promptError(
  resourceType = 'web',
  action = 'get',
  target = '*'
): PermissionPromptError {
  return {
    code: PermissionErrorCode.PROMPT_REQUIRED,
    message: 'permission prompt required',
    extensionId: 'ext-1',
    extensionName: 'Test',
    resourceType,
    action,
    target,
  }
}

const noop = () => {}
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))

describe('PermissionWaiterRegistry', () => {
  it('resolves all waiters for the same key with one decision', async () => {
    const reg = new PermissionWaiterRegistry()
    const a = reg.wait('k', 1000)
    const b = reg.wait('k', 1000)
    reg.resolve('k', 'granted')
    await expect(a).resolves.toBe('granted')
    await expect(b).resolves.toBe('granted')
  })

  it('resolves with "timeout" if no decision arrives', async () => {
    const reg = new PermissionWaiterRegistry()
    await expect(reg.wait('k', 10)).resolves.toBe('timeout')
  })

  it('ignores resolve for an unknown key', () => {
    const reg = new PermissionWaiterRegistry()
    expect(() => reg.resolve('nope', 'granted')).not.toThrow()
  })
})

describe('withPermissionRetry', () => {
  it('returns the result without retrying when the call succeeds', async () => {
    const reg = new PermissionWaiterRegistry()
    const send = vi.fn().mockResolvedValue('ok')
    await expect(withPermissionRetry(send, reg, noop)).resolves.toBe('ok')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('retries and succeeds after the permission is granted', async () => {
    const reg = new PermissionWaiterRegistry()
    const send = vi
      .fn()
      .mockRejectedValueOnce(promptError())
      .mockResolvedValueOnce('ok')

    const result = withPermissionRetry(send, reg, noop)
    await tick()
    reg.resolve(permissionKey('web', 'get', '*'), 'granted')

    await expect(result).resolves.toBe('ok')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('throws a PermissionDenied (1002) error when denied', async () => {
    const reg = new PermissionWaiterRegistry()
    const send = vi.fn().mockRejectedValue(promptError())

    const result = withPermissionRetry(send, reg, noop)
    await tick()
    reg.resolve(permissionKey('web', 'get', '*'), 'denied')

    await expect(result).rejects.toMatchObject({ code: PermissionErrorCode.DENIED })
  })

  it('re-throws the original prompt error on timeout', async () => {
    const reg = new PermissionWaiterRegistry()
    const send = vi.fn().mockRejectedValue(promptError())

    await expect(withPermissionRetry(send, reg, noop, 15)).rejects.toMatchObject({
      code: PermissionErrorCode.PROMPT_REQUIRED,
    })
  })

  it('re-throws non-permission errors untouched', async () => {
    const reg = new PermissionWaiterRegistry()
    const send = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(withPermissionRetry(send, reg, noop)).rejects.toThrow('boom')
    expect(send).toHaveBeenCalledTimes(1)
  })
})
