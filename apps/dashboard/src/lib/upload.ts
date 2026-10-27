// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { isApiError } from './http/api-error'
import { rpc } from './rpc'

export async function uploadFile(file: File): Promise<string> {
  try {
    // 1. Try modern Presigned URL upload (Zero Worker CPU/RAM)
    const presignResponse = await rpc.api.upload.presign.$post({
      json: { filename: file.name, mimeType: file.type, sizeBytes: file.size },
    })
    const presign = await presignResponse.json()

    const putRes = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!putRes.ok) throw new Error(`Storage PUT failed: ${putRes.status}`)

    const confirmResponse = await rpc.api.upload.confirm.$post({ json: { key: presign.key } })
    return (await confirmResponse.json()).url
  } catch (err) {
    // If presign is unsupported or unconfigured (501 / presigned_urls_require_s3_credentials), fallback to proxied /upload
    if (
      isApiError(err) &&
      (err.status === 501 || err.data?.error === 'presigned_urls_require_s3_credentials')
    ) {
      const res = await rpc.api.upload.$post({ form: { file } })
      return (await res.json()).url
    }

    if (isApiError(err) && err.data?.message) {
      throw new Error(err.data.message)
    }
    throw err
  }
}

/**
 * Deletes an upload by its storage key. `hc` puts a path parameter in the URL as given, so the
 * key is encoded here: a name with a space or a `#` would otherwise cut the path short.
 */
export async function deleteUpload(key: string): Promise<void> {
  await rpc.api.upload[':key'].$delete({ param: { key: encodeURIComponent(key) } })
}
