import { toast } from 'sonner'
// Saving bytes the person asked for — P10's answer to the "coming soon"
// attachment toast. Two doors, one contract: in Tauri a native save dialog
// then our own save_file command (one write behind one gesture — no
// filesystem grant to the webview); in the browser demo, a plain download.
// Returns false when the person cancelled, throws when saving failed.

import { base64EncodeBytes } from '@/core/mime'
import { isTauri } from '@/lib/env'

export async function saveBytes(filename: string, bytes: Uint8Array): Promise<boolean> {
  if (isTauri()) {
    // The dialog lives on the Rust side (P10 review): the webview never
    // names a path, so a compromised page cannot aim a write anywhere.
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<boolean>('save_file', {
      filename,
      dataBase64: base64EncodeBytes(bytes),
    })
  }
  const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer]))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
  return true
}

/**
 * The one save flow both attachment surfaces speak: write the bytes, report
 * the outcome in the same words. Shared by AttachmentChip and PhotoThumb so
 * the user-facing strings cannot drift.
 */
export async function saveWithToasts(filename: string, bytes: Uint8Array): Promise<void> {
  try {
    if (await saveBytes(filename, bytes)) toast(`Saved ${filename}`)
  } catch (cause) {
    toast.error(`Could not save ${filename}`, {
      description: cause instanceof Error ? cause.message : String(cause),
    })
  }
}
