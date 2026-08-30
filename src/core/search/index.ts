// Local thread search.
//
// MiniSearch rather than SQLite FTS5: the index is small (a 90-day window),
// it keeps the store seam free of a native full-text extension, and prefix
// matching gives the command palette live results as the user types.

import MiniSearch from 'minisearch'
import type { Thread } from '../types'

interface ThreadDoc {
  id: string
  subject: string
  participants: string
  snippet: string
  body: string
}

const FIELDS = ['subject', 'participants', 'snippet', 'body'] as const

function participantsText(thread: Thread): string {
  return thread.participants.map((p) => [p.name, p.email].filter(Boolean).join(' ')).join(' ')
}

function toDoc(thread: Thread, body: string): ThreadDoc {
  return {
    id: thread.key,
    subject: thread.subject,
    participants: participantsText(thread),
    snippet: thread.snippet,
    body,
  }
}

export class ThreadSearchIndex {
  private mini: MiniSearch<ThreadDoc>
  private readonly threads = new Map<string, Thread>()
  private readonly bodies = new Map<string, string>()

  constructor() {
    this.mini = this.fresh()
  }

  private fresh(): MiniSearch<ThreadDoc> {
    return new MiniSearch<ThreadDoc>({
      fields: [...FIELDS],
      idField: 'id',
      searchOptions: {
        prefix: true,
        fuzzy: 0.2,
        combineWith: 'AND',
        boost: { subject: 3, participants: 2 },
      },
    })
  }

  get size(): number {
    return this.threads.size
  }

  has(key: string): boolean {
    return this.threads.has(key)
  }

  /** Full rebuild — used on startup from the store. */
  replaceAll(threads: Thread[], bodies?: Map<string, string>): void {
    this.mini = this.fresh()
    this.threads.clear()
    this.bodies.clear()
    for (const t of threads) {
      this.threads.set(t.key, t)
      const body = bodies?.get(t.key) ?? ''
      if (body) this.bodies.set(t.key, body)
    }
    this.mini.addAll(threads.map((t) => toDoc(t, this.bodies.get(t.key) ?? '')))
  }

  /** Adds or replaces one thread. An omitted body keeps any body already held. */
  upsert(thread: Thread, bodyText?: string): void {
    if (bodyText !== undefined) this.bodies.set(thread.key, bodyText)
    if (this.mini.has(thread.key)) this.mini.discard(thread.key)
    this.threads.set(thread.key, thread)
    this.mini.add(toDoc(thread, this.bodies.get(thread.key) ?? ''))
  }

  upsertMany(threads: Thread[]): void {
    for (const t of threads) this.upsert(t)
  }

  /**
   * Re-indexes one thread against a body that has just been hydrated. A thread
   * the index has never seen is remembered as a body only, so the row picks it
   * up when it arrives.
   */
  setBody(key: string, bodyText: string): void {
    this.bodies.set(key, bodyText)
    const thread = this.threads.get(key)
    if (!thread) return
    if (this.mini.has(key)) this.mini.discard(key)
    this.mini.add(toDoc(thread, bodyText))
  }

  remove(key: string): void {
    if (this.mini.has(key)) this.mini.discard(key)
    this.threads.delete(key)
    this.bodies.delete(key)
  }

  removeMany(keys: string[]): void {
    for (const key of keys) this.remove(key)
  }

  /** Every indexed thread, newest first — the base for operator-only queries. */
  all(): Thread[] {
    return [...this.threads.values()].sort(
      (a, b) => b.lastMessageAt - a.lastMessageAt || a.key.localeCompare(b.key),
    )
  }

  /** Threads in local relevance order. */
  search(query: string, limit = 100): Thread[] {
    const q = query.trim()
    if (!q) return []
    const out: Thread[] = []
    for (const hit of this.mini.search(q)) {
      const thread = this.threads.get(String(hit.id))
      if (thread) out.push(thread)
      if (out.length >= limit) break
    }
    return out
  }
}
