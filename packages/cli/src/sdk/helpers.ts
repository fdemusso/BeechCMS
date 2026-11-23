// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module sdk/helpers
 * Multi-call helpers built on the generated namespaces: paging, presigned upload, file import and
 * import polling. No helper talks to the transport directly.
 */

import type { TransferFormat } from '@beechcms/core'
import { BeechSdkError, SDK_ERROR_CODES } from './errors.js'
import type { SdkInvoker } from './invoke.js'
import type {
  BeechSdk,
  ImportFileInput,
  ImportJob,
  ListAllOptions,
  SdkEntry,
  SeedRegistryShape,
  UploadFileInput,
  WaitOptions,
  WriteOutcome,
} from './types.js'

const LIST_PAGE_SIZE = 100
const DEFAULT_MAX_ITEMS = 5000
const DEFAULT_POLL_INTERVAL_MS = 1000
const DEFAULT_WAIT_TIMEOUT_MS = 300_000

/** Matches the dashboard import path (`transfer.api.ts`). */
const IMPORT_MIME_TYPES: Record<TransferFormat, string> = { csv: 'text/csv', ndjson: 'application/json' }

type Sdk = BeechSdk<SeedRegistryShape>

export interface SdkHelpers {
  listAll(slug: string, options?: ListAllOptions): Promise<SdkEntry<Record<string, unknown>>[]>
  uploadFile(input: UploadFileInput): Promise<WriteOutcome<{ key: string; url: string }>>
  importFile(slug: string, input: ImportFileInput, wait?: WaitOptions): Promise<WriteOutcome<ImportJob>>
  waitForImport(jobId: string, options?: WaitOptions): Promise<ImportJob>
}

/** PUTs bytes to a presigned URL; never sends the bearer token. */
async function putToStorage(invoker: SdkInvoker, operationId: string, uploadUrl: string, mimeType: string, data: Uint8Array): Promise<void> {
  // Uint8Array<ArrayBufferLike> is a valid body at runtime; the DOM lib types only ArrayBuffer-backed views.
  const response = await invoker.options.fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: data as BodyInit })
  if (!response.ok) {
    throw new BeechSdkError(`${operationId} storage PUT failed (${response.status})`, response.status, SDK_ERROR_CODES.STORAGE_PUT_FAILED, operationId, null)
  }
}

export function createHelpers(invoker: SdkInvoker, sdk: Sdk): SdkHelpers {
  async function listAll(slug: string, options: ListAllOptions = {}): Promise<SdkEntry<Record<string, unknown>>[]> {
    const { maxItems = DEFAULT_MAX_ITEMS, ...filters } = options
    const collected: SdkEntry<Record<string, unknown>>[] = []

    for (let page = 1; ; page++) {
      const result = await sdk.content.list(slug, { ...filters, page, limit: LIST_PAGE_SIZE })
      if (page === 1 && result.total > maxItems) {
        throw new BeechSdkError(
          `content.listAll refused: ${result.total} entries exceed maxItems ${maxItems}`,
          0,
          SDK_ERROR_CODES.LIST_CAP_EXCEEDED,
          'content.listAll',
          { total: result.total, maxItems },
        )
      }
      collected.push(...result.items)
      if (collected.length >= result.total || result.items.length === 0) return collected
    }
  }

  async function uploadFile({ filename, mimeType, data }: UploadFileInput): Promise<WriteOutcome<{ key: string; url: string }>> {
    const presigned = await sdk.media.presign({ filename, mimeType, sizeBytes: data.byteLength })
    if (presigned.kind !== 'executed') return presigned

    const { uploadUrl, key } = presigned.data
    await putToStorage(invoker, 'media.uploadFile', uploadUrl, mimeType, data)

    const confirmed = await sdk.media.confirm({ key })
    if (confirmed.kind !== 'executed') return confirmed
    return { kind: 'executed', status: confirmed.status, data: { key, url: confirmed.data.url } }
  }

  async function waitForImport(jobId: string, { intervalMs = DEFAULT_POLL_INTERVAL_MS, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS }: WaitOptions = {}): Promise<ImportJob> {
    const { clock } = invoker.options
    const start = clock.now()

    for (;;) {
      const job = await sdk.content.importStatus(jobId)
      if (job.state === 'completed' || job.state === 'failed') return job
      if (clock.now() - start >= timeoutMs) {
        throw new BeechSdkError(`content.waitForImport timed out after ${timeoutMs}ms`, 0, SDK_ERROR_CODES.IMPORT_WAIT_TIMEOUT, 'content.waitForImport', job)
      }
      await clock.sleep(intervalMs)
    }
  }

  async function importFile(slug: string, { format, data, filename }: ImportFileInput, wait?: WaitOptions): Promise<WriteOutcome<ImportJob>> {
    const mimeType = IMPORT_MIME_TYPES[format]
    const presigned = await sdk.media.presign({ filename, mimeType, sizeBytes: data.byteLength, purpose: 'import' })
    if (presigned.kind !== 'executed') return presigned

    const { uploadUrl, key } = presigned.data
    // No confirm: the import worker owns and deletes the transport object.
    await putToStorage(invoker, 'content.importFile', uploadUrl, mimeType, data)

    const started = await sdk.content.import(slug, { objectKey: key, format })
    if (started.kind !== 'executed') return started
    return { kind: 'executed', status: started.status, data: await waitForImport(started.data.jobId, wait) }
  }

  return { listAll, uploadFile, importFile, waitForImport }
}
