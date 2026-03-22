import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getR2Client, generateUploadKey, getR2PublicUrl, getR2BucketName } from '../../utils/r2'
import { checkRateLimit } from '../../utils/rate-limit'

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = session?.user?.id as string | undefined

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  // Rate limit: 10 uploads per user per hour
  if (!checkRateLimit(`upload:${userId}`, 10, 60 * 60 * 1000)) {
    throw createError({ statusCode: 429, message: 'Too many uploads. Please try again later.' })
  }

  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, message: 'No file uploaded' })
  }

  const file = formData.find(f => f.name === 'file')
  if (!file || !file.data || !file.type) {
    throw createError({ statusCode: 400, message: 'No image file found' })
  }

  // Validate file type
  if (!ALLOWED_TYPES[file.type]) {
    throw createError({ statusCode: 400, message: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' })
  }

  // Validate file size
  if (file.data.length > MAX_FILE_SIZE) {
    throw createError({ statusCode: 400, message: 'File too large. Maximum size is 5MB.' })
  }

  const originalFilename = file.filename || `upload.${ALLOWED_TYPES[file.type]}`
  const key = generateUploadKey('events', originalFilename)

  try {
    const client = getR2Client()
    await client.send(new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: key,
      Body: file.data,
      ContentType: file.type,
    }))

    const url = getR2PublicUrl(key)

    return { url }
  } catch (err) {
    console.error('[ImageUpload] R2 upload error:', err)
    throw createError({ statusCode: 500, message: 'Failed to upload image' })
  }
})
