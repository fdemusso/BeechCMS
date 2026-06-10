import { describe, expect, it } from 'vitest'
import { classifyLine, isStackTraceLine, isVersionNotice, levelForLine } from '../log-filters'

describe('classifyLine', () => {
  it('drops Wrangler update-available banners', () => {
    expect(classifyLine('▲ [WARNING] wrangler 4.20.0 is now available')).toBe('drop')
  })

  it('drops Wrangler update install instructions', () => {
    expect(classifyLine('   Run `npm install --save-dev wrangler@4` to update')).toBe('drop')
  })

  it('drops Turbo update banners', () => {
    expect(classifyLine('• Update available 2.10.0')).toBe('drop')
  })

  it('drops 2xx wrangler access logs', () => {
    expect(classifyLine('[wrangler:info] GET /api/content/posts 200 OK (12ms)')).toBe('drop')
  })

  it('drops empty lines', () => {
    expect(classifyLine('')).toBe('drop')
    expect(classifyLine('   ')).toBe('drop')
  })

  it('passes 4xx/5xx wrangler access logs (classified as warn)', () => {
    expect(classifyLine('[wrangler:info] GET /api/content/posts 404 Not Found (3ms)')).toBe('pass')
    expect(levelForLine('[wrangler:info] GET /api/content/posts 404 Not Found (3ms)', 'pass')).toBe('warn')
    expect(classifyLine('[wrangler:info] POST /api/content/posts 500 Internal Server Error')).toBe('pass')
    expect(levelForLine('[wrangler:info] POST /api/content/posts 500 Internal Server Error', 'pass')).toBe('warn')
  })

  it('classifies esbuild errors as error', () => {
    expect(classifyLine('✘ [ERROR] Could not resolve "@beechcms/core"')).toBe('error')
  })

  it('classifies generic Error: lines as error', () => {
    expect(classifyLine('Error: D1_ERROR: no such table: content_posts')).toBe('error')
  })

  it('classifies TypeScript compiler errors as error', () => {
     expect(classifyLine('src/index.ts(10,5): error TS2322: Type \'string\' is not assignable to type \'number\'.')).toBe('error')
     expect(classifyLine('packages/core/src/index.ts(12,1): ERROR TS2307: Cannot find module \'./foo\'')).toBe('error')
   })

  it('classifies D1_ERROR lines as error', () => {
    expect(classifyLine('D1_ERROR: no such table: content_posts: SQLITE_ERROR')).toBe('error')
  })

  it('classifies stack trace continuation lines as error', () => {
    expect(classifyLine('    at Object.<anonymous> (/app/src/index.ts:42:11)')).toBe('error')
    expect(isStackTraceLine('    at Object.<anonymous> (/app/src/index.ts:42:11)')).toBe(true)
  })

  it('passes useful Vite HMR lines', () => {
    expect(classifyLine('[vite] hmr update /src/App.tsx')).toBe('pass')
    expect(levelForLine('[vite] hmr update /src/App.tsx', 'pass')).toBe('info')
  })

  it('passes generic informational output', () => {
    expect(classifyLine('Local:   http://localhost:5173/')).toBe('pass')
  })
})

describe('isVersionNotice', () => {
  it('flags Wrangler update-available lines', () => {
    expect(isVersionNotice('wrangler 4.20.0 is now available 🎉')).toBe(true)
  })

  it('flags Turbo update-available lines', () => {
    expect(isVersionNotice('• Update available 2.10.0')).toBe(true)
  })

  it('does not flag unrelated lines', () => {
    expect(isVersionNotice('Local:   http://localhost:5173/')).toBe(false)
  })
})
