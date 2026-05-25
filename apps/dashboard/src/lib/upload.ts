import { api } from './api'

export async function uploadFile(file: File): Promise<string> {
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
}
