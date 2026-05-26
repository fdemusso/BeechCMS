// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { assertDockerStackReady } from './docker-precheck'

const TEST_BUCKET = process.env.R2_BUCKET_NAME ?? 'beech-media-test'

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT ?? 'http://localhost:9000',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? 'beechdev',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? 'beechdevsecret',
  },
  forcePathStyle: true,
})

async function emptyBucket(): Promise<void> {
  const list = await s3.send(new ListObjectsV2Command({ Bucket: TEST_BUCKET })).catch(() => null)
  for (const obj of list?.Contents ?? []) {
    if (obj.Key) await s3.send(new DeleteObjectCommand({ Bucket: TEST_BUCKET, Key: obj.Key }))
  }
}

export async function setup() {
  await assertDockerStackReady()
  await emptyBucket()

  return async () => {
    await emptyBucket()
  }
}
