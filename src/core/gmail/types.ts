// Gmail REST wire shapes. Only the fields Maru reads are declared; the API
// returns more. Everything is optional because `format` changes what is sent
// (minimal: ids+labels, metadata: +headers, full: +body data).

export interface GmailHeader {
  name: string
  value: string
}

export interface GmailBody {
  size?: number
  data?: string // base64url
  attachmentId?: string
}

export interface GmailPart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: GmailBody
  parts?: GmailPart[]
}

export interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  historyId?: string
  internalDate?: string
  payload?: GmailPart
  sizeEstimate?: number
}

export interface GmailThread {
  id: string
  historyId?: string
  snippet?: string
  messages?: GmailMessage[]
}

export interface GmailThreadRef {
  id: string
  snippet?: string
  historyId?: string
}

export interface GmailListThreadsResponse {
  threads?: GmailThreadRef[]
  nextPageToken?: string
  resultSizeEstimate?: number
}

export interface GmailLabel {
  id: string
  name: string
  type?: 'system' | 'user'
  messagesUnread?: number
  threadsUnread?: number
}

export interface GmailLabelsResponse {
  labels?: GmailLabel[]
}

export interface GmailProfile {
  emailAddress: string
  messagesTotal?: number
  threadsTotal?: number
  historyId: string
}

export interface GmailHistoryMessageRef {
  message: GmailMessage
  labelIds?: string[]
}

export interface GmailHistoryRecord {
  id: string
  messages?: GmailMessage[]
  messagesAdded?: GmailHistoryMessageRef[]
  messagesDeleted?: GmailHistoryMessageRef[]
  labelsAdded?: GmailHistoryMessageRef[]
  labelsRemoved?: GmailHistoryMessageRef[]
}

export interface GmailHistoryResponse {
  history?: GmailHistoryRecord[]
  nextPageToken?: string
  historyId?: string
}

export interface GmailAttachmentBody {
  size?: number
  data?: string // base64url
}

export type MessageFormat = 'minimal' | 'metadata' | 'full' | 'raw'
export type ThreadFormat = 'minimal' | 'metadata' | 'full'

export const HISTORY_TYPES = ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'] as const
export type HistoryType = (typeof HISTORY_TYPES)[number]
