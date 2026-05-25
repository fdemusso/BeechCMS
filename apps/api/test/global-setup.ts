import { S3Client, CreateBucketCommand, DeleteBucketCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { assertDockerStackReady } from './docker-precheck'

const TEST_BUCKET = process.env.BEECH_TEST_BUCKET ?? `beech-media-test-${process.pid}`

export async function setup() {
  await assertDockerStackReady()

  const s3 = new S3Client({
    region: 'auto',
    endpoint: 'http://localhost:9000',
    credentials: { accessKeyId: 'beechdev', secretAccessKey: 'beechdevsecret' },
    forcePathStyle: true,
  })
  await s3.send(new CreateBucketCommand({ Bucket: TEST_BUCKET })).catch(() => { /* exists */ })
  process.env.BEECH_TEST_BUCKET = TEST_BUCKET

  return async () => {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: TEST_BUCKET }))
    for (const obj of list.Contents ?? []) {
      if (obj.Key) await s3.send(new DeleteObjectCommand({ Bucket: TEST_BUCKET, Key: obj.Key }))
    }
    await s3.send(new DeleteBucketCommand({ Bucket: TEST_BUCKET })).catch(() => {})
  }
}
