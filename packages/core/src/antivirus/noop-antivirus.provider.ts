// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { IAntivirusProvider, AntivirusScanResult } from './antivirus.interface.js'

export class NoopAntivirusProvider implements IAntivirusProvider {
  readonly name = 'noop'

  async scan(_fileBuffer: ArrayBuffer | Uint8Array, _filename: string): Promise<AntivirusScanResult> {
    return { status: 'skipped', provider: this.name, details: 'Antivirus scanning disabled' }
  }
}
