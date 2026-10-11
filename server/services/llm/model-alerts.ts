/**
 * Loud failure for retired or unknown models: post to Slack (deduped per
 * model) instead of letting callers swallow the error silently.
 */

type AlertDeps = {
  notify: (message: string) => Promise<void>
  now?: () => number
  windowMs?: number
}

/**
 * The API's answer for a retired or unknown model id: a 404 not_found_error.
 * Other 404s (bad base URL, proxy) and model-related 400s (prompt too long,
 * unsupported parameter) are different problems and must not page as retirements.
 */
export function isModelUnavailableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  // Anthropic SDK errors carry `status` + parsed `error`; AI SDK (Vercel) errors carry `statusCode` + raw `responseBody`.
  const e = error as { status?: unknown; statusCode?: unknown; responseBody?: unknown; error?: { error?: { type?: unknown } } }
  const status = e.status ?? e.statusCode
  if (status !== 404) return false
  if (e.error?.error?.type === 'not_found_error') return true
  return typeof e.responseBody === 'string' && e.responseBody.includes('not_found_error')
}

export function createModelAlerter({ notify, now = Date.now, windowMs = 6 * 60 * 60 * 1000 }: AlertDeps) {
  const lastSent = new Map<string, number>()

  return async function reportModelFailure(error: unknown, model: string, caller: string): Promise<void> {
    if (!isModelUnavailableError(error)) return
    const t = now()
    const prev = lastSent.get(model)
    if (prev !== undefined && t - prev < windowMs) return
    lastSent.set(model, t)
    const detail = error instanceof Error ? error.message : String(error)
    try {
      await notify(`:rotating_light: LLM model unavailable: \`${model}\` (used by ${caller}). Update server/services/llm/models.ts.\n${detail.slice(0, 300)}`)
    } catch (notifyError) {
      console.error('[LLM] Failed to send model alert:', notifyError)
    }
  }
}

/**
 * Models the Models API no longer knows about. Transient failures (429, 5xx)
 * are collected separately so one hiccup doesn't hide the remaining checks.
 */
export async function findUnavailableModels(
  models: string[],
  retrieve: (model: string) => Promise<unknown>,
): Promise<{ unavailable: { model: string; error: string }[]; uncheckable: { model: string; error: string }[] }> {
  const unavailable: { model: string; error: string }[] = []
  const uncheckable: { model: string; error: string }[] = []
  for (const model of models) {
    try {
      await retrieve(model)
    } catch (error) {
      const entry = { model, error: error instanceof Error ? error.message : String(error) }
      if (isModelUnavailableError(error)) unavailable.push(entry)
      else uncheckable.push(entry)
    }
  }
  return { unavailable, uncheckable }
}
