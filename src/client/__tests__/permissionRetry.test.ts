import { describe, it, expect, vi } from 'vitest'
import {
  MAX_PERMISSION_PROMPTS,
  MAX_PERMISSION_RETRIES,
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
    await Promise.resolve()
    await Promise.resolve()
    reg.resolve(permissionKey('web', 'get', '*'), 'granted')

    await expect(result).resolves.toBe('ok')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('throws a PermissionDenied (1002) error when denied', async () => {
    const reg = new PermissionWaiterRegistry()
    const send = vi.fn().mockRejectedValue(promptError())

    const result = withPermissionRetry(send, reg, noop)
    await Promise.resolve()
    await Promise.resolve()
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

  it('asks for each permission of a model job in turn, a model and a destination per step', async () => {
    const reg = new PermissionWaiterRegistry()
    const prompts = Array.from({ length: MAX_PERMISSION_PROMPTS }, (_, n) =>
      promptError(n % 2 ? 'modelDestination' : 'model', n % 2 ? 'send' : 'low', `t${n}`)
    )
    const send = vi.fn()
    for (const error of prompts) send.mockRejectedValueOnce(error)
    send.mockResolvedValueOnce({ jobId: 'j1' })

    const result = withPermissionRetry(send, reg, noop, 1000)
    for (const error of prompts) {
      await Promise.resolve()
      await Promise.resolve()
      reg.resolve(permissionKey(error.resourceType, error.action, error.target), 'granted')
    }

    await expect(result).resolves.toEqual({ jobId: 'j1' })
    expect(send).toHaveBeenCalledTimes(MAX_PERMISSION_PROMPTS + 1)
  })

  it('gives up when the same permission is asked for again and again', async () => {
    const reg = new PermissionWaiterRegistry()
    const error = promptError('model', 'low', 'm1')
    const send = vi.fn().mockRejectedValue(error)
    const key = permissionKey('model', 'low', 'm1')

    const result = withPermissionRetry(send, reg, noop, 1000)
    for (let n = 0; n < MAX_PERMISSION_RETRIES; n++) {
      await Promise.resolve()
      await Promise.resolve()
      reg.resolve(key, 'granted')
    }

    await expect(result).rejects.toEqual(error)
    expect(send).toHaveBeenCalledTimes(MAX_PERMISSION_RETRIES + 1)
  })
})
