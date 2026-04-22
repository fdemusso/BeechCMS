import { type ContentListQueryParams } from "../api/content.api"

export const CONTENT_QUERY_KEYS = {
  all: ["content"] as const,
  lists: () => [...CONTENT_QUERY_KEYS.all, "list"] as const,
  list: (slug: string, params: ContentListQueryParams) =>
    [...CONTENT_QUERY_KEYS.lists(), slug, params] as const,
}

export const FACET_QUERY_KEYS = {
  all: ["facets"] as const,
  bySlug: (slug: string) => [...FACET_QUERY_KEYS.all, slug] as const,
}
