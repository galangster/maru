import { useState } from 'react'
import { ChevronRight, Search, X } from 'lucide-react'

import { SEARCH_OPERATOR_HINTS } from '@/core/search/operators'
import { MIN_SEARCH_LENGTH, useAccountsById, useSearch } from '@/features/mail/queries'
import { useNow } from '@/lib/use-now'
import { MobileListSkeleton, MobilePrompt } from '../components/placeholders'
import { buildMobileRowModel } from '../state'
import './search-screen.css'

export function SearchScreen({ onOpen }: { onOpen: (key: string) => void }) {
  const [query, setQuery] = useState('')
  const results = useSearch(query)
  const { selfEmails } = useAccountsById()
  const now = useNow()
  return (
    <section className="mobile-screen" aria-label="Search">
      <header className="mobile-nav mobile-search-nav">
        <h1>Search</h1>
        <label className="mobile-search-input">
          <Search size={18} aria-hidden /><span className="sr-only">Search mail</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search mail (${SEARCH_OPERATOR_HINTS[0]})`} spellCheck={false} autoComplete="off" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={16} /></button>}
        </label>
        <div className="mobile-operator-strip" aria-label="Search operators">
          {SEARCH_OPERATOR_HINTS.map((operator) => (
            <button key={operator} type="button" onClick={() => setQuery(`${query}${query && !query.endsWith(' ') ? ' ' : ''}${operator}`)}>{operator}</button>
          ))}
        </div>
      </header>
      <div className="mobile-scroll mobile-search-results">
        {query.trim().length < MIN_SEARCH_LENGTH ? (
          <MobilePrompt icon={<Search size={26} />} title="Find anything" copy="Search people, subjects, words, or use an operator above." />
        ) : results.isPending ? <MobileListSkeleton /> : (results.data?.length ?? 0) === 0 ? (
          <MobilePrompt icon={<Search size={26} />} title="No results" copy="Try fewer words or a different operator." />
        ) : (
          <div className="mobile-thread-list">
            {results.data?.map((thread) => {
              const row = buildMobileRowModel(thread, selfEmails, now)
              return (
                <button className="mobile-search-result" type="button" key={thread.key} onClick={() => onOpen(thread.key)}>
                  <span className="mobile-search-result-copy"><strong>{row.sender}</strong><span>{row.subject}</span><small>{row.snippet}</small></span>
                  <time>{row.time}</time><ChevronRight size={17} />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
