// The list's lens: sort order and filter, one popover on the list header.
// The default — newest first, everything shown — is not a state the control
// celebrates; the trigger only takes the brand tone while the lens is doing
// something, so a glance at the header answers "am I seeing all of it?".

import { Icon } from '@/components/ui/icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { OptionRow, SECTION_LABEL, SegmentedGroup, iconButtonClass } from '@/components/wren-controls'
import {
  isDefaultPrefs,
  useListPrefs,
  useUi,
  type ListFilter,
  type ListSort,
} from '@/features/mail/ui-store'
import { cn } from '@/lib/utils'

import { FILTER_LABELS } from './list-prefs'

const SORTS: { id: ListSort; label: string }[] = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
]

const FILTERS: ListFilter[] = ['all', 'unread', 'starred', 'attachments']

export function ListControls() {
  const view = useUi((s) => s.view)
  const prefs = useListPrefs()
  const setListPrefs = useUi((s) => s.setListPrefs)
  const active = !isDefaultPrefs(prefs)

  return (
    <Popover>
      {/* The trigger owns the element it clones, so this is the recipe, not
          <IconButton> — the same reason the composer's toolbar triggers use it. */}
      <PopoverTrigger
        aria-label="Filter and sort"
        className={iconButtonClass(active ? 'brand' : 'default')}
      >
        <Icon name="sliders" size={18} />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8}>
        <div className="flex flex-col gap-1.5">
          <p className={SECTION_LABEL}>Sort</p>
          <SegmentedGroup
            label="Sort"
            value={prefs.sort}
            options={SORTS}
            onChange={(sort) => setListPrefs(view, { sort })}
            full
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <p className={SECTION_LABEL}>Show</p>
          <div role="group" aria-label="Show" className="flex flex-col gap-0.5">
            {FILTERS.map((filter) => (
              <OptionRow
                key={filter}
                selected={filter === prefs.filter}
                onClick={() => setListPrefs(view, { filter })}
              >
                {FILTER_LABELS[filter]}
              </OptionRow>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
