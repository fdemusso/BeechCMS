// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * RFC 4180 CSV codec. Hand-written rather than pulled from npm: `packages/core` ships to a
 * Worker bundle and the two rules that matter here (quote-wrap on delimiter/quote/newline,
 * double the inner quote) are four lines. A dependency would cost more than it saves.
 */

const DELIMITER = ','
const ROW_TERMINATOR = '\r\n'
const QUOTE = '"'
const MUST_QUOTE = /[",\r\n]/

/** Encodes one cell. `null`/`undefined` become an empty, unquoted field. */
export function encodeCsvValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (!MUST_QUOTE.test(value)) return value
  return `${QUOTE}${value.replaceAll(QUOTE, `${QUOTE}${QUOTE}`)}${QUOTE}`
}

/** Encodes one row, CRLF terminator included (RFC 4180 §2.1). */
export function encodeCsvRow(cells: Array<string | null | undefined>): string {
  return cells.map(encodeCsvValue).join(DELIMITER) + ROW_TERMINATOR
}

const BYTE_ORDER_MARK = '\uFEFF'

/**
 * Splits an arbitrarily-chunked CSV text stream into rows of cells.
 *
 * Stateful and quote-aware: a newline inside a quoted field is DATA, not a row break, so
 * a naive `split('\n')` corrupts any export containing a multi-line text branch — which
 * the export side of this same module is perfectly capable of producing. The parser
 * therefore carries its in-quotes state across chunk boundaries as well as across lines.
 */
export class CsvRowReader {
  private cells: string[] = []
  private field = ''
  private inQuotes = false
  private quoteJustClosed = false
  private pendingCarriageReturn = false
  private rowHasContent = false
  private sawFirstChunk = false

  /** Feeds a chunk and returns every row completed by it. */
  push(chunk: string): string[][] {
    let text = chunk
    if (!this.sawFirstChunk) {
      this.sawFirstChunk = true
      if (text.startsWith(BYTE_ORDER_MARK)) text = text.slice(BYTE_ORDER_MARK.length)
    }

    const rows: string[][] = []

    for (const char of text) {
      if (this.pendingCarriageReturn) {
        this.pendingCarriageReturn = false
        // A lone CR terminates the row too; a CRLF consumes the LF here.
        const row = this.completeRow()
        if (row) rows.push(row)
        if (char === '\n') continue
      }

      if (this.inQuotes) {
        if (this.quoteJustClosed) {
          this.quoteJustClosed = false
          if (char === QUOTE) {
            this.field += QUOTE // an escaped quote inside a quoted field
            continue
          }
          this.inQuotes = false
          // fall through: this char is a normal unquoted char
        } else if (char === QUOTE) {
          this.quoteJustClosed = true
          continue
        } else {
          this.field += char
          continue
        }
      }

      if (char === QUOTE) {
        this.inQuotes = true
        this.rowHasContent = true
        continue
      }
      if (char === DELIMITER) {
        this.pushField()
        continue
      }
      if (char === '\r') {
        this.pendingCarriageReturn = true
        continue
      }
      if (char === '\n') {
        const row = this.completeRow()
        if (row) rows.push(row)
        continue
      }
      this.field += char
      this.rowHasContent = true
    }

    return rows
  }

  /**
   * Flushes the final row of a file with no trailing newline.
   * @throws never — an unterminated quote is reported by `hasUnterminatedQuote()` so the
   *   caller can record it as a failed row rather than losing the whole chunk.
   */
  end(): string[][] {
    if (this.pendingCarriageReturn) this.pendingCarriageReturn = false
    const row = this.completeRow()
    return row ? [row] : []
  }

  /** True when `end()` was reached inside an open quoted field — the file is truncated. */
  hasUnterminatedQuote(): boolean {
    return this.inQuotes && !this.quoteJustClosed
  }

  private pushField(): void {
    this.cells.push(this.field)
    this.field = ''
    this.rowHasContent = true
  }

  private completeRow(): string[] | null {
    if (!this.rowHasContent && this.cells.length === 0 && this.field === '') return null
    this.cells.push(this.field)
    const row = this.cells
    this.cells = []
    this.field = ''
    this.inQuotes = false
    this.quoteJustClosed = false
    this.rowHasContent = false
    return row
  }
}
