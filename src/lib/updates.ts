// Auto-update — P3. The local-first version of it: the app asks a static,
// signature-verified manifest on GitHub Releases (no Wren server, nothing
// identifying sent), and never installs without the person saying so.
//
// Two callers, one function: App checks silently on launch (only a found
// update makes a sound); Settings → About checks loudly ("you're current"
// is an answer there). Both run only inside Tauri — the browser demo has
// nothing to update.

import { toast } from 'sonner'

import { isTauri } from '@/lib/env'

export async function checkForUpdates(opts: { announceNoUpdate: boolean }): Promise<void> {
  if (!isTauri()) {
    if (opts.announceNoUpdate) toast('Updates apply to the installed app, not the browser demo.')
    return
  }
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (!update) {
      if (opts.announceNoUpdate) toast('Wren is up to date')
      return
    }
    toast(`Wren ${update.version} is available`, {
      // Sticky: an update offer is worth outliving the 4-second default,
      // and it must never install itself — the action is the consent.
      duration: 30_000,
      action: {
        label: 'Restart & update',
        onClick: () => {
          void (async () => {
            try {
              await update.downloadAndInstall()
              const { relaunch } = await import('@tauri-apps/plugin-process')
              await relaunch()
            } catch (cause) {
              toast.error('The update could not be installed', {
                description: cause instanceof Error ? cause.message : String(cause),
              })
            }
          })()
        },
      },
    })
  } catch (cause) {
    // A failed check is a shrug on launch and an answer when asked.
    if (opts.announceNoUpdate) {
      toast.error('Could not check for updates', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }
}
