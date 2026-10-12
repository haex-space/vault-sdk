import { describe, expect, it } from 'vitest'

import { isSchemaInSubset, validateInput } from '../tools/schema'

const schema = {
  type: 'object',
  properties: {
    role: { type: 'string', enum: ['inbox', 'all'] },
    limit: { type: 'integer' },
    tags: { type: 'array', items: { type: 'string' } },
    filter: { type: 'object', properties: { unread: { type: 'boolean' } }, required: ['unread'] },
  },
  required: ['role'],
} as const

describe('validateInput', () => {
  it('accepts input that fits the schema', () => {
    expect(validateInput(schema, { role: 'inbox', limit: 3, tags: ['a'], filter: { unread: true } })).toEqual({
      ok: true,
    })
  })

  it('names a missing required field', () => {
    expect(validateInput(schema, {})).toEqual({ ok: false, field: 'role', message: 'required' })
  })

  it('names a field of the wrong type', () => {
    expect(validateInput(schema, { role: 'inbox', limit: 1.5 })).toEqual({
      ok: false,
      field: 'limit',
      message: 'expected integer',
    })
  })

  it('names a value outside the enum', () => {
    expect(validateInput(schema, { role: 'spam' })).toEqual({
      ok: false,
      field: 'role',
      message: 'expected one of inbox, all',
    })
  })

  it('names a nested field and an array item', () => {
    expect(validateInput(schema, { role: 'all', filter: {} })).toEqual({
      ok: false,
      field: 'filter.unread',
      message: 'required',
    })
    expect(validateInput(schema, { role: 'all', tags: ['a', 2] })).toEqual({
      ok: false,
      field: 'tags[1]',
      message: 'expected string',
    })
  })

  it('rejects an unknown property when properties are declared', () => {
    expect(validateInput(schema, { role: 'all', colour: 'red' })).toEqual({
      ok: false,
      field: 'colour',
      message: 'unknown property',
    })
  })

  it('rejects object prototype names as unknown properties', () => {
    expect(validateInput({ type: 'object', properties: { safe: { type: 'string' } } }, { toString: 1 })).toEqual({
      ok: false,
      field: 'toString',
      message: 'unknown property',
    })
  })

  it('accepts any object when no properties are declared', () => {
    expect(validateInput({ type: 'object' }, { anything: 1 })).toEqual({ ok: true })
  })
})

describe('isSchemaInSubset', () => {
  it('accepts the subset holzi supports', () => {
    expect(isSchemaInSubset(schema)).toBe(true)
  })

  it('rejects keywords outside the subset', () => {
    expect(isSchemaInSubset({ type: 'object', properties: { n: { type: 'number', minimum: 0 } } })).toBe(false)
    expect(isSchemaInSubset({ type: 'object', additionalProperties: false })).toBe(false)
    expect(isSchemaInSubset({ type: 'null' })).toBe(false)
  })

  it('rejects required names that are not declared', () => {
    expect(isSchemaInSubset({ type: 'object', properties: {}, required: ['x'] })).toBe(false)
    expect(isSchemaInSubset({ type: 'object', properties: {}, required: ['toString'] })).toBe(false)
  })
})
