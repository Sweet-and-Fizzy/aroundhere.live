import { S3Client } from '@aws-sdk/client-s3'
import crypto from 'crypto'

let _client: S3Client | null = null

export function getR2Client(): S3Client {
  if (_client) return _client

  const config = useRuntimeConfig()

  if (!config.r2AccountId || !config.r2AccessKeyId || !config.r2SecretAccessKey) {
    throw new Error('R2 configuration is missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY env vars.')
  }

  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2AccessKeyId as string,
      secretAccessKey: config.r2SecretAccessKey as string,
    },
  })

  return _client
}

export function generateUploadKey(prefix: string, filename: string): string {
  const id = crypto.randomBytes(8).toString('hex')
  const ext = filename.split('.').pop()?.toLowerCase() || 'jpg'
  return `${prefix}/${id}.${ext}`
}

export function getR2PublicUrl(key: string): string {
  const config = useRuntimeConfig()
  const baseUrl = (config.r2PublicUrl as string || '').replace(/\/$/, '')
  return `${baseUrl}/${key}`
}

export function getR2BucketName(): string {
  const config = useRuntimeConfig()
  return config.r2BucketName as string
}
