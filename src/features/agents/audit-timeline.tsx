// The audit timeline: everything an agent has done, newest first.
//
// A calm table, in the Aave register DIRECTION §2 records — tall rows, generous
// horizontal padding, a very low-contrast divider, small muted column headers,
// and every time tabular. Density comes from row height, never from cramped
// padding, and nothing here is tinted or striped to signal state: an outcome is
// a 6 px dot and a word.
//
// It is deliberately the plainest surface in the app. The queue asks for a
// decision and can afford some warmth; this is the receipt, and a receipt that
// editorialises is a receipt you stop trusting.

import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { IconButton, PRESS, SurfaceEmpty, SurfaceHeader } from '@/components/wren-controls'
import type { AuditEntry } from '@/core/agents'
import { AUDIT_READ_CAP } from '@/core/agents'
import { focusThreadList, useSurfaces } from '@/features/shell/surface-store'
import { fullTimestamp, relativeTime } from '@/lib/format'
import { now } from '@/lib/env'
import { cn } from '@/lib/utils'

import { AgentDot, OutcomeMark } from './identity'
import { useAgentNames, useAgents, useAuditTrail } from './queries'

/** `'all'` is the store's own "no filter" value; anything else is an agent id. */
const ALL = 'all'

/** The row height the table is scanned by. `h-11`, and the virtualizer's estimate. */
const ROW_H = 44

export function AuditTimeline() {
  const audit = useSurfaces((s) => s.audit)
  const closeAudit = useSurfaces((s) => s.closeAudit)

  return (
    <Dialog
      open={audit !== null}
      onOpenChange={(next) => {
        if (next) return
        closeAudit()
        focusThreadList()
      }}
    >
      <DialogContent
        showCloseButton={false}
        // Wider and taller than the queue: this is a table that is read by
        // scanning down a column, and a short one would be all chrome.
        //
        // Capped rather than fixed, for the reason the queue gives one line
        // over: 560 was a floor as well as a ceiling, so an empty log drew the
        // half-metre of nothing the queue explicitly refuses (N2). A full log
        // still reaches 560; an empty one stops at the height its own empty
        // state needs.
        className="bg-raised rounded-2xl shadow-xl flex max-h-[min(560px,calc(100dvh-8rem))] min-h-[320px] w-[760px] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden border-0 p-0 ring-0 sm:max-w-[760px]"
      >
        <DialogTitle className="sr-only">Audit</DialogTitle>
        <DialogDescription className="sr-only">
          Every action an agent has taken in this mailbox, newest first.
        </DialogDescription>
        {audit !== null && <TimelineBody filter={audit} />}
      </DialogContent>
    </Dialog>
  )
}

