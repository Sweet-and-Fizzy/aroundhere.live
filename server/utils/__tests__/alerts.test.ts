import { describe, it, expect } from 'vitest'
import { createDedupedAlerter, classifyProviderError } from '../alerts'

describe('createDedupedAlerter', () => {
  it('sends once per key per window', async () => {
    const sent: string[] = []
    let t = 0
    const alert = createDedupedAlerter({ notify: async m => { sent.push(m) }, now: () => t, windowMs: 1000 })
    expect(await alert('a', 'first')).toBe(true)
    expect(await alert('a', 'again')).toBe(false)
    expect(await alert('b', 'other key')).toBe(true)
    t = 1000
    expect(await alert('a', 'after window')).toBe(true)
    expect(sent).toEqual(['first', 'other key', 'after window'])
  })

  it('never throws when Slack fails', async () => {
    const alert = createDedupedAlerter({ notify: async () => { throw new Error('slack down') }, windowMs: 1000 })
    await expect(alert('a', 'msg')).resolves.toBe(true)
  })
})

describe('classifyProviderError', () => {
  it('recognizes a rejected Anthropic key', () => {
    expect(classifyProviderError({ status: 401, error: { type: 'error', error: { type: 'authentication_error' } } })).toBe('auth')
  })

  it('recognizes an empty Anthropic balance', () => {
    expect(classifyProviderError({ status: 400, message: '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}' })).toBe('billing')
  })

  it('recognizes OpenAI quota and key errors', () => {
    expect(classifyProviderError({ status: 429, code: 'insufficient_quota', message: 'You exceeded your current quota' })).toBe('billing')
    expect(classifyProviderError({ status: 401, code: 'invalid_api_key' })).toBe('auth')
  })

  it('recognizes AI SDK errors from chat', () => {
    expect(classifyProviderError({ statusCode: 401, responseBody: '{"type":"error","error":{"type":"authentication_error"}}' })).toBe('auth')
  })

  it('ignores transient and unrelated errors', () => {
    expect(classifyProviderError({ status: 429, code: 'rate_limit_exceeded' })).toBeNull()
    expect(classifyProviderError({ status: 529, error: { error: { type: 'overloaded_error' } } })).toBeNull()
    expect(classifyProviderError({ status: 404, error: { error: { type: 'not_found_error' } } })).toBeNull()
    expect(classifyProviderError(new Error('fetch failed'))).toBeNull()
    expect(classifyProviderError('nope')).toBeNull()
  })
})
