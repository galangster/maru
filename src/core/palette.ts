// Account dot colours. Fixed order so an account keeps its colour across
// sessions: the index is the account's position in the account list.

export const ACCOUNT_PALETTE = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#059669', // emerald
  '#e11d48', // rose
  '#f59e0b', // amber
  '#0891b2', // cyan
] as const

export function accountColor(index: number): string {
  return ACCOUNT_PALETTE[index % ACCOUNT_PALETTE.length]
}
