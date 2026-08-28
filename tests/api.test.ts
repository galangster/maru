import { describe, it, expect } from 'vitest'
import { GmailApi, QUOTA_COST, parseBatchResponse } from '../src/core/gmail/api'
import { TokenBucket, HttpError, type Clock } from '../src/core/gmail/limiter'
import { NodePlatform, jsonResponse, errorResponse, type RecordedRequest } from './helpers/node-platform'

class FakeClock implements Clock {
  t = 0
  now() {
    return this.t
  }
  async sleep(ms: number) {
    this.t += ms
    await Promise.resolve()
  }
}

class FakeTokens {
  refreshes = 0
  constructor(private token = 'at-1') {}
  async getAccessToken() {
    return this.token
  }
  async forceRefresh() {
    this.refreshes++
    this.token = `at-${this.refreshes + 1}`
    return this.token
  }
}

function api(p: NodePlatform, tokens = new FakeTokens(), clock = new FakeClock()) {
  return new GmailApi({
    platform: p,
    accountId: 'acct-1',
    tokens,
    clock,
    random: () => 1,
    bucket: new TokenBucket({ capacity: 4500, refillPerMinute: 4500, clock }),
  })
}

function batchBody(parts: { contentId: string; status: number; json: unknown }[], boundary = 'batch_wren_1'): Response {
  const body =
    parts
      .map(
        (p) =>
          `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <response-${p.contentId}>\r\n\r\n` +
          `HTTP/1.1 ${p.status} OK\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
          `${JSON.stringify(p.json)}\r\n\r\n`,
      )
      .join('') + `--${boundary}--\r\n`
  return new Response(body, { status: 200, headers: { 'content-type': `multipart/mixed; boundary=${boundary}` } })
}

describe('request building', () => {
  it('sends the bearer token and json accept header', async () => {
    const p = new NodePlatform()
    p.handler = () => jsonResponse({ emailAddress: 'nick@gmail.com', historyId: '1' })
    await api(p).profile()
    expect(p.requests[0].url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/profile')
    expect(p.requests[0].headers['authorization']).toBe('Bearer at-1')
  })

  it('encodes listThreads query, labels and page token', async () => {
    const p = new NodePlatform()
    p.handler = () => jsonResponse({ threads: [{ id: 't1' }], nextPageToken: 'pg2' })
    const res = await api(p).listThreads({ q: 'newer_than:90d', labelIds: ['TRASH'], pageToken: 'pg1', maxResults: 100 })
    const u = new URL(p.requests[0].url)
    expect(u.pathname).toBe('/gmail/v1/users/me/threads')
    expect(u.searchParams.get('q')).toBe('newer_than:90d')
    expect(u.searchParams.getAll('labelIds')).toEqual(['TRASH'])
    expect(u.searchParams.get('pageToken')).toBe('pg1')
    expect(u.searchParams.get('maxResults')).toBe('100')
    expect(res.nextPageToken).toBe('pg2')
  })

  it('passes the requested thread format', async () => {
    const p = new NodePlatform()
    p.handler = () => jsonResponse({ id: 't1', messages: [] })
    await api(p).getThread('t1', 'metadata')
    expect(new URL(p.requests[0].url).searchParams.get('format')).toBe('metadata')
  })

  it('posts label changes for a thread', async () => {
    const p = new NodePlatform()
    p.handler = () => jsonResponse({ id: 't1' })
    await api(p).modifyThread('t1', { addLabelIds: ['STARRED'], removeLabelIds: ['UNREAD'] })
    expect(p.requests[0].method).toBe('POST')
    expect(p.requests[0].url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/threads/t1/modify')
    expect(JSON.parse(p.requests[0].body!)).toEqual({ addLabelIds: ['STARRED'], removeLabelIds: ['UNREAD'] })
  })

  it('sends raw plus threadId so a reply lands in its thread', async () => {
    const p = new NodePlatform()
    p.handler = () => jsonResponse({ id: 'm-new', threadId: 't1', labelIds: ['SENT'] })
    await api(p).sendMessage('cmF3', 't1')
    expect(JSON.parse(p.requests[0].body!)).toEqual({ raw: 'cmF3', threadId: 't1' })
  })

  it('decodes an attachment body from base64url', async () => {
    const p = new NodePlatform()
    p.handler = () => jsonResponse({ size: 3, data: 'AQID' })
    const bytes = await api(p).getAttachment('m1', 'att1')
    expect(Array.from(bytes)).toEqual([1, 2, 3])
  })
})

describe('batch endpoint', () => {
  it('splits more than 50 ids into separate batch posts', async () => {
    const p = new NodePlatform()
    const ids = Array.from({ length: 120 }, (_, i) => `m${i}`)
    let batchIndex = 0
    p.handler = (req: RecordedRequest) => {
      const inner = req.body!.match(/Content-ID: <(item-[^>]+)>/g)!.map((s) => s.slice(13, -1))
      batchIndex++
      return batchBody(
        inner.map((contentId, i) => ({
          contentId,
          status: 200,
          json: { id: `${contentId}-b${batchIndex}-${i}`, threadId: 't1' },
        })),
      )
    }

    const out = await api(p).batchGetMessages(ids, 'metadata')
    expect(p.requests).toHaveLength(3)
    expect(p.requests[0].url).toBe('https://gmail.googleapis.com/batch/gmail/v1')
    expect(p.requests[0].headers['content-type']).toMatch(/^multipart\/mixed; boundary=/)
    expect(out).toHaveLength(120)
  })

  it('returns results in the order the ids were requested', async () => {
    const p = new NodePlatform()
    p.handler = (req) => {
      const inner = req.body!.match(/Content-ID: <(item-[^>]+)>/g)!.map((s) => s.slice(13, -1))
      // Answer out of order on purpose; Content-ID is what maps them back.
      return batchBody(
        inner
          .slice()
          .reverse()
          .map((contentId) => ({ contentId, status: 200, json: { id: contentId, threadId: 't1' } })),
      )
    }
    const out = await api(p).batchGetMessages(['a', 'b', 'c'], 'full')
    expect(out.map((m) => m.id)).toEqual(['item-0', 'item-1', 'item-2'])
  })

  it('drops an inner 404 rather than failing the whole batch', async () => {
    const p = new NodePlatform()
    p.handler = () =>
      batchBody([
        { contentId: 'item-0', status: 200, json: { id: 'a', threadId: 't1' } },
        { contentId: 'item-1', status: 404, json: { error: { code: 404, message: 'Not Found' } } },
      ])
    const out = await api(p).batchGetMessages(['a', 'b'], 'metadata')
    expect(out.map((m) => m.id)).toEqual(['a'])
  })

  it('spends one message.get of quota per inner request', async () => {
    const p = new NodePlatform()
    const clock = new FakeClock()
    const bucket = new TokenBucket({ capacity: 4500, refillPerMinute: 4500, clock })
    p.handler = (req) => {
      const inner = req.body!.match(/Content-ID: <(item-[^>]+)>/g)!.map((s) => s.slice(13, -1))
      return batchBody(inner.map((contentId) => ({ contentId, status: 200, json: { id: contentId, threadId: 't' } })))
    }
    const client = new GmailApi({ platform: p, accountId: 'a', tokens: new FakeTokens(), clock, bucket })
    await client.batchGetMessages(Array.from({ length: 50 }, (_, i) => `m${i}`), 'metadata')
    expect(bucket.available).toBe(4500 - 50 * QUOTA_COST.messagesGet)
  })

  it('parses a batch response whose parts use bare LF separators', () => {
    const body =
      '--b1\nContent-Type: application/http\nContent-ID: <response-item-0>\n\n' +
      'HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"id":"x"}\n\n--b1--\n'
    const parts = parseBatchResponse(body, 'b1')
    expect(parts).toEqual([{ contentId: 'item-0', status: 200, body: '{"id":"x"}' }])
  })
})

describe('auth and throttling', () => {
  it('refreshes once on a 401 and replays the request with the new token', async () => {
    const p = new NodePlatform()
    const tokens = new FakeTokens()
    let calls = 0
    p.handler = () => {
      calls++
      return calls === 1 ? errorResponse(401, 'expired') : jsonResponse({ emailAddress: 'nick@gmail.com', historyId: '1' })
    }
    const result = await api(p, tokens).profile()
    expect(result.emailAddress).toBe('nick@gmail.com')
    expect(tokens.refreshes).toBe(1)
    expect(p.requests[0].headers['authorization']).toBe('Bearer at-1')
    expect(p.requests[1].headers['authorization']).toBe('Bearer at-2')
  })

  it('gives up on a second consecutive 401 instead of looping', async () => {
    const p = new NodePlatform()
    const tokens = new FakeTokens()
    p.handler = () => errorResponse(401, 'revoked')
    await expect(api(p, tokens).profile()).rejects.toMatchObject({ status: 401 })
    expect(tokens.refreshes).toBe(1)
    expect(p.requests).toHaveLength(2)
  })

  it('retries a 429 with backoff and succeeds', async () => {
    const p = new NodePlatform()
    const clock = new FakeClock()
    let calls = 0
    p.handler = () => {
      calls++
      return calls < 3 ? errorResponse(429, 'rateLimitExceeded') : jsonResponse({ labels: [{ id: 'INBOX', name: 'INBOX' }] })
    }
    const labels = await api(p, new FakeTokens(), clock).listLabels()
    expect(labels).toHaveLength(1)
    expect(calls).toBe(3)
    expect(clock.now()).toBeGreaterThan(0)
  })

  it('surfaces a 404 from history.list as a typed HttpError', async () => {
    const p = new NodePlatform()
    p.handler = () => errorResponse(404, 'historyId expired')
    const err = await api(p)
      .listHistory({ startHistoryId: '1' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).status).toBe(404)
  })
})
