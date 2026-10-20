// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { LineParseResult, TransferRecord } from './transfer.types.js'

/** Serialises one record as an NDJSON line, terminator included. */
export function encodeNdjsonLine(record: TransferRecord): string {
  return `${JSON.stringify(record)}\n`
}

/**
 * Decodes one NDJSON line. Never throws: a malformed line is a failed row in the job
 * report, not an aborted import (brief §2 — best-effort, not atomic).
 */
export function parseNdjsonLine(line: string): LineParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch (error) {
    return {
      ok: false,
      code: 'invalid_json',
      message: error instanceof Error ? error.message : 'Malformed JSON',
    }
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, code: 'not_an_object', message: 'Line is not a JSON object' }
  }

  return { ok: true, record: parsed as TransferRecord }
}

const BYTE_ORDER_MARK = '\uFEFF'

/**
 * Splits an arbitrarily-chunked text stream into complete lines, holding the trailing
 * partial line until the next chunk completes it. Stateful by necessity: a single
 * R2 read boundary may fall in the middle of a record, and an import that lost that
 * record would report a phantom failed row.
 *
 * Blank lines are dropped — a trailing newline at end of file is not a record.
 */
export class LineReader {
  private buffer = ''
  private sawFirstChunk = false

  /** Feeds a chunk and returns every line completed by it. */
  push(chunk: string): string[] {
    let text = chunk
    if (!this.sawFirstChunk) {
      this.sawFirstChunk = true
      if (text.startsWith(BYTE_ORDER_MARK)) text = text.slice(BYTE_ORDER_MARK.length)
    }

    this.buffer += text
    const parts = this.buffer.split('\n')
    this.buffer = parts.pop() ?? ''
    return parts.map(stripCarriageReturn).filter((line) => line.length > 0)
  }

  /** Flushes the trailing line of a file that does not end in a newline. */
  end(): string[] {
    const remainder = stripCarriageReturn(this.buffer)
    this.buffer = ''
    return remainder.length > 0 ? [remainder] : []
  }
}

function stripCarriageReturn(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line
}
