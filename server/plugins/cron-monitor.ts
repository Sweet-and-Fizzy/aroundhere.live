/**
 * Records the outcome of every /api/cron/* request in cron_runs and posts to
 * Slack when one fails, so a crashed job is noticed even though the crontab's
 * `curl -s` discards the response. The daily digest reads cron_runs to catch
 * jobs that stopped running altogether. Handlers need no changes.
 *
 * Thrown errors arrive through the `error` hook (Nitro's error handler marks the
 * response handled, so `afterResponse` does not fire for them); everything else
 * through `afterResponse`. 401/403/404/405 are ignored: those are
 * unauthenticated or mistyped requests, not job failures, and anyone can send
 * them, so they must not create rows or post to Slack.
 */

import prisma from '../utils/prisma'
import { cronRunName, redactCronSecret, nextSuccessTimes } from '../utils/cron-runs'
import { reportCronFailure } from '../services/alerting'

type CronContext = { name: string; startedAt: number; recorded: boolean }

const NOT_A_RUN = new Set([401, 403, 404, 405])

async function record(run: CronContext, status: number, error: string | null): Promise<void> {
  if (run.recorded || NOT_A_RUN.has(status)) return
  run.recorded = true
  error = redactCronSecret(error)
  const now = new Date()
  const ok = status < 400
  try {
    const prev = await prisma.cronRun.findUnique({ where: { name: run.name }, select: { lastSuccessAt: true, prevSuccessAt: true } })
    const data = {
      lastFinishedAt: now,
      lastStatus: status,
      lastError: ok ? null : error,
      lastDurationMs: now.getTime() - run.startedAt,
      ...(ok ? nextSuccessTimes(prev?.lastSuccessAt ?? null, prev?.prevSuccessAt ?? null, now) : {}),
    }
    await prisma.cronRun.upsert({ where: { name: run.name }, update: data, create: { name: run.name, ...data } })
  } catch (dbError) {
    console.error(`[CronMonitor] Could not record ${run.name}:`, dbError)
  }
  if (!ok) await reportCronFailure(run.name, status, error)
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const name = cronRunName(event.path)
    if (name) event.context.cronRun = { name, startedAt: Date.now(), recorded: false } satisfies CronContext
  })

  nitroApp.hooks.hook('error', async (error, { event }) => {
    const run = event?.context.cronRun as CronContext | undefined
    if (!run) return
    const status = (error as { statusCode?: number }).statusCode ?? 500
    await record(run, status, error.message)
  })

  nitroApp.hooks.hook('afterResponse', async (event) => {
    const run = event.context.cronRun as CronContext | undefined
    if (!run) return
    await record(run, event.node.res.statusCode, null)
  })
})
