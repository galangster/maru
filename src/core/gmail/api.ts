// Typed Gmail REST client over the Platform.fetch seam.
//
// Every call goes through `request`, which layers three things in order:
//   1. token bucket   — stay inside the per-user quota budget
//   2. auth           — bearer token, one single-flight refresh on a 401
//   3. backoff        — exponential + jitter on 429/5xx, at most 5 tries
//
// Multi-item reads go through the batch endpoint in small chunks. Google
// allows 100 per batch, but inner requests execute near-simultaneously and
// the burst is what trips the per-user rate limiter: a 50-thread chunk of
// threads.get costs 2,000 units in one instant (40 each, 2026-05 table) and
// drew persistent inner 429s against a live mailbox. Ten per chunk keeps
// bursts at 400 units.

import type { Platform } from '../platform'
import { decodeBase64Url } from './mapping'
import {
  GMAIL_BUDGET_PER_MINUTE,
  HttpError,
  TokenBucket,
  backoffDelay,
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
  GmailSendAs,
  GmailSendAsResponse,
  GmailThread,
  GmailWatchResponse,
  HistoryType,
  MessageFormat,
  ThreadFormat,
} from './types'

export const GMAIL_BASE_URL = 'https://gmail.googleapis.com'
export const BATCH_ENDPOINT = '/batch/gmail/v1'
export const MAX_BATCH_SIZE = 10
/** Rounds of retry for inner-throttled batch parts before giving up. */
export const BATCH_RETRY_ROUNDS = 4

/**
 * Quota units per method, from Google's quota reference after the 2026-05-01
 * repricing. `threads.get` is charged at the published 40 units rather than the
 * lower figure that circulates in older notes: over-charging only slows the
 * backfill, under-charging earns 429s.
 */
export const QUOTA_COST = {
  getProfile: 1,
  labelsList: 1,
  sendAsList: 1,
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
  watch: 100,
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

  /**
   * The account's "send mail as" identities, primary first in practice.
   *
   * Read for one reason: the display name Gmail already puts on this
   * mailbox's outgoing mail, so a newly added account arrives named instead of
   * signing everything with its address. `gmail.modify` covers this method —
   * see `docs/security/google-oauth-method-scope-matrix.md`.
   */
  async listSendAs(): Promise<GmailSendAs[]> {
    const res = await this.json<GmailSendAsResponse>(
      QUOTA_COST.sendAsList,
      this.url('/settings/sendAs'),
    )
    return res.sendAs ?? []
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

    // Work list of [original index, path]. Inner 429/5xx parts are retried
    // alone in later rounds — replaying a whole chunk for one throttled part
    // re-trips Gmail's per-user rate limiter and starved the live backfill.
    let pending: Array<[number, string]> = paths.map((path, i) => [i, path])

    for (let round = 0; pending.length > 0; round++) {
      if (round > BATCH_RETRY_ROUNDS) {
        throw new HttpError(
          429,
          `batch still throttled after ${BATCH_RETRY_ROUNDS} retry rounds (${pending.length} items left)`,
          '',
          `${this.baseUrl}${BATCH_ENDPOINT}`,
        )
      }
      if (round > 0) {
        // The client's one backoff formula — limiter.ts. A round starts at
        // 1 s rather than the per-request 500 ms: a throttled batch part has
        // already waited out the whole request that carried it.
        await this.clock.sleep(
          backoffDelay(round, { baseDelayMs: 1_000, random: this.random }),
        )
      }

      const failed: Array<[number, string]> = []
      for (const group of chunk(pending, MAX_BATCH_SIZE)) {
        const boundary = `batch_wren_${this.clock.now().toString(36)}_${round}`
        const body =
          group
            .map(
              ([, path], i) =>
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
          const local = Number(part.contentId.replace(/^item-/, ''))
          if (!Number.isInteger(local) || local < 0 || local >= group.length) continue
          const entry = group[local]
          if (part.status === 429 || part.status >= 500) {
            failed.push(entry)
            continue
          }
          if (part.status !== 200) continue // 404 = deleted since listing; skip it
          try {
            results[entry[0]] = JSON.parse(part.body) as T
          } catch {
            results[entry[0]] = null
          }
        }
      }
      pending = failed
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

  /**
   * Ask Gmail to publish this mailbox's changes to a Pub/Sub topic.
   *
   * Called by the client with the client's own token, which is the whole point
   * of the design: the relay holds no Gmail credential and a server-side
   * `users.watch` is ruled out permanently (MARU-ACCOUNT.md §1).
   *
   * INBOX only. Without the filter Gmail publishes for every label change in
   * the mailbox — sent mail, drafts, a sweep of an old thread — and each one
   * would spend a push, a wake and a history fetch to conclude that nothing
   * had arrived.
   *
   * Idempotent: calling it again on a live watch extends it rather than
   * creating a second one.
   */
  watch(topicName: string, labelIds: string[] = ['INBOX']): Promise<GmailWatchResponse> {
    return this.postJson<GmailWatchResponse>(QUOTA_COST.watch, this.url('/watch'), {
      topicName,
      labelIds,
      labelFilterBehavior: 'include',
    })
  }
}
