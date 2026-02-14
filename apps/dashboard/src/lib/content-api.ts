import { api } from "./api"
import type { ContentEntry } from "./dynamic-columns"

/**
 * Content API Helper Functions
 * Funzioni wrapper per le chiamate API CRUD a /api/content/:slug
 */

/**
 * Recupera la lista di tutte le entry per uno specifico slug.
 * TODO: Passare a fetch paginato (page, limit) quando si implementa server-side pagination.
 */
export async function fetchContentList(slug: string): Promise<ContentEntry[]> {
  const response = await api.get<ContentEntry[]>(`/content/${slug}`)
  return response.data
}

/**
 * Recupera i dettagli di una singola entry.
 */
export async function fetchContentById(
  slug: string,
  id: string
): Promise<ContentEntry> {
  const response = await api.get<ContentEntry>(`/content/${slug}/${id}`)
  return response.data
}

/**
 * Crea una nuova entry.
 * Restituisce l'ID della entry creata.
 */
export async function createContent(
  slug: string,
  data: Record<string, unknown>
): Promise<{ id: string }> {
  const response = await api.post<{ id: string }>(`/content/${slug}`, data)
  return response.data
}

/**
 * Aggiorna una entry esistente.
 */
export async function updateContent(
  slug: string,
  id: string,
  data: Record<string, unknown>
): Promise<{ success: boolean }> {
  const response = await api.put<{ success: boolean }>(
    `/content/${slug}/${id}`,
    data
  )
  return response.data
}

/**
 * Elimina una entry.
 */
export async function deleteContent(
  slug: string,
  id: string
): Promise<{ success: boolean }> {
  const response = await api.delete<{ success: boolean }>(
    `/content/${slug}/${id}`
  )
  return response.data
}
