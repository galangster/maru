// The composer body: Tiptap, and the five formatting controls DIRECTION
// allows in a mail composer. Nothing floats — the toolbar is fixed in the
// footer, so the writing surface never moves under the caret.

import { useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'

import { Icon, type IconName } from '@/components/ui/icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { iconButtonClass } from '@/components/wren-controls'
import { cn } from '@/lib/utils'

import './editor.css'

export interface UseBodyEditorOptions {
  initialHtml: string
  onChange: (html: string) => void
}

export function useBodyEditor({ initialHtml, onChange }: UseBodyEditorOptions): Editor | null {
  return useEditor({
    // StarterKit ships its own Link in v3; ours is configured, so the built-in
    // one is switched off rather than registered twice.
    extensions: [
      StarterKit.configure({ link: false, codeBlock: false, horizontalRule: false }),
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' }),
      Placeholder.configure({ placeholder: 'Write your message' }),
    ],
    content: initialHtml,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { 'aria-label': 'Message body', role: 'textbox' } },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })
}

/**
 * The draft box. A field well like the ones above it, and the one the ring has
 * to hug: at `--wren-radius-md` inside the sheet's 12 px inset it is exactly
 * concentric with the sheet's 24, so a focus ring drawn on it follows the same
 * corner geometry instead of cutting a square across a rounded box.
 *
 * `focus-within`, not `focus-visible`: the focusable node is ProseMirror's own
 * contenteditable several levels down, and the ring belongs on the well the
 * user sees rather than on the node the browser happens to focus.
 */
export function BodyEditor({ editor }: { editor: Editor | null }) {
  return (
    <div className="wren-editor bg-sunken rounded-md focus-within:ring-ring/50 min-h-0 flex-1 overflow-y-auto px-3 py-3 focus-within:ring-3">
      <EditorContent editor={editor} className="h-full" />
    </div>
  )
}

interface MarkControl {
  kind: 'mark'
  name: IconName
  label: string
  isActive: (editor: Editor) => boolean
  run: (editor: Editor) => void
}

/** Link is its own control — it asks for a target — but it is still a control. */
interface LinkControl {
  kind: 'link'
}

type Control = MarkControl | LinkControl

/**
 * The toolbar, in order. Link used to sit outside this array and the toolbar
 * spliced it back in with a `slice(2)`, so the order lived in two places and
 * neither of them read as the order.
 */
const CONTROLS: Control[] = [
  {
    kind: 'mark',
    name: 'bold',
    label: 'Bold',
    isActive: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    kind: 'mark',
    name: 'italic',
    label: 'Italic',
    isActive: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  { kind: 'link' },
  {
    kind: 'mark',
    name: 'listBullet',
    label: 'Bulleted list',
    isActive: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    kind: 'mark',
    name: 'listOrdered',
    label: 'Numbered list',
    isActive: (e) => e.isActive('orderedList'),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
]

/** Same 32 px box and the same states as every other icon button in Maru. */
function toolClass(active: boolean): string {
  return active
    ? cn(iconButtonClass(), 'bg-fill-selected text-brand')
    : iconButtonClass()
}

export function FormatToolbar({ editor }: { editor: Editor | null }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Formatting">
      {CONTROLS.map((control) =>
        control.kind === 'link' ? (
          <LinkButton key="link" editor={editor} />
        ) : (
          <ToolButton key={control.name} editor={editor} control={control} />
        ),
      )}
    </div>
  )
}

function ToolButton({ editor, control }: { editor: Editor | null; control: MarkControl }) {
  const active = editor ? control.isActive(editor) : false
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={control.label}
            aria-pressed={active}
            disabled={!editor}
            // The editor must not lose the selection to the button.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor && control.run(editor)}
            className={toolClass(active)}
          />
        }
      >
        {/* 18, not 16: this is a toolbar, and it sat two rows from the reading
            pane's 18 px one (DIRECTION §8, S8). */}
        <Icon name={control.name} />
      </TooltipTrigger>
      <TooltipContent>{control.label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Link. An active link is removed on click; a new one asks for its target in a
 * popover — never `window.prompt`, which WKWebView answers with null and which
 * would be the app's only native dialog.
 */
function LinkButton({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false)
  const [href, setHref] = useState('')
  const active = editor ? editor.isActive('link') : false

  const apply = () => {
    const value = href.trim()
    setOpen(false)
    setHref('')
    if (!editor || value === '') return
    const url = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`
    editor.chain().focus().setLink({ href: url }).run()
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next && active) {
          editor?.chain().focus().unsetLink().run()
          return
        }
        setOpen(next)
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            // No `title` beside the accessible name (N7); this element belongs
            // to the popover trigger, so it carries no Tooltip either.
            aria-label={active ? 'Remove link' : 'Link'}
            aria-pressed={active}
            disabled={!editor}
            onMouseDown={(event) => event.preventDefault()}
            className={toolClass(active)}
          />
        }
      >
        <Icon name="link" />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72">
        <input
          type="url"
          autoFocus
          value={href}
          placeholder="example.com"
          aria-label="Link to"
          onChange={(event) => setHref(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            apply()
          }}
          className="bg-sunken text-ink placeholder:text-ink-3 focus-ring h-8 w-full rounded-sm px-2 text-base"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={apply}
            className="font-ui text-brand hover:text-brand-hover focus-ring h-8 rounded-md px-2 text-base font-medium"
          >
            Add link
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
