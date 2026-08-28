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
      Placeholder.configure({ placeholder: 'Write something…' }),
    ],
    content: initialHtml,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { 'aria-label': 'Message body', role: 'textbox' } },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })
}

export function BodyEditor({ editor }: { editor: Editor | null }) {
  return (
    <div className="wren-editor min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <EditorContent editor={editor} className="h-full" />
    </div>
  )
}

interface Control {
  name: IconName
  label: string
  isActive: (editor: Editor) => boolean
  run: (editor: Editor) => void
}

const CONTROLS: Control[] = [
  {
    name: 'bold',
    label: 'Bold',
    isActive: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    name: 'italic',
    label: 'Italic',
    isActive: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    name: 'listBullet',
    label: 'Bulleted list',
    isActive: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    name: 'listOrdered',
    label: 'Numbered list',
    isActive: (e) => e.isActive('orderedList'),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
]

const TOOL_CLASSES =
  'inline-flex size-8 items-center justify-center rounded-md outline-none ' +
  'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out) ' +
  'hover:bg-fill-hover focus-visible:ring-ring/50 focus-visible:ring-3 ' +
  'disabled:pointer-events-none disabled:opacity-40'

export function FormatToolbar({ editor }: { editor: Editor | null }) {
  const [bold, italic] = CONTROLS
  const rest = CONTROLS.slice(2)

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Formatting">
      <ToolButton editor={editor} control={bold} />
      <ToolButton editor={editor} control={italic} />
      <LinkButton editor={editor} />
      {rest.map((control) => (
        <ToolButton key={control.name} editor={editor} control={control} />
      ))}
    </div>
  )
}

function ToolButton({ editor, control }: { editor: Editor | null; control: Control }) {
  const active = editor ? control.isActive(editor) : false
  return (
    <button
      type="button"
      aria-label={control.label}
      title={control.label}
      aria-pressed={active}
      disabled={!editor}
      // The editor must not lose the selection to the button.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => editor && control.run(editor)}
      className={cn(
        TOOL_CLASSES,
        active ? 'bg-fill-selected text-brand' : 'text-ink-3 hover:text-ink',
      )}
    >
      <Icon name={control.name} size={16} />
    </button>
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
            aria-label={active ? 'Remove link' : 'Link'}
            title={active ? 'Remove link' : 'Link'}
            aria-pressed={active}
            disabled={!editor}
            onMouseDown={(event) => event.preventDefault()}
            className={cn(
              TOOL_CLASSES,
              active ? 'bg-fill-selected text-brand' : 'text-ink-3 hover:text-ink',
            )}
          />
        }
      >
        <Icon name="link" size={16} />
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
          className="bg-sunken text-ink placeholder:text-ink-3 focus-visible:ring-ring/50 h-8 w-full rounded-sm px-2 text-base outline-none focus-visible:ring-3"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={apply}
            className="font-ui text-brand hover:text-brand-hover focus-visible:ring-ring/50 h-8 rounded-md px-2 text-base font-medium outline-none focus-visible:ring-3"
          >
            Add link
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
