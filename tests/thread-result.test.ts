// @vitest-environment jsdom
//
// The search hit's one line, and what it must not lose.
//
// DIRECTION §5 keeps the result row at a single 52 px line with the same fixed
// sender column as the list, because scannability is the point of both — so
// two of the nine demo subjects reach the ellipsis and no widening is coming.
// The owner ruling (2026-09-02) is that the row keeps its shape and the
// subject keeps its whole text: `truncate` is a paint rather than a cut, so
// the full string stays in the rendered text, and `title` hands the same
// string to a sighted reader on hover.
//
// Rendered rather than inspected as an element tree. The claims here are about
// the DOM a reader and a screen reader meet — a `title` attribute, the text a
// row concatenates — and walking React elements answers a different question
// that happens to agree most of the time.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ThreadResult } from '@/components/thread-result'
import type { Thread } from '@/core/types'

/** The longest of the nine demo subjects — the one that needed 244 px in 140. */
const LONG_SUBJECT =
  'Re: Kirinyaga lot, the sample roast, and what we should do about the September subscription window'

function threadWith(subject: string): Thread {
  return {
    key: 'acct/1',
    gmailThreadId: '1',
    accountId: 'acct',
    subject,
    snippet: 'a snippet',
    lastMessageAt: Date.UTC(2026, 8, 2, 21, 3),
    participants: [{ name: 'Brightwater Coffee', email: 'hello@brightwatercoffee.example' }],
    labelIds: ['INBOX'],
    unread: false,
    starred: false,
    messageCount: 2,
    hasAttachments: false,
  }
}

/** The row, in the DOM. */
function render(subject: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(
    createElement(ThreadResult, { thread: threadWith(subject), selfEmails: ['me@example.com'] }),
  )
  return host
}

const subjectSpan = (row: HTMLElement) => row.querySelector<HTMLElement>('span[title]')

/** The fixed column, found by the token that sets its width. */
const senderSpan = (row: HTMLElement) =>
  row.querySelector<HTMLElement>('span[class*="--wren-result-sender-w"]')

describe('the search result row — issue #23, owner ruling 2026-09-02', () => {
  it('carries the whole subject as a title, however long it is', () => {
    expect(subjectSpan(render(LONG_SUBJECT))?.title).toBe(LONG_SUBJECT)
  })

  it('keeps the whole subject in the row text, not just the visible run', () => {
    // `truncate` is overflow + ellipsis: the text is never cut from the DOM and
    // the span is not hidden from the tree, so the name a screen reader builds
    // from the row's contents still contains every word of the subject.
    expect(render(LONG_SUBJECT).textContent).toContain(LONG_SUBJECT)
  })

  it('names an empty subject the same way in the tooltip and on screen', () => {
    const span = subjectSpan(render(''))
    expect(span?.title).toBe('(no subject)')
    expect(span?.textContent).toBe('(no subject)')
  })

  it('leaves the fixed sender column alone', () => {
    // The thing the ruling explicitly keeps. A widened or shrink-to-fit sender
    // column is the change this row is not allowed to make, so the column is
    // asserted to be both fixed and the one that clips.
    const sender = senderSpan(render(LONG_SUBJECT))
    expect(sender?.classList.contains('shrink-0')).toBe(true)
    expect(sender?.classList.contains('truncate')).toBe(true)
  })

  it('puts the subject last on the line, with no trailing column', () => {
    // The trailing relative time left in the first pass and does not come back
    // to pay for the tooltip. What follows the subject is the sr-only stamp,
    // which takes no width.
    const row = render(LONG_SUBJECT)
    const after = subjectSpan(row)?.nextElementSibling
    expect(after?.tagName).toBe('TIME')
    expect(after?.className).toContain('sr-only')
    expect(after?.nextElementSibling).toBe(null)
  })
})
