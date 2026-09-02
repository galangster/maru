import { useEffect, useMemo, useState } from 'react'

import type { Thread } from '@/core/types'
import { SEARCH_OPERATOR_HINTS } from '@/core/search/operators'
import type { BulkActionType } from '@/features/list/bulk'
import { MIN_SEARCH_LENGTH, useAccountsById, useSearch } from '@/features/mail/queries'
import { useNow } from '@/lib/use-now'
import { MobileListSkeleton, MobilePrompt } from '../components/placeholders'
import { MobileIcon } from '../components/mobile-icon'
import { SwipeThreadRow } from '../components/swipe-thread-row'
import { buildMobileRowModel, deferTarget, visibleResults, type DeferTarget } from '../state'
import { batchActions, gestureHint } from '../thread-actions'
import './search-screen.css'

const SEARCH_HINT_ID = 'mobile-search-gesture-hint'

/**
 * Search results are inbox rows. They were their own read-only control until
 * issue 15 — no swipe, no star, no long press, no unread dot — and search is
 * the one list on the phone that reaches archived, sent and deferred mail, so
 * it was the list that could act on the mail nothing else could reach.
 *
 * It is also the one list whose rows are not all in the same place, which is
 * why each row resolves its own verbs (`thread-actions.ts`) rather than the
 * screen resolving them once: a result set holds inbox mail, archived mail,
 * sent mail and trashed mail at the same time.
 */
export function SearchScreen({
  query,
  onQuery,
  onOpen,
  onAct,
  onLater,
  onContext,
  onStar,
}: {
  /**
   * What is being searched for. Shell state, not this screen's, because this
   * screen unmounts whenever anything covers it — a conversation pushed over
   * it, a tab change — and it used to take the query and the results with it
   * (issue 49). Search is how the phone reaches archived, sent and deferred
   * mail, so losing the query is losing the way back to whatever was found.
   *
   * The results come back with it for free: the query is react-query's key, so
   * the same string finds the same cached result set and the list is on screen
   * on the first frame, which is the same promise the inbox's kept scroll
   * position makes.
   */
  query: string
  onQuery: (next: string) => void
  onOpen: (key: string) => void
  onAct: (keys: string[], type: BulkActionType) => void
  onLater: (targets: DeferTarget[]) => void
  onContext: (thread: Thread) => void
  onStar: (thread: Thread) => void
}) {
  const results = useSearch(query)
  const { selfEmails } = useAccountsById()
  const now = useNow()
  /**
   * The results this screen has already put away.
   *
   * Nothing patches `keys.search`, so an archived result used to sit in the
   * list unchanged and offer to be archived again (issue 64). This is the same
   * optimistic drop the inbox gets from `patchLists`, made where the search
   * screen can make it.
   */
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set())
  const putAway = (key: string) => setRemoved((current) => new Set(current).add(key))
  // A new query is a new list. Nothing that was dropped from the old one has
  // anything to say about it.
  useEffect(() => setRemoved(new Set()), [query])
  /**
   * Ask again on the way back in.
   *
   * The query and its results survive a conversation round trip on purpose
   * (issue 49) — but "the results are still here" must not mean "the results
   * are still what they were before you acted on them". This screen unmounts
   * whenever anything covers it, so mounting IS returning, and the local drops
   * above are replaced by the answer rather than added to it.
   */
  const refetch = results.refetch
  useEffect(() => {
    if (query.trim().length >= MIN_SEARCH_LENGTH) void refetch()
    // Once, on the way in. A refetch per keystroke is what `useSearch`'s own
    // key already does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Built once per result set, the way the inbox builds its own. `useNow`
  // ticks every minute and every relative time on the screen comes off it, so
  // without this the whole list of models — and every callback closed over one
  // — was rebuilt each minute for rows that had not changed.
  const rows = useMemo(
    () =>
      visibleResults(
        (results.data ?? []).map((thread) => ({
          thread,
          model: buildMobileRowModel(thread, selfEmails, now),
        })),
        removed,
      ),
    [results.data, selfEmails, now, removed],
  )
  // A result set holds inbox mail, sent mail and trashed mail at once, so the
  // help is the intersection: only the gestures every row on screen will
  // answer to (issue 63).
  const hint = useMemo(() => gestureHint(batchActions(rows.map((row) => row.thread))), [rows])
  return (
    <section className="mobile-screen" aria-label="Search">
      <header className="mobile-nav mobile-search-nav">
        <h1>Search</h1>
        <label className="mobile-search-input">
          <MobileIcon name="search" /><span className="sr-only">Search mail</span>
          <input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={`Search mail (${SEARCH_OPERATOR_HINTS[0]})`} spellCheck={false} autoComplete="off" />
          {query && <button type="button" onClick={() => onQuery('')} aria-label="Clear search"><MobileIcon name="close" scale="small" /></button>}
        </label>
        <div className="mobile-operator-strip" aria-label="Search operators">
          {SEARCH_OPERATOR_HINTS.map((operator) => (
            <button key={operator} type="button" onClick={() => onQuery(`${query}${query && !query.endsWith(' ') ? ' ' : ''}${operator}`)}>{operator}</button>
          ))}
        </div>
      </header>
      <div className="mobile-scroll mobile-search-results">
        {query.trim().length < MIN_SEARCH_LENGTH ? (
          <MobilePrompt icon={<MobileIcon name="search" scale="hero" />} title="Find anything" copy="Search people, subjects, words, or use an operator above." />
        ) : results.isPending ? <MobileListSkeleton /> : rows.length === 0 ? (
          // Two different empties. "Try fewer words" is the wrong sentence for
          // a list that DID find things and has since had all of them put away
          // — that person's search worked.
          (results.data?.length ?? 0) > 0 ? (
            <MobilePrompt icon={<MobileIcon name="archive" scale="hero" />} title="All dealt with" copy="Everything this search found has been put away." />
          ) : (
            <MobilePrompt icon={<MobileIcon name="search" scale="hero" />} title="No results" copy="Try fewer words or a different operator." />
          )
        ) : (
          <div className="mobile-thread-list" aria-describedby={SEARCH_HINT_ID}>
            {rows.map(({ thread, model }) => (
              <SwipeThreadRow
                key={thread.key}
                thread={thread}
                model={model}
                onOpen={() => onOpen(thread.key)}
                onRemove={(type) => { onAct([thread.key], type); putAway(thread.key) }}
                onLater={() => onLater([deferTarget(thread)])}
                onContext={() => onContext(thread)}
                onStar={() => onStar(thread)}
              />
            ))}
          </div>
        )}
      </div>
      <p className="sr-only" id={SEARCH_HINT_ID}>{hint}</p>
    </section>
  )
}
