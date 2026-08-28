// Typed Gmail REST client over the Platform.fetch seam.
//
// Every call goes through `request`, which layers three things in order:
//   1. token bucket   — stay inside the per-user quota budget
//   2. auth           — bearer token, one single-flight refresh on a 401
//   3. backoff        — exponential + jitter on 429/5xx, at most 5 tries
//
// Multi-item reads go through the batch endpoint in chunks of 50. Google
// allows 100 per batch but explicitly recommends staying at or under 50.

import type { Platform } from '../platform'
import { decodeBase64Url } from './mapping'
import {
  GMAIL_BUDGET_PER_MINUTE,
  HttpError,
  TokenBucket,
  retryWithBackoff,
  systemClock,
  type Clock,
} from './limiter'
import type {
  GmailAttachmentBody,
  GmailHistoryResponse,
  GmailLabel,
  GmailLabelsResponse,
  GmailListThreadsResponse,
  GmailMessage,
  GmailProfile,
  GmailThread,
  HistoryType,
  MessageFormat,
  ThreadFormat,
} from './types'

export const GMAIL_BASE_URL = 'https://gmail.googleapis.com'
export const BATCH_ENDPOINT = '/batch/gmail/v1'
export const MAX_BATCH_SIZE = 50

/**
 * Quota units per method, from Google's quota reference after the 2026-05-01
 * repricing. `threads.get` is charged at the published 40 units rather than the
 * lower figure that circulates in older notes: over-charging only slows the
 * backfill, under-charging earns 429s.
 */
export const QUOTA_COST = {
  getProfile: 1,
  labelsList: 1,
  historyList: 2,
  messagesList: 5,
  messagesModify: 5,
  threadsList: 10,
  threadsModify: 10,
  threadsUntrash: 10,
  messagesGet: 20,
  attachmentsGet: 20,
  threadsGet: 40,
  threadsTrash: 20,
  messagesSend: 100,
} as const

export interface AccessTokenSource {
  getAccessToken(): Promise<string>
  forceRefresh(): Promise<string>
}

export interface GmailApiOptions {
  platform: Platform
  accountId: string
  tokens: AccessTokenSource
  bucket?: TokenBucket
  clock?: Clock
  random?: () => number
  baseUrl?: string
  maxTries?: number
}

export interface ListThreadsParams {
  q?: string
  labelIds?: string[]
  pageToken?: string
  maxResults?: number
  includeSpamTrash?: boolean
}

export interface ModifyLabels {
  addLabelIds?: string[]
  removeLabelIds?: string[]
}

export interface ListHistoryParams {
  startHistoryId: string
  historyTypes?: HistoryType[]
  pageToken?: string
  maxResults?: number
}

// ---------------------------------------------------------------------------
// Batch multipart
// ---------------------------------------------------------------------------

export interface BatchPart {
  contentId: string
  status: number
  body: string
}

/** Splits headers from body at the first blank line, CRLF or bare LF. */
function splitOnBlankLine(text: string): [string, string] {
  const crlf = text.indexOf('\r\n\r\n')
  const lf = text.indexOf('\n\n')
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return [text.slice(0, crlf), text.slice(crlf + 4)]
  if (lf !== -1) return [text.slice(0, lf), text.slice(lf + 2)]
  return [text, '']
}

export function boundaryFromContentType(contentType: string | null): string | null {
  if (!contentType) return null
  const m = contentType.match(/boundary=("?)([^";]+)\1/i)
  return m ? m[2].trim() : null
}

