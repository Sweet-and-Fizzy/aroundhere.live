/**
 * Loud failure for retired or unknown models: post to Slack (deduped per
 * model) instead of letting callers swallow the error silently.
 */

type AlertDeps = {
  notify: (message: string) => Promise<void>
  now?: () => number
  windowMs?: number
}

/** A 404 from a model call means the model id no longer exists. */
export function isModelUnavailableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  // Anthropic SDK errors carry `status`; AI SDK (Vercel) errors carry `statusCode` + `responseBody`.
  const e = error as { status?: unknown; statusCode?: unknown; message?: unknown; responseBody?: unknown; error?: { error?: { type?: unknown } } }
  const status = e.status ?? e.statusCode
  if (status === 404) return true
  if (e.error?.error?.type === 'not_found_error') return true
  if (typeof e.responseBody === 'string' && e.responseBody.includes('not_found_error')) return true
  return status === 400 && typeof e.message === 'string' && /\bmodel\b/i.test(e.message)
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

/** Models the Models API no longer knows about. `retrieve` rejects with a 404 for retired ids. */
export async function findUnavailableModels(
  models: string[],
  retrieve: (model: string) => Promise<unknown>,
): Promise<{ model: string; error: string }[]> {
  const unavailable: { model: string; error: string }[] = []
  for (const model of models) {
    try {
      await retrieve(model)
    } catch (error) {
      if (isModelUnavailableError(error)) {
        unavailable.push({ model, error: error instanceof Error ? error.message : String(error) })
      } else {
        throw error
      }
    }
  }
  return unavailable
}
