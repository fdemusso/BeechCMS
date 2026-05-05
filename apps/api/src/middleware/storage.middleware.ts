import { createMiddleware } from 'hono/factory'
import { BeechBucket } from '@beechcms/core'
import { AppEnv } from '../types'
import { createBucketProvider } from '../shared/storage/factory'

interface StorageOverrides {
  bucket?: BeechBucket
}

export const storageMiddleware = (overrides?: StorageOverrides) => {
  return createMiddleware<AppEnv>(async (context, next) => {
    if (overrides?.bucket) {
      context.set('bucket', overrides.bucket)
    } else {
      // Determine base URL for getUrl() only if we need to create the provider
      const baseUrl = context.env.MEDIA_BASE_URL?.trim().replace(/\/$/, '') || new URL(context.req.url).origin
      context.set('bucket', createBucketProvider(context.env, baseUrl))
    }
    await next()
  })
}
