import type { Context } from 'hono'

export interface PublicProblemDetailItem {
  field: string
  expected: string
  received: string
  message: string
}

type PublicProblemInput = {
  type: string
  title: string
  status: 400 | 401 | 403 | 404 | 409 | 422 | 500
  detail: string
  errors?: PublicProblemDetailItem[]
}

function normalizeProblemType(type: string): string {
  if (type.startsWith('http://') || type.startsWith('https://')) {
    return type
  }
  return `https://beechcms.dev/problems/${type}`
}

/**
 * Restituisce errori Public API in formato Problem Details, mantenendo
 * compatibilità con il payload legacy (`error`, `message`, `details`).
 */
export function publicProblem(c: Context, input: PublicProblemInput): Response {
  const body: Record<string, unknown> = {
    type: normalizeProblemType(input.type),
    title: input.title,
    status: input.status,
    detail: input.detail,
    instance: c.req.path,
    // Legacy compatibility fields.
    error: input.title,
    message: input.detail,
  }
  if (input.errors && input.errors.length > 0) {
    body.errors = input.errors
    body.details = input.errors
  }
  return c.json(body, input.status, {
    'Content-Type': 'application/problem+json',
  })
}
