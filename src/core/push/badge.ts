/**
 * The number on the app icon: unread threads in the unified inbox.
 *
 * Sanitised rather than trusted. The count comes from a SQL aggregate that a
 * failed sync can leave undefined, and handing iOS a NaN or a negative badge
 * is an exception on the native side, not a wrong number on screen.
 */
export function badgeCount(unread: number | null | undefined): number {
  if (typeof unread !== 'number' || !Number.isFinite(unread)) return 0
  return Math.max(0, Math.floor(unread))
}
