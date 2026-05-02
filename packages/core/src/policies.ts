import type { Branch } from './types.js'

export async function sha256hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyHashField(stored: string, candidate: string): Promise<boolean> {
  return stored === (await sha256hex(candidate))
}

/**
 * Risolve le policy di un branch applicando i valori di default.
 * Tutta la logica di accesso ai campi deve passare per questa funzione,
 * mai con inline `branch.policies?.x ?? default`.
 */
export function resolvePolicies(branch: Branch): Required<NonNullable<Branch['policies']>> {
  const privacy = branch.policies?.privacy ?? 'plain'
  // Non-plain privacy implies hidden by default: the CMS hashes/encrypts on write,
  // so returning the stored value would leak the digest to readers.
  const defaultVisibility = privacy !== 'plain' ? 'hidden' : 'full'
  return {
    privacy,
    visibility: branch.policies?.visibility ?? defaultVisibility,
    search: branch.policies?.search ?? true,
    filter: branch.policies?.filter ?? true,
    sort: branch.policies?.sort ?? true,
    public: branch.policies?.public ?? true,
  }
}
