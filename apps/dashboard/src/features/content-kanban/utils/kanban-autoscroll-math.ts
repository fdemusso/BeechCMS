/**
 * Returns the scrollTop delta to apply given the pointer's Y position and the
 * scroll container's bounding rect: negative near the top edge, positive near
 * the bottom edge, zero elsewhere.
 */
export function scrollDelta(
  pointerY: number,
  rect: { top: number; bottom: number },
  edgePx: number,
  speed: number,
): number {
  if (pointerY - rect.top < edgePx) return -speed
  if (rect.bottom - pointerY < edgePx) return speed
  return 0
}
