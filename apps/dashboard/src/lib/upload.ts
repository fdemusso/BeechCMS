// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { api } from './api'
import { isAxiosError } from 'axios'

export async function uploadFile(file: File): Promise<string> {
  try {
    // 1. Try modern Presigned URL upload (Zero Worker CPU/RAM)
    const presign = await api.post<{ uploadUrl: string; key: string; expiresIn: number }>(
      '/upload/presign',
      { filename: file.name, mimeType: file.type, sizeBytes: file.size }
    )

    const putRes = await fetch(presign.data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!putRes.ok) throw new Error(`Storage PUT failed: ${putRes.status}`)

    const confirm = await api.post<{ url: string }>('/upload/confirm', { key: presign.data.key })
    return confirm.data.url
  } catch (err) {
    // If presign is unsupported or unconfigured (501 / presigned_urls_require_s3_credentials), fallback to proxied /upload
    if (
      isAxiosError(err) &&
      (err.response?.status === 501 || err.response?.data?.error === 'presigned_urls_require_s3_credentials')
    ) {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post<{ url: string }>('/upload', formData)
      return res.data.url
    }

    if (isAxiosError(err) && err.response?.data?.message) {
      throw new Error(err.response.data.message)
    }
    throw err
  }
}
