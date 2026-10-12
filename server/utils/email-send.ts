import type { CreateEmailOptions, CreateEmailResponse, ErrorResponse } from 'resend'

/**
 * Resend v6 resolves with `{ data, error }` instead of throwing, so a rejected
 * key, unverified domain or exhausted quota looked like a successful send.
 * The checked sender reports the error and throws, so callers' existing
 * catch blocks see the failure.
 */
export function createCheckedSend(
  send: (options: CreateEmailOptions) => Promise<CreateEmailResponse>,
  report: (kind: string, error: ErrorResponse) => Promise<void>,
) {
  return async function sendEmail(kind: string, options: CreateEmailOptions) {
    const { data, error } = await send(options)
    if (error) {
      await report(kind, error)
      throw new Error(`Resend ${error.name}: ${error.message}`)
    }
    return data
  }
}
