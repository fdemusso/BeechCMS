import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'

/**
 * Calcola la dimensione totale occupata in un bucket R2 (in byte).
 * Nota: esegue una scansione completa del bucket. Per bucket molto grandi 
 * andrebbe implementata una cache o usato Cloudflare Logpush/Analytics.
 */
export async function getBucketSize(client: S3Client, bucketName: string): Promise<number> {
  let totalSize = 0
  let isTruncated = true
  let continuationToken: string | undefined = undefined

  try {
    while (isTruncated) {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
      })

      const response = await client.send(command)
      
      if (response.Contents) {
        for (const obj of response.Contents) {
          totalSize += obj.Size ?? 0
        }
      }

      isTruncated = response.IsTruncated ?? false
      continuationToken = response.NextContinuationToken
    }
    return totalSize
  } catch (err) {
    console.error('Error calculating bucket size:', err)
    return 0
  }
}