function TimelineBody({ filter }: { filter: string }) {
  const openAudit = useSurfaces((s) => s.openAudit)
  const closeAudit = useSurfaces((s) => s.closeAudit)
  const agents = useAgents().data ?? []
  const names = useAgentNames()
  const trail = useAuditTrail(filter === ALL ? undefined : filter)
  const rows = trail.data ?? []

  // The log is capped at AUDIT_READ_CAP, and capped is not the same as cheap:
  // about eleven rows are visible and the other ~489 were mounted, each with
  // four cells, a dot, an outcome mark and a title (S5). Same primitive the
  // thread list uses, driving spacer rows above and below the window so the
  // <table> keeps its own column sizing and its semantics.
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    getItemKey: (index) => rows[index].id,
    // Generous on purpose: the header scrolls with the body, so the virtualizer's
    // offsets run ~34 px ahead of the real ones. Twelve rows of overscan is
    // 528 px of slack against a 34 px error, which is what lets the table keep
    // one scroll container instead of splitting the header out of it.
    overscan: 12,
  })
  const windowed = virtualizer.getVirtualItems()
  const padTop = windowed.length > 0 ? windowed[0].start : 0
  const padBottom =
    windowed.length > 0 ? virtualizer.getTotalSize() - windowed[windowed.length - 1].end : 0

  return (
    <>
      <SurfaceHeader title="Audit">
        <IconButton
          name="close"
          label="Close the audit log"
          hint="esc"
          className="shrink-0"
          onClick={closeAudit}
        />
      </SurfaceHeader>

      {/* Per-agent filter chips. One row, left-aligned, the same soft-fill
          selection every other selected thing in Maru takes.

          A group of pressed toggles, not a `role="tablist"`. The tablist role
          promises roving tabindex, arrow-key traversal, `aria-controls` and a
          `role="tabpanel"`, and this control implemented none of them: a screen
          reader announced "tab, 1 of 2" and the arrow keys did nothing
          (UI-REVIEW-2026-08-29 B2). This is a filter that is really a toggle,
          so it takes the pattern the capability chips already use — honest, and
          needing no arrow keys. */}
      <div
        role="group"
        aria-label="Filter by agent"
        className="border-hairline flex shrink-0 items-center gap-1 border-b px-4 py-2"
      >
        <FilterTab id={ALL} label="All agents" active={filter === ALL} onSelect={openAudit} />
        {agents.map((agent) => (
          <FilterTab
            key={agent.id}
            id={agent.id}
            label={agent.name}
            agentId={agent.id}
            active={filter === agent.id}
            onSelect={openAudit}
          />
        ))}
      </div>

      <div ref={scrollRef} className="scroll-fade min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <SurfaceEmpty icon="fileText" title="Nothing recorded yet">
            Every read, archive, draft and send an agent makes is written here, and stays.
          </SurfaceEmpty>
        ) : (
          <table className="w-full border-collapse text-left">
            {/* Small and muted, not bold: hierarchy by colour, never by weight
                (DIRECTION §2, Aave 4). */}
            <thead>
              <tr className="border-hairline border-b">
                <Th className="w-28">Time</Th>
                <Th className="w-36">Agent</Th>
                <Th>Action</Th>
                <Th className="w-24">Outcome</Th>
              </tr>
            </thead>
            <tbody>
              {padTop > 0 && <tr aria-hidden style={{ height: padTop }} />}
              {windowed.map((item) => {
                const entry = rows[item.index]
                return (
                  <Row key={entry.id} entry={entry} name={names.get(entry.agentId)?.name} />
                )
              })}
              {padBottom > 0 && <tr aria-hidden style={{ height: padBottom }} />}
            </tbody>
          </table>
        )}
      </div>

      {rows.length >= AUDIT_READ_CAP && (
        <p className="border-hairline text-ink-3 shrink-0 border-t px-6 py-2 text-xs">
          Showing the most recent {AUDIT_READ_CAP} entries.
        </p>
      )}
    </>
  )
}

function FilterTab({
  id,
  label,
  agentId,
  active,
  onSelect,
}: {
  id: string
  label: string
  agentId?: string
  active: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(id)}
      className={cn(
        // A pill, like every other chip in the app (DIRECTION §6).
        'font-ui inline-flex h-8 items-center gap-2 rounded-full px-3 text-base outline-none',
        'transition-[color,background-color,scale] duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        PRESS,
        'focus-ring',
        active ? 'bg-fill-selected text-ink font-medium' : 'text-ink-2 hover:bg-fill-hover',
      )}
    >
      {agentId && <AgentDot agent={{ id: agentId }} />}
      <span className="truncate">{label}</span>
    </button>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn('text-ink-3 px-6 py-2 text-sm font-normal', className)}
    >
      {children}
    </th>
  )
}

function Row({ entry, name }: { entry: AuditEntry; name?: string }) {
  return (
    // 44 px, the bottom of DIRECTION §2's 44–52 band, with the same very
    // low-contrast divider. No hover fill: nothing here is clickable, and a
    // hover state on a static row is a promise the table does not keep.
    <tr className="border-hairline h-11 border-b last:border-b-0">
      <td className="text-ink-3 px-6 text-sm tabular-nums" title={fullTimestamp(entry.at)}>
        {relativeTime(entry.at, now())}
      </td>
      <td className="px-6">
        <span className="text-ink-2 inline-flex items-center gap-2 text-sm">
          <AgentDot agent={{ id: entry.agentId }} />
          {/* A revoked agent's rows outlive its name in the list, so the id is
              the fallback rather than a blank cell. */}
          <span className="truncate">{name ?? entry.agentId}</span>
        </span>
      </td>
      {/* One line, with the whole sentence on the title: a summary that wrapped
          would break the fixed row height the table is scanned by, and one that
          truncated with no way back would be an audit log that withheld. */}
      <td className="text-ink px-6 text-sm" title={entry.summary}>
        <span className="line-clamp-1">{entry.summary}</span>
      </td>
      <td className="px-6">
        <OutcomeMark outcome={entry.outcome} />
      </td>
    </tr>
  )
}
