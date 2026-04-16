// BeechCMS Public API Client

const API_BASE = 'http://localhost:8789/api/v1/public'
const PUBLIC_READ_API_KEY = 'dev-public-read-key-changeme'
const PUBLIC_WRITE_API_KEY = 'dev-public-write-key-changeme'

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean>
}

export async function fetchApi<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { params, ...init } = options
  
  let url = `${API_BASE}${endpoint}`
  if (params) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      searchParams.append(key, String(value))
    }
    url += `?${searchParams.toString()}`
  }

  const method = init.method || 'GET'
  const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
  const currentKey = isRead ? PUBLIC_READ_API_KEY : PUBLIC_WRITE_API_KEY

  const headers = new Headers(init.headers)
  headers.set('X-API-Key', currentKey)
  if (init.body) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, { ...init, headers })
  
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    console.error('API Error:', { status: response.status, body: errorBody })
    throw new Error(errorBody.title || errorBody.detail || 'API request failed')
  }

  return response.json()
}

export type Entry<T> = {
  id: string
  slug: string
  created_at: number
  updated_at: number
  status: 'draft' | 'review' | 'published'
} & T

export interface GetListResponse<T> {
  data: Entry<T>[]
  meta: {
    total: number
    page: number
    limit: number
    returned: number
    seed: string
  }
}

export interface GetSingleResponse<T> {
  data: Entry<T>
  meta: { seed: string }
}
