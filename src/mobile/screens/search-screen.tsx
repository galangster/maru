import { useState } from 'react'

import type { MailActionType, Thread } from '@/core/types'
import { SEARCH_OPERATOR_HINTS } from '@/core/search/operators'
import { MIN_SEARCH_LENGTH, useAccountsById, useSearch } from '@/features/mail/queries'
import { useNow } from '@/lib/use-now'
import { MobileListSkeleton, MobilePrompt } from '../components/placeholders'
import { MobileIcon } from '../components/mobile-icon'
import { SwipeThreadRow } from '../components/swipe-thread-row'
import { buildMobileRowModel, deferTarget, type DeferTarget } from '../state'
import './search-screen.css'

const SEARCH_HINT_ID = 'mobile-search-gesture-hint'

/**
 * Search results are inbox rows. They were their own read-only control until
 * issue 15 — no swipe, no star, no long press, no unread dot — and search is
 * the one list on the phone that reaches archived, sent and deferred mail, so
 * it was the list that could act on the mail nothing else could reach.
 */
export function SearchScreen({
  onOpen,
  onAct,
  onLater,
  onContext,
  onStar,
}: {
  onOpen: (key: string) => void
  onAct: (keys: string[], type: MailActionType) => void
  onLater: (targets: DeferTarget[]) => void
  onContext: (thread: Thread) => void
  onStar: (thread: Thread) => void
}) {
  const [query, setQuery] = useState('')
  const results = useSearch(query)
  const { selfEmails } = useAccountsById()
  const now = useNow()
  return (
    <section className="mobile-screen" aria-label="Search">
      <header className="mobile-nav mobile-search-nav">
        <h1>Search</h1>
        <label className="mobile-search-input">
          <MobileIcon name="search" /><span className="sr-only">Search mail</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search mail (${SEARCH_OPERATOR_HINTS[0]})`} spellCheck={false} autoComplete="off" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><MobileIcon name="close" scale="small" /></button>}
        </label>
        <div className="mobile-operator-strip" aria-label="Search operators">
          {SEARCH_OPERATOR_HINTS.map((operator) => (
            <button key={operator} type="button" onClick={() => setQuery(`${query}${query && !query.endsWith(' ') ? ' ' : ''}${operator}`)}>{operator}</button>
          ))}
        </div>
      </header>
      <div className="mobile-scroll mobile-search-results">
        {query.trim().length < MIN_SEARCH_LENGTH ? (
          <MobilePrompt icon={<MobileIcon name="search" scale="hero" />} title="Find anything" copy="Search people, subjects, words, or use an operator above." />
        ) : results.isPending ? <MobileListSkeleton /> : (results.data?.length ?? 0) === 0 ? (
          <MobilePrompt icon={<MobileIcon name="search" scale="hero" />} title="No results" copy="Try fewer words or a different operator." />
        ) : (
          <div className="mobile-thread-list" aria-describedby={SEARCH_HINT_ID}>
            {results.data?.map((thread) => (
              <SwipeThreadRow
                key={thread.key}
                thread={thread}
                model={buildMobileRowModel(thread, selfEmails, now)}
                editing={false}
                selected={false}
                onSelect={() => {}}
                onOpen={() => onOpen(thread.key)}
                onArchive={() => onAct([thread.key], 'archive')}
                onLater={() => onLater([deferTarget(thread)])}
                onContext={() => onContext(thread)}
                onStar={() => onStar(thread)}
              />
            ))}
          </div>
        )}
      </div>
      <p className="sr-only" id={SEARCH_HINT_ID}>Swipe right to archive or left to save for later. Long press for more actions.</p>
    </section>
  )
}
