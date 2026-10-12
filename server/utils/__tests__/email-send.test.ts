import { describe, it, expect } from 'vitest'
import type { CreateEmailOptions, CreateEmailResponse, ErrorResponse } from 'resend'
import { createCheckedSend } from '../email-send'

const options = { from: 'a@example.com', to: 'b@example.com', subject: 's', html: '<p>x</p>' } as CreateEmailOptions

describe('createCheckedSend', () => {
  it('returns the send result when Resend accepts the email', async () => {
    const reported: string[] = []
    const ok: CreateEmailResponse = { data: { id: 'email_1' }, error: null, headers: null }
    const sendEmail = createCheckedSend(async () => ok, async kind => { reported.push(kind) })
    await expect(sendEmail('magic link', options)).resolves.toEqual({ id: 'email_1' })
    expect(reported).toEqual([])
  })

  it('reports and throws when Resend returns an error instead of throwing', async () => {
    const reported: Array<[string, ErrorResponse]> = []
    const error: ErrorResponse = { name: 'validation_error', message: 'The aroundhere.live domain is not verified', statusCode: 403 }
    const failed: CreateEmailResponse = { data: null, error, headers: null }
    const sendEmail = createCheckedSend(async () => failed, async (kind, e) => { reported.push([kind, e]) })
    await expect(sendEmail('magic link', options)).rejects.toThrow('Resend validation_error: The aroundhere.live domain is not verified')
    expect(reported).toEqual([['magic link', error]])
  })
})
