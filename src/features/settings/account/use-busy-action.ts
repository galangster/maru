import { useCallback, useState } from 'react'
import { toast } from 'sonner'

type ErrorSink = (error: Error) => void

const toastError: ErrorSink = (error) => {
  toast.error('Unable to complete that action', { description: error.message })
}

export function useBusyAction(onError: ErrorSink = toastError) {
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set())
  const isBusy = useCallback((key: string) => busyKeys.has(key), [busyKeys])
  const run = useCallback(async (key: string, action: () => Promise<void>): Promise<boolean> => {
    setBusyKeys((current) => new Set(current).add(key))
    try {
      await action()
      return true
    } catch (cause) {
      onError(cause instanceof Error ? cause : new Error('Unable to complete that action'))
      return false
    } finally {
      setBusyKeys((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }, [onError])
  return { isBusy, run }
}
