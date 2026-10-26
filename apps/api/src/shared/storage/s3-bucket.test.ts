// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { S3Bucket } from './s3-bucket'

const bucket = new S3Bucket({
  endpoint: 'https://account.r2.cloudflarestorage.com',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
  bucketName: 'media',
  baseUrl: 'https://api.example.test',
})

describe('S3Bucket.presignPut', () => {
  it('binds the declared Content-Type into the SigV4 signed headers', async () => {
    // Presigning is local SigV4 math with the real AWS SDK; no network call is made.
    // The default presigner marks content-type unsignable, so a client could send any
    // Content-Type under a valid signature and bypass the MIME allowlist checked at presign time.
    const url = await bucket.presignPut('1700000000-abcd1234-photo.png', {
      expiresIn: 900,
      contentType: 'image/png',
      contentLength: 12345,
    })

    const signedHeaders = (new URL(url).searchParams.get('X-Amz-SignedHeaders') ?? '').split(';')
    expect(signedHeaders).toContain('content-type')
  })
})
