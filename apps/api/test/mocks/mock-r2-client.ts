import { vi } from 'vitest'
import { S3Client, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

/**
 * MOCK R2 CLIENT
 * Intercepts S3Client.send calls to simulate Cloudflare R2 behavior.
 * This allows flow tests to verify file deletion and cleanup logic.
 */
export const mockR2 = {
  // Spy on the generic send method
  send: vi.spyOn(S3Client.prototype, 'send'),

  /**
   * Resets the spy and all recorded calls.
   */
  reset: () => {
    mockR2.send.mockReset()
  },

  /**
   * Sets up default successful responses for R2 operations.
   * - HeadObjectCommand: returns a simulated file size.
   * - DeleteObjectCommand: returns success.
   */
  setupSuccess: (options: { fileSize?: number } = {}) => {
    mockR2.send.mockImplementation(async (command: any) => {
      if (command instanceof HeadObjectCommand) {
        return { ContentLength: options.fileSize ?? 1024 }
      }
      if (command instanceof DeleteObjectCommand) {
        return { $metadata: { httpStatusCode: 204 } }
      }
      return {}
    })
  },

  /**
   * Simulates a missing file on R2 (HeadObjectCommand throws).
   */
  setupFileNotFound: () => {
    mockR2.send.mockImplementation(async (command: any) => {
      if (command instanceof HeadObjectCommand) {
        const err = new Error('NotFound')
        ;(err as any).name = 'NotFound'
        throw err
      }
      if (command instanceof DeleteObjectCommand) {
        return { $metadata: { httpStatusCode: 204 } }
      }
      return {}
    })
  }
}