/** Turns a multipart/mixed batch response into one entry per inner request. */
export function parseBatchResponse(body: string, boundary: string): BatchPart[] {
  const out: BatchPart[] = []
  for (const segment of body.split(`--${boundary}`)) {
    const trimmed = segment.replace(/^[\r\n]+/, '')
    if (!trimmed || trimmed.startsWith('--')) continue

    const [partHeaders, partBody] = splitOnBlankLine(trimmed)
    const idMatch = partHeaders.match(/Content-ID:\s*<?(?:response-)?([^>\r\n]+)>?/i)
    if (!idMatch) continue

    const [statusLine, innerBody] = splitOnBlankLine(partBody.replace(/^[\r\n]+/, ''))
    const statusMatch = statusLine.match(/HTTP\/[\d.]+\s+(\d{3})/)
    out.push({
      contentId: idMatch[1].trim(),
      status: statusMatch ? Number(statusMatch[1]) : 0,
      body: innerBody.trim(),
    })
  }
  return out
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class GmailApi {
  readonly accountId: string
  private readonly platform: Platform
  private readonly tokens: AccessTokenSource
  private readonly bucket: TokenBucket
  private readonly clock: Clock
  private readonly random: () => number
  private readonly baseUrl: string
  private readonly maxTries: number

  constructor(opts: GmailApiOptions) {
    this.platform = opts.platform
    this.accountId = opts.accountId
    this.tokens = opts.tokens
    this.clock = opts.clock ?? systemClock
    this.random = opts.random ?? Math.random
    this.baseUrl = opts.baseUrl ?? GMAIL_BASE_URL
    this.maxTries = opts.maxTries ?? 5
    this.bucket =
      opts.bucket ??
      new TokenBucket({
        capacity: GMAIL_BUDGET_PER_MINUTE,
        refillPerMinute: GMAIL_BUDGET_PER_MINUTE,
        clock: this.clock,
      })
  }

  private url(path: string, params?: Record<string, string | string[] | number | boolean | undefined>): string {
    const u = new URL(`${this.baseUrl}/gmail/v1/users/me${path}`)
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined) continue
      if (Array.isArray(value)) for (const v of value) u.searchParams.append(key, v)
      else u.searchParams.set(key, String(value))
    }
    return u.toString()
  }

  private async send(url: string, init: RequestInit | undefined, token: string): Promise<Response> {
    const headers: Record<string, string> = {
      ...((init?.headers as Record<string, string>) ?? {}),
      authorization: `Bearer ${token}`,
    }
    return this.platform.fetch(url, { ...init, headers })
  }

  /** One quota-metered, auth-repairing, retrying HTTP call. */
  private async request(cost: number, url: string, init?: RequestInit): Promise<Response> {
    return retryWithBackoff(
      async () => {
        await this.bucket.acquire(cost)
        let res = await this.send(url, init, await this.tokens.getAccessToken())
        if (res.status === 401) {
          // One repair attempt only. A second 401 means the grant is gone.
          res = await this.send(url, init, await this.tokens.forceRefresh())
        }
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new HttpError(res.status, res.statusText, body, url)
        }
        return res
      },
      { clock: this.clock, random: this.random, maxTries: this.maxTries },
    )
  }

  private async json<T>(cost: number, url: string, init?: RequestInit): Promise<T> {
    const res = await this.request(cost, url, init)
    return (await res.json()) as T
  }

  private postJson<T>(cost: number, url: string, body: unknown): Promise<T> {
    return this.json<T>(cost, url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  // -- reads ----------------------------------------------------------------

  profile(): Promise<GmailProfile> {
    return this.json<GmailProfile>(QUOTA_COST.getProfile, this.url('/profile'))
  }

  async listLabels(): Promise<GmailLabel[]> {
    const res = await this.json<GmailLabelsResponse>(QUOTA_COST.labelsList, this.url('/labels'))
    return res.labels ?? []
  }

  listThreads(params: ListThreadsParams = {}): Promise<GmailListThreadsResponse> {
    return this.json<GmailListThreadsResponse>(
      QUOTA_COST.threadsList,
      this.url('/threads', {
        q: params.q,
        labelIds: params.labelIds,
        pageToken: params.pageToken,
        maxResults: params.maxResults,
        includeSpamTrash: params.includeSpamTrash,
      }),
    )
  }

  getThread(id: string, format: ThreadFormat = 'metadata'): Promise<GmailThread> {
    return this.json<GmailThread>(QUOTA_COST.threadsGet, this.url(`/threads/${encodeURIComponent(id)}`, { format }))
  }

  getMessage(id: string, format: MessageFormat = 'full'): Promise<GmailMessage> {
    return this.json<GmailMessage>(QUOTA_COST.messagesGet, this.url(`/messages/${encodeURIComponent(id)}`, { format }))
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<Uint8Array> {
    const res = await this.json<GmailAttachmentBody>(
      QUOTA_COST.attachmentsGet,
      this.url(`/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`),
    )
    return res.data ? decodeBase64Url(res.data) : new Uint8Array()
  }

  listHistory(params: ListHistoryParams): Promise<GmailHistoryResponse> {
    return this.json<GmailHistoryResponse>(
      QUOTA_COST.historyList,
      this.url('/history', {
        startHistoryId: params.startHistoryId,
        historyTypes: params.historyTypes,
        pageToken: params.pageToken,
        maxResults: params.maxResults,
      }),
    )
  }

  // -- batch ----------------------------------------------------------------

  private async batchGet<T>(
    paths: string[],
    unitCost: number,
  ): Promise<(T | null)[]> {
    const results: (T | null)[] = new Array(paths.length).fill(null)

    for (const [chunkIndex, group] of chunk(paths, MAX_BATCH_SIZE).entries()) {
      const offset = chunkIndex * MAX_BATCH_SIZE
      const boundary = `batch_wren_${Date.now().toString(36)}_${chunkIndex}`
      const body =
        group
          .map(
            (path, i) =>
              `--${boundary}\r\n` +
              'Content-Type: application/http\r\n' +
              `Content-ID: <item-${i}>\r\n\r\n` +
              `GET ${path}\r\n\r\n`,
          )
          .join('') + `--${boundary}--\r\n`

      const res = await this.request(unitCost * group.length, `${this.baseUrl}${BATCH_ENDPOINT}`, {
        method: 'POST',
        headers: { 'content-type': `multipart/mixed; boundary=${boundary}` },
        body,
      })

      const responseBoundary = boundaryFromContentType(res.headers.get('content-type')) ?? boundary
      const text = await res.text()
      for (const part of parseBatchResponse(text, responseBoundary)) {
        const index = Number(part.contentId.replace(/^item-/, ''))
        if (!Number.isInteger(index) || index < 0 || index >= group.length) continue
        if (part.status === 429 || part.status >= 500) {
          // Throttling inside a batch: let the outer backoff replay the batch.
          throw new HttpError(part.status, 'batch inner error', part.body, `${this.baseUrl}${BATCH_ENDPOINT}`)
        }
        if (part.status !== 200) continue // 404 = deleted since listing; skip it
        try {
          results[offset + index] = JSON.parse(part.body) as T
        } catch {
          results[offset + index] = null
        }
      }
    }
    return results
  }

  /** Hydrates many messages at once. Order matches `ids`; misses are dropped. */
  async batchGetMessages(ids: string[], format: MessageFormat = 'metadata'): Promise<GmailMessage[]> {
    if (ids.length === 0) return []
    const paths = ids.map((id) => `/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=${format}`)
    const out = await this.batchGet<GmailMessage>(paths, QUOTA_COST.messagesGet)
    return out.filter((m): m is GmailMessage => m !== null)
  }

  /**
   * Backfill workhorse. One `threads.get?format=metadata` returns every message
   * in the thread with headers, so it costs a flat 40 units per thread where
   * the alternative (minimal thread fetch + a messages.get per message) costs
   * 40 + 20n. Bodies stay unfetched until the reading pane asks for them.
   */
  async batchGetThreads(ids: string[], format: ThreadFormat = 'metadata'): Promise<GmailThread[]> {
    if (ids.length === 0) return []
    const paths = ids.map((id) => `/gmail/v1/users/me/threads/${encodeURIComponent(id)}?format=${format}`)
    const out = await this.batchGet<GmailThread>(paths, QUOTA_COST.threadsGet)
    return out.filter((t): t is GmailThread => t !== null)
  }

  // -- writes ---------------------------------------------------------------

  modifyMessage(id: string, labels: ModifyLabels): Promise<GmailMessage> {
    return this.postJson<GmailMessage>(
      QUOTA_COST.messagesModify,
      this.url(`/messages/${encodeURIComponent(id)}/modify`),
      { addLabelIds: labels.addLabelIds ?? [], removeLabelIds: labels.removeLabelIds ?? [] },
    )
  }

  modifyThread(id: string, labels: ModifyLabels): Promise<GmailThread> {
    return this.postJson<GmailThread>(QUOTA_COST.threadsModify, this.url(`/threads/${encodeURIComponent(id)}/modify`), {
      addLabelIds: labels.addLabelIds ?? [],
      removeLabelIds: labels.removeLabelIds ?? [],
    })
  }

  trashThread(id: string): Promise<GmailThread> {
    return this.postJson<GmailThread>(QUOTA_COST.threadsTrash, this.url(`/threads/${encodeURIComponent(id)}/trash`), {})
  }

  untrashThread(id: string): Promise<GmailThread> {
    return this.postJson<GmailThread>(
      QUOTA_COST.threadsUntrash,
      this.url(`/threads/${encodeURIComponent(id)}/untrash`),
      {},
    )
  }

  sendMessage(raw: string, threadId?: string): Promise<GmailMessage> {
    return this.postJson<GmailMessage>(
      QUOTA_COST.messagesSend,
      this.url('/messages/send'),
      threadId ? { raw, threadId } : { raw },
    )
  }
}
