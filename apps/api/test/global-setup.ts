import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { assertDockerStackReady } from './docker-precheck'

const TEST_BUCKET = 'beech-media-test'

const s3 = new S3Client({
  region: 'auto',
  endpoint: 'http://localhost:9000',
  credentials: { accessKeyId: 'beechdev', secretAccessKey: 'beechdevsecret' },
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
