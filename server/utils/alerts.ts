/**
 * Slack alerts that fire once per problem per window instead of on every
 * occurrence, so a persistent failure stays visible without drowning the channel.
 */

export type Notify = (message: string) => Promise<void>

export function createDedupedAlerter({ notify, now = Date.now, windowMs }: { notify: Notify; now?: () => number; windowMs: number }) {
  const lastSent = new Map<string, number>()

  /** Returns true when the alert was sent (not suppressed). Never throws. */
  return async function alert(key: string, message: string): Promise<boolean> {
    const t = now()
    const prev = lastSent.get(key)
    if (prev !== undefined && t - prev < windowMs) return false
    lastSent.set(key, t)
    try {
      await notify(message)
    } catch (error) {
      console.error(`[Alerts] Failed to send alert ${key}:`, error)
    }
    return true
  }
}

export type ProviderProblem = 'auth' | 'billing'

/**
 * Errors that mean every call will keep failing until someone fixes the
 * account: a rejected key or an empty balance. Transient 429s and 5xx are not.
 * Handles Anthropic SDK (`status`, `error.error.type`), OpenAI SDK (`status`,
 * `code`) and Vercel AI SDK (`statusCode`, `responseBody`) error shapes.
 */
export function classifyProviderError(error: unknown): ProviderProblem | null {
  if (typeof error !== 'object' || error === null) return null
  const e = error as { status?: unknown; statusCode?: unknown; message?: unknown; code?: unknown; responseBody?: unknown; error?: { type?: unknown; code?: unknown; error?: { type?: unknown } } }
  const status = e.status ?? e.statusCode
  const text = [e.message, e.code, e.responseBody, e.error?.type, e.error?.code, e.error?.error?.type]
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
    .toLowerCase()
  if (/credit balance is too low|insufficient_quota|billing_error/.test(text)) return 'billing'
  if (status === 401 || status === 403 || /authentication_error|permission_error|invalid_api_key|invalid x-api-key/.test(text)) return 'auth'
  return null
}
