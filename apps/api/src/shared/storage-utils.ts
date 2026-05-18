import { S3Client, ListObjectsV2Command, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3'

/**
 * Calcola la dimensione totale occupata in un bucket R2 (in byte).
 * Nota: esegue una scansione completa del bucket. Per bucket molto grandi 
 * andrebbe implementata una cache o usato Cloudflare Logpush/Analytics.
 */
export async function getBucketSize(client: S3Client, bucketName: string): Promise<number> {
  let totalSize = 0
  let isTruncatedFlag = true
  let continuationToken: string | undefined = undefined

  try {
    while (isTruncatedFlag) {
      const command: ListObjectsV2Command = new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
      })

      const response: ListObjectsV2CommandOutput = await client.send(command)

      if (response.Contents) {
        for (const obj of response.Contents) {
          totalSize += obj.Size ?? 0
        }
      }

      isTruncatedFlag = response.IsTruncated ?? false
      continuationToken = response.NextContinuationToken
    }
    return totalSize
  } catch (err) {
    console.error('Error calculating bucket size:', err)
    throw new Error('Failed to calculate bucket size. Check your R2/S3 credentials and endpoint.')
  }
}
