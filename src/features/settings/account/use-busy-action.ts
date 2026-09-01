import { useCallback, useState } from 'react'
import { toast } from 'sonner'

export function useBusyAction() {
  const [busy, setBusy] = useState<string | null>(null)
  const run = useCallback((key: string, action: () => Promise<void>) => {
    setBusy(key)
    void action()
      .catch((error: Error) => toast.error('Unable to complete that action', { description: error.message }))
      .finally(() => setBusy(null))
  }, [])
  return { busy, run }
}
