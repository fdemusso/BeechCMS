// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { IAntivirusProvider, AntivirusScanResult } from './antivirus.interface.js'

export class VirusTotalAntivirusProvider implements IAntivirusProvider {
  readonly name = 'virustotal'
  constructor(private readonly apiKey?: string) {}

  async scan(fileBuffer: ArrayBuffer | Uint8Array, filename: string): Promise<AntivirusScanResult> {
    if (!this.apiKey) {
      return { status: 'skipped', provider: this.name, details: 'API key not configured' }
    }

    const bytes = fileBuffer instanceof Uint8Array ? fileBuffer : new Uint8Array(fileBuffer)
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource)
    const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

    try {
      const res = await fetch(`https://www.virustotal.com/api/v3/files/${hash}`, {
        headers: { 'x-apikey': this.apiKey },
      })

      if (res.status === 200) {
        const data = await res.json() as any
        const stats = data?.data?.attributes?.last_analysis_stats
        const malicious = (stats?.malicious ?? 0) + (stats?.suspicious ?? 0)
        if (malicious > 0) {
          return { status: 'infected', provider: this.name, details: `Detected by ${malicious} security engines` }
        }
        return { status: 'clean', provider: this.name }
      }

      if (res.status === 404) {
        const formData = new FormData()
        formData.append('file', new Blob([bytes as unknown as BlobPart]), filename)
        const uploadRes = await fetch('https://www.virustotal.com/api/v3/files', {
          method: 'POST',
          headers: { 'x-apikey': this.apiKey },
          body: formData,
        })
        if (!uploadRes.ok) {
          return { status: 'error', provider: this.name, details: `Upload scan error: ${uploadRes.status}` }
        }
        return { status: 'clean', provider: this.name, details: 'Queued for background analysis' }
      }

      return { status: 'error', provider: this.name, details: `VirusTotal lookup returned ${res.status}` }
    } catch (error) {
      return { status: 'error', provider: this.name, details: error instanceof Error ? error.message : 'Scan request failed' }
    }
  }
}
