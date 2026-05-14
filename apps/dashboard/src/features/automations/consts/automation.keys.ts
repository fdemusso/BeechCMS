export const AUTOMATION_QUERY_KEYS = {
  all: ['automations'] as const,
  lists: () => [...AUTOMATION_QUERY_KEYS.all, 'list'] as const,
  list: (seedSlug: string) => [...AUTOMATION_QUERY_KEYS.lists(), seedSlug] as const,
  items: () => [...AUTOMATION_QUERY_KEYS.all, 'item'] as const,
  item: (id: string) => [...AUTOMATION_QUERY_KEYS.items(), id] as const,
}
