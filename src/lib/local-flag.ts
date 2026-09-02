/**
 * A one-bit fact this device remembers between launches.
 *
 * `localStorage` is wrapped rather than reached for directly because Safari
 * throws from the property itself when site data is blocked -- an unguarded
 * read is a white screen, not a missing answer. So every caller says what the
 * failure means to it: a flag that gates a one-time offer reads it as "already
 * done", because a phone that cannot remember must not ask on every launch.
 *
 * Keys are namespaced `maru.<area>.<name>`, alongside `maru.push.watches`.
 */
export function readFlag(key: string, fallback: boolean): boolean {
  try {
    const store = globalThis.localStorage
    if (!store) return fallback
    return store.getItem(key) === '1'
  } catch {
    return fallback
  }
}

/** Sets the flag. A store that refuses the write costs one repeat, no more. */
export function writeFlag(key: string): void {
  try {
    globalThis.localStorage?.setItem(key, '1')
  } catch {
    /* Private mode, or a full store. The flag is device-local either way. */
  }
}
