import { S3Client, CreateBucketCommand, DeleteBucketCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'

export function createMinioClient() {
  return new S3Client({
    region: 'auto',
    endpoint: 'http://localhost:9000',
    credentials: { accessKeyId: 'beechdev', secretAccessKey: 'beechdevsecret' },
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
