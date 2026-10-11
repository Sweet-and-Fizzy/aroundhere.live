import { describe, it, expect, vi } from 'vitest'
import { createModelAlerter, findUnavailableModels, isModelUnavailableError } from '../model-alerts'
import { acceptsSamplingParams, currentModel, registeredModels, MODELS } from '../models'
import { extractAnthropicText } from '../anthropic-response'

const notFound = Object.assign(new Error('404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-sonnet-4-20250514"}}'), {
  status: 404,
  error: { type: 'error', error: { type: 'not_found_error', message: 'model: claude-sonnet-4-20250514' } },
})
const rateLimited = Object.assign(new Error('429 rate limited'), { status: 429 })

describe('isModelUnavailableError', () => {
  it('flags a 404 not_found_error', () => {
    expect(isModelUnavailableError(notFound)).toBe(true)
  })
  it('does not page on model-related 400s or non-model 404s', () => {
    expect(isModelUnavailableError(Object.assign(new Error('prompt is too long for this model'), { status: 400 }))).toBe(false)
    expect(isModelUnavailableError(Object.assign(new Error('`temperature` is deprecated for this model.'), { status: 400 }))).toBe(false)
    expect(isModelUnavailableError(Object.assign(new Error('Not Found'), { status: 404 }))).toBe(false)
    expect(isModelUnavailableError(Object.assign(new Error('Not Found'), { statusCode: 404, responseBody: '<html>nginx 404</html>' }))).toBe(false)
  })
  it('flags the AI SDK APICallError shape used by the chat endpoint', () => {
    expect(isModelUnavailableError(Object.assign(new Error('Not Found'), { statusCode: 404, responseBody: '{"type":"error","error":{"type":"not_found_error"}}' }))).toBe(true)
  })
  it('ignores rate limits, other 400s, and non-errors', () => {
    expect(isModelUnavailableError(rateLimited)).toBe(false)
    expect(isModelUnavailableError(Object.assign(new Error('max_tokens too large'), { status: 400 }))).toBe(false)
    expect(isModelUnavailableError('boom')).toBe(false)
    expect(isModelUnavailableError(null)).toBe(false)
  })
})

describe('createModelAlerter', () => {
  function setup() {
    const sent: string[] = []
    let t = 0
    const report = createModelAlerter({ notify: async (m) => { sent.push(m) }, now: () => t, windowMs: 1000 })
    return { sent, report, advance: (ms: number) => { t += ms } }
  }

  it('posts once per model per window', async () => {
    const { sent, report, advance } = setup()
    await report(notFound, 'claude-sonnet-4-20250514', 'chat')
    await report(notFound, 'claude-sonnet-4-20250514', 'chat')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('claude-sonnet-4-20250514')
    expect(sent[0]).toContain('chat')
    advance(1001)
    await report(notFound, 'claude-sonnet-4-20250514', 'chat')
    expect(sent).toHaveLength(2)
  })

  it('tracks models independently and ignores non-model errors', async () => {
    const { sent, report } = setup()
    await report(notFound, 'model-a', 'x')
    await report(notFound, 'model-b', 'y')
    await report(rateLimited, 'model-c', 'z')
    expect(sent).toHaveLength(2)
  })

  it('never throws when Slack fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const report = createModelAlerter({ notify: async () => { throw new Error('slack down') } })
    await expect(report(notFound, 'm', 'c')).resolves.toBeUndefined()
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })
})

describe('findUnavailableModels', () => {
  it('returns only the models the API reports as missing', async () => {
    const result = await findUnavailableModels(['ok-model', 'gone-model'], async (m) => {
      if (m === 'gone-model') throw notFound
      return { id: m }
    })
    expect(result.unavailable.map(r => r.model)).toEqual(['gone-model'])
    expect(result.uncheckable).toEqual([])
  })
  it('keeps checking after a transient failure and never calls it a retirement', async () => {
    const result = await findUnavailableModels(['flaky', 'gone'], async (m) => {
      if (m === 'flaky') throw rateLimited
      throw notFound
    })
    expect(result.uncheckable.map(r => r.model)).toEqual(['flaky'])
    expect(result.unavailable.map(r => r.model)).toEqual(['gone'])
  })
})

describe('models registry', () => {
  it('has no retired ids and dedupes extras', () => {
    const all = registeredModels(['claude-haiku-4-5-20251001', 'extra-model'])
    expect(all).not.toContain('claude-sonnet-4-20250514')
    expect(all).toContain('extra-model')
    expect(new Set(all).size).toBe(all.length)
    expect(MODELS.chat).toBe('claude-haiku-4-5-20251001')
    expect(registeredModels([undefined, ''])).toEqual(registeredModels())
  })
  it('maps retired ids stored on old sessions to their replacements', () => {
    expect(currentModel('claude-sonnet-4-20250514')).toBe(MODELS.scraperGeneration)
    expect(currentModel('claude-3-haiku-20240307')).toBe(MODELS.classifier)
    expect(currentModel('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5-20251001')
  })
  it('knows which models reject sampling params', () => {
    expect(acceptsSamplingParams('claude-sonnet-5-5')).toBe(false)
    expect(acceptsSamplingParams('claude-opus-4-7')).toBe(false)
    expect(acceptsSamplingParams('claude-fable-5-1')).toBe(false)
    expect(acceptsSamplingParams('claude-haiku-4-5-20251001')).toBe(true)
    expect(acceptsSamplingParams('claude-sonnet-4-6')).toBe(true)
    expect(acceptsSamplingParams('claude-sonnet-4-5-20250929')).toBe(true)
  })
})

describe('extractAnthropicText', () => {
  it('joins text blocks and skips thinking blocks', () => {
    const blocks = [
      { type: 'thinking', thinking: '' },
      { type: 'text', text: 'Hello ' },
      { type: 'text', text: 'world' },
    ]
    expect(extractAnthropicText(blocks)).toBe('Hello world')
  })
  it('throws when there is no text', () => {
    const blocks = [{ type: 'thinking', thinking: '' }]
    expect(() => extractAnthropicText(blocks)).toThrow('No text')
  })
})
