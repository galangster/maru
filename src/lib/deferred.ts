// A mutation held behind a timer, so an animation can play over the top of it.
//
// Two surfaces need the same three guarantees and used to spell them out
// twice: the thread list holds an archive for as long as the row's tick runs
// (AMIE-STUDY §7(c).1), and the composer holds a send for its undo window
// (MAGIC §3.3). Both must be cancellable, and — the part that is easy to get
// wrong — **nothing held may ever be lost**. A pane unmounting, or the window
// closing, flushes what is waiting in the same turn rather than dropping it.
//
// TODO: the deeper fix is one outbox owned by the mail service, so a held
// mutation is the service's business rather than each surface's. Deferred by
// the orchestrator, 2026-08-28.

/**
 * A set of mutations waiting out their timers, keyed so several can be in
 * flight at once — the thread list holds one per row.
 *
 * Each entry fires at most once: whichever of the timer, `flushAll` or the
 * canceller gets there first wins, and the other two become no-ops.
 */
export class HeldMutations {
  /** key -> the function that runs it now and clears the entry. */
  private readonly pending = new Map<string, () => void>()

  get size(): number {
    return this.pending.size
  }

  has(key: string): boolean {
    return this.pending.has(key)
  }

  /**
   * Hold `run` for `ms`, and return the canceller.
   *
   * Anything already held under the same key fires first, so two holds in a
   * row never race and never reorder: the earlier one goes immediately and the
   * later one starts its own window.
   */
  hold(key: string, run: () => void, ms: number): () => void {
    this.pending.get(key)?.()

    let spent = false
    const claim = (): boolean => {
      if (spent) return false
      spent = true
      window.clearTimeout(timer)
      // Only if this entry is still ours: a replacement may already own the key.
      if (this.pending.get(key) === fire) this.pending.delete(key)
      return true
    }
    const fire = () => {
      if (claim()) run()
    }
    const timer = window.setTimeout(fire, ms)
    this.pending.set(key, fire)

    return () => {
      claim()
    }
  }

  /** Run everything still waiting, now, in this turn. */
  flushAll(): void {
    for (const fire of [...this.pending.values()]) fire()
    this.pending.clear()
  }
}
