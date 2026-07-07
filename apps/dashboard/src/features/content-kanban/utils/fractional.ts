import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

/** Position for a card dropped between `before` and `after` in the destination column. */
export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after)
}

export function rebalanceKeys(count: number): string[] {
  return generateNKeysBetween(null, null, count)
}
