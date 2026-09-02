// The search hit's one line, and what it must not lose.
//
// DIRECTION §5 keeps the result row at a single 52 px line with the same fixed
// sender column as the list, because scannability is the point of both — so
// two of the nine demo subjects reach the ellipsis and no widening is coming.
// The owner ruling (2026-09-02) is that the row keeps its shape and the
// subject keeps its whole text: `truncate` is a paint rather than a cut, so
// the full string stays in the accessible name, and `title` hands the same
// string to a sighted reader on hover.
//
// `ThreadResult` is called rather than rendered — these tests run in plain
// Node, like tests/icon.test.ts, and everything under test is in the element
// tree the component returns.

import { describe, expect, it } from 'vitest'

import { ThreadResult } from '../src/components/thread-result'
import type { Thread } from '../src/core/types'

type Node = {
  type?: unknown
  props?: { className?: string; title?: string; children?: unknown }
} | null

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

function row(subject: string): Node {
  return ThreadResult({
    thread: threadWith(subject),
    selfEmails: ['me@example.com'],
  }) as unknown as Node
}

/** Every element in the returned tree, depth first. */
function walk(node: unknown, out: NonNullable<Node>[] = []): NonNullable<Node>[] {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out)
    return out
  }
  if (!node || typeof node !== 'object') return out
  const element = node as NonNullable<Node>
  if (!element.props) return out
  out.push(element)
  return walk(element.props.children, out)
}

/** Everything a screen reader would concatenate into the row's name. */
function textOf(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (!node || typeof node !== 'object') return ''
  return textOf((node as NonNullable<Node>).props?.children)
}

const subjectSpan = (subject: string) =>
  walk(row(subject)).find((el) => el.props?.className?.includes('flex-1'))

describe('the search result row — issue #23, owner ruling 2026-09-02', () => {
  it('carries the whole subject as a title, however long it is', () => {
    expect(subjectSpan(LONG_SUBJECT)?.props?.title).toBe(LONG_SUBJECT)
  })

  it('keeps the whole subject in the row accessible name, not just the visible run', () => {
    // `truncate` is overflow + ellipsis: the text is never cut from the DOM and
    // the span is not hidden from the tree, so the name a screen reader builds
    // from the row's contents still contains every word of the subject.
    expect(textOf(row(LONG_SUBJECT))).toContain(LONG_SUBJECT)
  })

  it('names an empty subject the same way in the tooltip and on screen', () => {
    const span = subjectSpan('')
    expect(span?.props?.title).toBe('(no subject)')
    expect(textOf(span)).toBe('(no subject)')
  })

  it('leaves the fixed sender column and the single line alone', () => {
    // The two things the ruling explicitly keeps. A widened or shrink-to-fit
    // sender column is the change this row is not allowed to make, and the
    // subject is still the last thing on the line — the trailing column left
    // in the first pass and does not come back to pay for the tooltip.
    const elements = walk(row(LONG_SUBJECT))
    const sender = elements.find((el) => el.props?.className?.includes('--wren-result-sender-w'))
    expect(sender?.props?.className).toContain('shrink-0')
    expect(sender?.props?.className).toContain('truncate')
    const classes = elements.flatMap((el) => el.props?.className?.split(/\s+/) ?? [])
    expect(classes.filter((c) => /^h-|:h-/.test(c))).toEqual([])
  })
})
