// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { S3Client, CreateBucketCommand, DeleteBucketCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'

export function createMinioClient() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT ?? 'http://localhost:9000',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? 'beechdev',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? 'beechdevsecret',
    },
    forcePathStyle: true,
  })
}

export async function createTestBucket(s3: S3Client, bucket: string): Promise<void> {
  await s3.send(new CreateBucketCommand({ Bucket: bucket })).catch(() => { /* already exists */ })
}

export async function deleteTestBucket(s3: S3Client, bucket: string): Promise<void> {
  const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket }))
  for (const obj of list.Contents ?? []) {
    if (obj.Key) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }))
  }
  await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => {})
}
