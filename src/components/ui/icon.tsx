// The icon seam — DIRECTION.md §8.
//
// Every icon in Wren comes from here, by semantic name. No component imports
// from `lucide-react` directly, which is what makes the eventual swap a
// one-file change:
//
//   ANRON SWAP: replace the GLYPHS map below with the Anron components of the
//   same semantic names. Nothing outside this file moves. Keep the size grid,
//   the stroke widths and the round caps — they are the reason lucide reads
//   close to Anron today.
//
// Size grid: 16 inline with text and meta · 18 toolbars and menus · 20 sidebar
// nav and primary actions. Never 24 in chrome.
// Stroke: 1.75 at 16 and 18, 1.5 at 20 — lucide's default 2 reads hard next to
// Open Runde's soft terminals.

import {
  Archive,
  Bold,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  File,
  FileText,
  Forward,
  Image as ImageGlyph,
  ImageOff,
  Inbox,
  Info,
  Italic,
  Keyboard,
  KeyRound,
  Link2,
  List,
  ListOrdered,
  Mail,
  MailOpen,
  Maximize2,
  Minus,
  Monitor,
  Moon,
  PanelLeft,
  Paperclip,
  Plus,
  Reply,
  ReplyAll,
  RefreshCw,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  SquarePen,
  Star,
  Sun,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

const GLYPHS = {
  about: Info,
  add: Plus,
  archive: Archive,
  attachment: Paperclip,
  bold: Bold,
  calendar: CalendarDays,
  check: Check,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  compose: SquarePen,
  error: CircleAlert,
  expand: Maximize2,
  external: ExternalLink,
  file: File,
  fileText: FileText,
  forward: Forward,
  image: ImageGlyph,
  imageOff: ImageOff,
  inbox: Inbox,
  italic: Italic,
  key: KeyRound,
  link: Link2,
  listBullet: List,
  listOrdered: ListOrdered,
  minimize: Minus,
  panelLeft: PanelLeft,
  participants: Users,
  read: MailOpen,
  reply: Reply,
  replyAll: ReplyAll,
  search: Search,
  sent: Send,
  settings: Settings,
  shortcuts: Keyboard,
  sliders: SlidersHorizontal,
  star: Star,
  sync: RefreshCw,
  themeDark: Moon,
  themeLight: Sun,
  themeSystem: Monitor,
  trash: Trash2,
  unread: Mail,
  close: X,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof GLYPHS

/** The three permitted sizes. 24 is the icon *box*, never the glyph. */
export type IconSize = 16 | 18 | 20

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'ref'> {
  name: IconName
  size?: IconSize
  /** Star and similar duotone-by-fill glyphs. */
  filled?: boolean
}

export function Icon({ name, size = 18, filled = false, className, ...props }: IconProps) {
  const Glyph = GLYPHS[name]
  return (
    <Glyph
      aria-hidden
      focusable={false}
      width={size}
      height={size}
      strokeWidth={size === 20 ? 1.5 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={filled ? 'currentColor' : 'none'}
      className={cn('shrink-0 [&_*]:[vector-effect:non-scaling-stroke]', className)}
      {...props}
    />
  )
}
