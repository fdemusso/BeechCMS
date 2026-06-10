import { describe, expect, it } from 'vitest'
import { LogStore } from '../log-store'

describe('LogStore', () => {
  it('classifies lines into the correct per-source buffer', () => {
    const store = new LogStore()
    store.addLine('api', 'Ready on http://127.0.0.1:8789')
    store.addLine('dashboard', 'Local:   http://localhost:5173/')

    expect(store.getLines('api')).toHaveLength(1)
    expect(store.getLines('api')[0].text).toBe('Ready on http://127.0.0.1:8789')
    expect(store.getLines('dashboard')).toHaveLength(1)
    expect(store.getLines('dashboard')[0].text).toContain('5173')
  })

  it('retains dropped logs as info lines in the store buffer', () => {
    const store = new LogStore()
    const result = store.addLine('api', '[wrangler:info] GET /api/content/posts 200 OK (1ms)')

    expect(result.line).not.toBeNull()
    expect(result.line?.level).toBe('info')
    expect(store.getLines('api')).toHaveLength(1)
    expect(store.getLines('api')[0].text).toContain('200 OK')
  })

  it('caps each source buffer at 2000 lines (circular buffer)', () => {
    const store = new LogStore()
    for (let i = 0; i < 2010; i++) {
      store.addLine('api', `line ${i}`)
    }

    const lines = store.getLines('api')
    expect(lines).toHaveLength(2000)
    // The oldest 10 lines should have been evicted.
    expect(lines[0].text).toBe('line 10')
    expect(lines[lines.length - 1].text).toBe('line 2009')
  })

  it('aggregates contiguous stack-trace lines into a single ErrorEntry', () => {
    const store = new LogStore()
    store.addLine('api', 'Error: D1_ERROR: no such table: content_posts')
    store.addLine('api', '    at Object.<anonymous> (/app/src/index.ts:42:11)')
    store.addLine('api', '    at ModuleJob.run (node:internal/modules/esm/module_job:222:25)')
    // A normal (non-stack) line finalizes the pending error.
    store.addLine('api', 'Ready on http://127.0.0.1:8789')

    const errors = store.getErrors()
    expect(errors).toHaveLength(1)
    expect(errors[0].source).toBe('api')
    expect(errors[0].code).toContain('D1_ERROR')
    expect(errors[0].fullText.split('\n')).toHaveLength(3)
    expect(errors[0].fullText).toContain('ModuleJob.run')
    expect(errors[0].expanded).toBe(false)
  })

  it('does not aggregate stack traces from a different source into the same entry', () => {
    const store = new LogStore()
    store.addLine('api', 'Error: boom')
    store.addLine('dashboard', '    at somewhere (file.ts:1:1)')

    const errors = store.getErrors()
    // The api error is finalized (by the unrelated dashboard line) and the
    // dashboard stack-trace line starts its own error entry.
    expect(errors).toHaveLength(2)
    expect(errors[0].source).toBe('api')
    expect(errors[0].fullText).toBe('Error: boom')
    expect(errors[1].source).toBe('dashboard')
  })

  it('keeps an in-progress (pending) error visible via getErrors', () => {
    const store = new LogStore()
    store.addLine('api', 'Error: still going')
    store.addLine('api', '    at frame1 (a.ts:1:1)')

    const errors = store.getErrors()
    expect(errors).toHaveLength(1)
    expect(errors[0].expanded).toBe(false)
    expect(errors[0].fullText).toBe('Error: still going\n    at frame1 (a.ts:1:1)')
  })

  it('toggles expansion and dismisses finalized errors', () => {
    const store = new LogStore()
    store.addLine('api', 'Error: one')
    store.addLine('api', 'Ready on http://127.0.0.1:8789') // finalizes error 0

    store.toggleErrorExpanded(0)
    expect(store.getErrors()[0].expanded).toBe(true)

    store.dismissError(0)
    expect(store.getErrors()).toHaveLength(0)
  })

  it('archives version-update notices and retains them in the buffer', () => {
    const store = new LogStore()
    const result = store.addLine('api', 'wrangler 4.20.0 is now available 🎉')

    expect(result.line).not.toBeNull()
    expect(store.getVersionNotices()).toContain('wrangler 4.20.0 is now available 🎉')
  })

  it('addChunk splits a multi-line process output chunk', () => {
    const store = new LogStore()
    store.addChunk('core', 'Found 0 errors. Watching for file changes.\nStarting compilation...\n')

    expect(store.getLines('core')).toHaveLength(2)
    expect(store.getLines('core')[0].text).toContain('Found 0 errors')
  })

  it('buffers incomplete lines across multiple addChunk calls and flushes at the end', () => {
    const store = new LogStore()
    
    // First chunk is incomplete (no trailing newline)
    store.addChunk('api', ' ⛅️ wrangler ')
    expect(store.getLines('api')).toHaveLength(0)

    // Second chunk completes the line
    store.addChunk('api', '4.98.0 (update available 4.99.0)\n')
    expect(store.getLines('api')).toHaveLength(1)
    expect(store.getLines('api')[0].text).toBe(' ⛅️ wrangler 4.98.0 (update available 4.99.0)')

    // Third chunk is incomplete and flushed
    store.addChunk('api', 'incomplete last line')
    expect(store.getLines('api')).toHaveLength(1)
    
    store.flush('api')
    expect(store.getLines('api')).toHaveLength(2)
    expect(store.getLines('api')[1].text).toBe('incomplete last line')
  })
})
