import stripAnsi from 'strip-ansi'
import { classifyLine, isStackTraceLine, isVersionNotice, levelForLine, type LogLevel } from './log-filters'

export type LogSource = 'api' | 'dashboard' | 'core' | 'docker' | 'bootstrap' | 'system'

const LOG_SOURCES: LogSource[] = ['api', 'dashboard', 'core', 'docker', 'bootstrap', 'system']

export interface LogLine {
  source: LogSource
  timestamp: number
  level: LogLevel
  text: string
}

export interface ErrorEntry {
  source: LogSource
  code: string
  fullText: string
  timestamp: number
  expanded: boolean
}

export interface AddLineResult {
  /** The stored log line, or `null` if the line was dropped as noise. */
  line: LogLine | null
  /** A newly-finalized error entry, if this line completed one. */
  finalizedError?: ErrorEntry
}

const BUFFER_SIZE = 2000
const MAX_ERRORS = 100
const ERROR_CODE_MAX_LENGTH = 120

export class LogStore {
  private buffers: Record<LogSource, LogLine[]> = {
    api: [],
    dashboard: [],
    core: [],
    docker: [],
    bootstrap: [],
    system: [],
  }

  private errors: ErrorEntry[] = []
  private pendingError: ErrorEntry | null = null
  private versionNotices: string[] = []
  private lineBuffers: Record<LogSource, string> = {
    api: '',
    dashboard: '',
    core: '',
    docker: '',
    bootstrap: '',
    system: '',
  }

  /** Splits a raw chunk of process output into lines and stores each one. */
  addChunk(source: LogSource, chunk: string, now: () => number = Date.now): AddLineResult[] {
    const text = stripAnsi(chunk)
    const fullText = this.lineBuffers[source] + text
    const lines = fullText.split(/\r?\n/)
    
    this.lineBuffers[source] = lines.pop() ?? ''
    
    const results: AddLineResult[] = []
    for (const rawLine of lines) {
      results.push(this.addLine(source, rawLine, now()))
    }
    return results
  }

  /** Flushes any remaining incomplete line from the buffer. */
  flush(source: LogSource, now: () => number = Date.now): AddLineResult | null {
    const remaining = this.lineBuffers[source]
    if (remaining.length > 0) {
      this.lineBuffers[source] = ''
      return this.addLine(source, remaining, now())
    }
    return null
  }

  addLine(source: LogSource, rawLine: string, timestamp: number = Date.now()): AddLineResult {
    const text = stripAnsi(rawLine)
    const classification = classifyLine(text)

    if (isVersionNotice(text)) {
      this.versionNotices.push(text)
    }

    if (classification === 'drop') {
      const finalized = this.finalizePendingError()
      const line: LogLine = { source, timestamp, level: 'info', text }
      this.pushLine(source, line)
      return { line, finalizedError: finalized ?? undefined }
    }

    const level = levelForLine(text, classification)
    const line: LogLine = { source, timestamp, level, text }
    this.pushLine(source, line)

    let finalizedError: ErrorEntry | undefined

    if (classification === 'error') {
      if (isStackTraceLine(text) && this.pendingError && this.pendingError.source === source) {
        this.pendingError.fullText += `\n${text}`
      } else {
        const finalized = this.finalizePendingError()
        if (finalized) finalizedError = finalized
        this.pendingError = {
          source,
          code: text.length > ERROR_CODE_MAX_LENGTH ? `${text.slice(0, ERROR_CODE_MAX_LENGTH)}…` : text,
          fullText: text,
          timestamp,
          expanded: false,
        }
      }
    } else {
      const finalized = this.finalizePendingError()
      if (finalized) finalizedError = finalized
    }

    return { line, finalizedError }
  }

  private finalizePendingError(): ErrorEntry | null {
    if (!this.pendingError) return null
    const entry = this.pendingError
    this.pendingError = null
    this.errors.push(entry)
    if (this.errors.length > MAX_ERRORS) {
      this.errors.shift()
    }
    return entry
  }

  private pushLine(source: LogSource, line: LogLine): void {
    const buffer = this.buffers[source]
    buffer.push(line)
    if (buffer.length > BUFFER_SIZE) {
      buffer.splice(0, buffer.length - BUFFER_SIZE)
    }
  }

  getLines(source: LogSource): readonly LogLine[] {
    return this.buffers[source]
  }

  getErrors(): readonly ErrorEntry[] {
    // Include the pending (not-yet-finalized) error so it's visible immediately.
    return this.pendingError ? [...this.errors, this.pendingError] : this.errors
  }

  toggleErrorExpanded(index: number): void {
    const all = this.errors
    if (index >= 0 && index < all.length) {
      all[index].expanded = !all[index].expanded
    }
  }

  dismissError(index: number): void {
    if (index >= 0 && index < this.errors.length) {
      this.errors.splice(index, 1)
    }
  }

  getVersionNotices(): readonly string[] {
    return this.versionNotices
  }
}
