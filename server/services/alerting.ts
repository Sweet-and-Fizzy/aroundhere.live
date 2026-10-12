/**
 * Loud failures: Slack alerts for problems that otherwise only reach the logs.
 * Each kind is deduped per key so a persistent failure posts a few times a
 * day at most, not on every request.
 */

import { sendSlackNotification } from './notifications'
import { createDedupedAlerter, classifyProviderError } from '../utils/alerts'

const HOUR = 60 * 60 * 1000
const notify = (message: string) => sendSlackNotification(message)

const providerAlert = createDedupedAlerter({ notify, windowMs: 6 * HOUR })
const emailAlert = createDedupedAlerter({ notify, windowMs: HOUR })
const cronAlert = createDedupedAlerter({ notify, windowMs: 6 * HOUR })

const PROVIDER_KEYS = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' } as const

/** Call from any catch around an Anthropic or OpenAI request; ignores errors that are not account problems. */
export async function reportProviderFailure(provider: keyof typeof PROVIDER_KEYS, caller: string, error: unknown): Promise<void> {
  const problem = classifyProviderError(error)
  if (!problem) return
  const name = provider === 'anthropic' ? 'Anthropic' : 'OpenAI'
  const what = problem === 'auth'
    ? `${name} rejected our API key. Check ${PROVIDER_KEYS[provider]} in /opt/local-music/.env.`
    : `${name} account is out of credit or quota. Top up billing.`
  const detail = error instanceof Error ? error.message : String(error)
  await providerAlert(`${provider}:${problem}`, `:rotating_light: ${what} (seen in ${caller})\n${detail.slice(0, 300)}`)
}

export async function reportEmailFailure(kind: string, error: { name?: string; message: string; statusCode?: number | null }): Promise<void> {
  // 422 is a bad recipient address someone typed (e.g. at sign-in), not an outage; anyone could trigger it
  if (error.statusCode === 422) return
  await emailAlert(`email:${error.name ?? 'unknown'}:${error.statusCode ?? ''}`, `:email: Email send failed (${kind}): ${error.name ?? 'error'}: ${error.message.slice(0, 300)}`)
}

export async function reportCronFailure(name: string, status: number, error: string | null): Promise<void> {
  await cronAlert(`cron:${name}`, `:rotating_light: Cron job \`${name}\` failed with ${status}${error ? `: ${error.slice(0, 300)}` : ''}`)
}
