import fs from 'node:fs'
import path from 'node:path'

export interface EndpointInfo {
  method: string
  path: string
  group: string
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

const FACTORY_PATH = path.join('apps', 'api', 'src', 'factory.ts')
const API_SRC = path.join('apps', 'api', 'src')

// Curated fallback used if factory.ts can't be parsed (e.g. after a refactor).
// Kept intentionally minimal — see docs/api-reference.md for the full list.
export const FALLBACK_ENDPOINTS: EndpointInfo[] = [
  { method: 'POST', path: '/auth/login', group: 'Auth' },
  { method: 'POST', path: '/auth/refresh', group: 'Auth' },
  { method: 'POST', path: '/auth/logout', group: 'Auth' },
  { method: 'GET', path: '/api/content/:slug', group: 'Content' },
  { method: 'POST', path: '/api/content/:slug', group: 'Content' },
  { method: 'GET', path: '/api/schema', group: 'Schema' },
  { method: 'GET', path: '/api/settings', group: 'Settings' },
  { method: 'POST', path: '/upload', group: 'Media' },
  { method: 'GET', path: '/api/v1/public/:slug', group: 'Public API' },
  { method: 'POST', path: '/api/webhooks/:id', group: 'Webhooks' },
  { method: 'GET', path: '/api/search', group: 'Search' },
]

interface ImportSpec {
  /** Local names bound by the import (named or default). */
  names: string[]
  /** Module specifier, e.g. './features/content'. */
  from: string
}

interface RouteMount {
  appVar: string
  prefix: string
  target: string
}

function parseImports(source: string): Map<string, string> {
  // local name -> module specifier
  const map = new Map<string, string>()
  const importRe = /import\s+(?:type\s+)?(?:(\w+)|\{([^}]+)\}|(\w+)\s*,\s*\{([^}]+)\})\s+from\s+['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = importRe.exec(source))) {
    const [, defaultOnly, namedOnly, defaultWithNamed, namedWithDefault, from] = match
    const names: string[] = []
    if (defaultOnly) names.push(defaultOnly)
    if (defaultWithNamed) names.push(defaultWithNamed)
    const named = namedOnly ?? namedWithDefault
    if (named) {
      for (const part of named.split(',')) {
        const trimmed = part.trim()
        if (!trimmed) continue
        // Handle `Foo as Bar` aliases — keep the local (aliased) name.
        const asMatch = trimmed.match(/^(\w+)\s+as\s+(\w+)$/)
        names.push(asMatch ? asMatch[2] : trimmed)
      }
    }
    for (const name of names) map.set(name, from)
  }
  return map
}

function parseRouteMounts(source: string): RouteMount[] {
  const mounts: RouteMount[] = []
  const mountRe = /(\w+)\.route\(\s*['"]([^'"]*)['"]\s*,\s*(\w+)\s*\)/g
  let match: RegExpExecArray | null
  while ((match = mountRe.exec(source))) {
    mounts.push({ appVar: match[1], prefix: match[2], target: match[3] })
  }
  return mounts
}

function joinPrefix(base: string, prefix: string): string {
  if (prefix === '/' || prefix === '') return base || ''
  const combined = `${base}/${prefix}`.replace(/\/{2,}/g, '/')
  return combined.replace(/\/$/, '') || '/'
}

function resolveModuleFile(rootDir: string, fromFactory: string): string | null {
  const base = path.join(API_SRC, fromFactory)
  const candidates = [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]
  for (const candidate of candidates) {
    const full = path.join(rootDir, candidate)
    if (fs.existsSync(full)) return full
  }
  return null
}

function groupNameFromModulePath(fromFactory: string): string {
  const segments = fromFactory.split('/').filter((s) => s !== '.' && s !== '..')
  let last = segments[segments.length - 1] ?? fromFactory
  last = last.replace(/\.handler$/, '').replace(/\.routes$/, '')
  if (last === 'index' && segments.length > 1) last = segments[segments.length - 2]
  return last
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function parseRoutesFromFile(filePath: string): { method: string; path: string }[] {
  const source = fs.readFileSync(filePath, 'utf8')
  const routes: { method: string; path: string }[] = []
  const methodPattern = HTTP_METHODS.join('|')
  const routeRe = new RegExp(`\\.(${methodPattern})\\(\\s*['"]([^'"]+)['"]`, 'g')
  let match: RegExpExecArray | null
  while ((match = routeRe.exec(source))) {
    routes.push({ method: match[1].toUpperCase(), path: match[2] })
  }
  return routes
}

/**
 * Best-effort static parse of `apps/api/src/factory.ts` and the `*.routes.ts`/`*.handler.ts`
 * files it mounts, producing a flat list of `{ method, path, group }`. Falls back to a
 * curated static list if the factory has been refactored beyond what this parser expects.
 */
export function parseEndpoints(rootDir: string = process.cwd()): EndpointInfo[] {
  try {
    const factoryFull = path.join(rootDir, FACTORY_PATH)
    if (!fs.existsSync(factoryFull)) return FALLBACK_ENDPOINTS

    const source = fs.readFileSync(factoryFull, 'utf8')
    const imports = parseImports(source)
    const mounts = parseRouteMounts(source)

    // Vars that are mounted *into* another router are local sub-apps (e.g. apiProtected).
    const mountTargets = new Set(mounts.map((m) => m.target))
    const mountSources = new Set(mounts.map((m) => m.appVar))
    const containerVars = new Set([...mountTargets].filter((t) => mountSources.has(t)))

    const baseMap = new Map<string, string>([['app', '']])

    // Fixpoint: resolve base prefixes for container vars (order-independent).
    for (let i = 0; i < mounts.length + 1; i++) {
      let changed = false
      for (const mount of mounts) {
        if (containerVars.has(mount.target) && baseMap.has(mount.appVar) && !baseMap.has(mount.target)) {
          baseMap.set(mount.target, joinPrefix(baseMap.get(mount.appVar)!, mount.prefix))
          changed = true
        }
      }
      if (!changed) break
    }

    const endpoints: EndpointInfo[] = []
    for (const mount of mounts) {
      if (containerVars.has(mount.target)) continue
      const base = baseMap.get(mount.appVar)
      if (base === undefined) continue

      const fromModule = imports.get(mount.target)
      if (!fromModule) continue
      const filePath = resolveModuleFile(rootDir, fromModule)
      if (!filePath) continue

      const group = groupNameFromModulePath(fromModule)
      const groupPrefix = joinPrefix(base, mount.prefix)
      for (const route of parseRoutesFromFile(filePath)) {
        endpoints.push({
          method: route.method,
          path: joinPrefix(groupPrefix, route.path),
          group,
        })
      }
    }

    return endpoints.length > 0 ? endpoints : FALLBACK_ENDPOINTS
  } catch {
    return FALLBACK_ENDPOINTS
  }
}
