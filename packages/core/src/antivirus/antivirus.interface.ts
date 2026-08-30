// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export type AntivirusStatus = 'clean' | 'infected' | 'skipped' | 'error'

export interface AntivirusScanResult {
  status: AntivirusStatus
  provider: string
  details?: string
  threatName?: string
}

export interface IAntivirusProvider {
  readonly name: string
  scan(fileBuffer: ArrayBuffer | Uint8Array, filename: string): Promise<AntivirusScanResult>
}
