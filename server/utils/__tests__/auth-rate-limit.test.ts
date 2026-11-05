import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRequestIP, type H3Event } from 'h3'
import { enforceAuthRateLimit } from '../auth-rate-limit'

vi.mock('h3', async importOriginal => ({
  ...(await importOriginal<typeof import('h3')>()),
  getRequestIP: vi.fn(),
}))

const event = {} as H3Event
const ip = vi.mocked(getRequestIP)
let run = 0
const attempt = (email: string) => () => enforceAuthRateLimit(event, 'magic-link', email)

beforeEach(() => {
  run++
  ip.mockReturnValue(`10.0.0.${run}`)
})

describe('enforceAuthRateLimit', () => {
  it('allows 3 requests an hour for one address, then returns 429', () => {
    const check = attempt(`a${run}@x.test`)
    check(); check(); check()
    expect(check).toThrowError(expect.objectContaining({ statusCode: 429 }))
  })

  it('limits one address across different IPs', () => {
    const email = `b${run}@x.test`
    for (const n of [1, 2, 3]) {
      ip.mockReturnValue(`10.1.${run}.${n}`)
      attempt(email)()
    }
    ip.mockReturnValue(`10.1.${run}.4`)
    expect(attempt(email)).toThrowError(expect.objectContaining({ statusCode: 429 }))
  })

  it('allows 10 requests an hour from one IP across addresses, then returns 429', () => {
    for (let n = 0; n < 10; n++) attempt(`c${run}-${n}@x.test`)()
    expect(attempt(`c${run}-last@x.test`)).toThrowError(expect.objectContaining({ statusCode: 429 }))
  })

  it('counts each action separately', () => {
    const email = `d${run}@x.test`
    const check = attempt(email)
    check(); check(); check()
    expect(() => enforceAuthRateLimit(event, 'register', email)).not.toThrow()
  })

  it('still limits by address when the IP is unknown', () => {
    ip.mockReturnValue(undefined)
    const check = attempt(`e${run}@x.test`)
    check(); check(); check()
    expect(check).toThrowError(expect.objectContaining({ statusCode: 429 }))
  })
})
