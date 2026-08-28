import { describe, it, expect } from 'vitest'
import {
  buildRawMessage,
  encodeHeaderValue,
  quotedPrintableEncode,
  htmlToText,
  base64UrlEncodeBytes,
} from '../src/core/mime'
import type { ComposeDraft } from '../src/core/types'

const NOW = Date.UTC(2025, 7, 20, 15, 4, 5)

function decodeRaw(raw: string): string {
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64 + '='.repeat((4 - (b64.length % 4)) % 4), 'base64').toString('utf8')
}

function boundaryOf(source: string, contentType: string): string {
  const re = new RegExp(`Content-Type: ${contentType};\\s*boundary="([^"]+)"`)
  const m = source.match(re)
  if (!m) throw new Error(`no ${contentType} boundary in:\n${source.slice(0, 600)}`)
  return m[1]
}

function draft(patch: Partial<ComposeDraft> = {}): ComposeDraft {
  return {
    accountId: 'acct-1',
    to: [{ name: 'Maya Ellison', email: 'maya@fernwood.dev' }],
    cc: [],
    bcc: [],
    subject: 'Tuesday walkthrough',
    bodyHtml: '<p>Hello <b>there</b></p><p>Line two</p>',
    attachments: [],
    ...patch,
  }
}

describe('base64url output', () => {
  it('returns a url-safe alphabet with no padding', () => {
    const raw = buildRawMessage(draft(), { fromEmail: 'nick@gmail.com', fromName: 'Nick', now: NOW })
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('round-trips through a standard base64 decoder', () => {
    const raw = buildRawMessage(draft(), { fromEmail: 'nick@gmail.com', now: NOW })
    expect(decodeRaw(raw)).toContain('Subject: Tuesday walkthrough')
  })

  it('encodes bytes url-safely', () => {
    // These three bytes are "++++" in standard base64 -> "----" url-safe.
    expect(base64UrlEncodeBytes(new Uint8Array([0xfb, 0xef, 0xbe]))).toBe('----')
  })
})

describe('headers', () => {
  it('writes the addressing and MIME headers', () => {
    const raw = decodeRaw(
      buildRawMessage(
        draft({ cc: [{ email: 'ops@fernwood.dev' }], bcc: [{ email: 'archive@fernwood.dev' }] }),
        { fromEmail: 'nick@gmail.com', fromName: 'Nick Galang', now: NOW },
      ),
    )
    expect(raw).toContain('From: Nick Galang <nick@gmail.com>')
    expect(raw).toContain('To: Maya Ellison <maya@fernwood.dev>')
    expect(raw).toContain('Cc: ops@fernwood.dev')
    expect(raw).toContain('Bcc: archive@fernwood.dev')
    expect(raw).toContain('MIME-Version: 1.0')
    expect(raw).toMatch(/\r\nDate: [A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} \+0000\r\n/)
  })

  it('leaves ASCII header text alone but RFC 2047 encodes non-ASCII', () => {
    expect(encodeHeaderValue('Tuesday walkthrough')).toBe('Tuesday walkthrough')
    expect(encodeHeaderValue('Café notes')).toBe('=?UTF-8?B?Q2Fmw6kgbm90ZXM=?=')
  })

  it('encodes a non-ASCII display name and leaves the address untouched', () => {
    const raw = decodeRaw(
      buildRawMessage(draft({ to: [{ name: 'Néill Ó Connor', email: 'neall@example.org' }], subject: 'Café notes' }), {
        fromEmail: 'nick@gmail.com',
        now: NOW,
      }),
    )
    expect(raw).toContain('To: =?UTF-8?B?TsOpaWxsIMOTIENvbm5vcg==?= <neall@example.org>')
    expect(raw).toContain('Subject: =?UTF-8?B?Q2Fmw6kgbm90ZXM=?=')
  })

  it('sets In-Reply-To and References for a reply', () => {
    const raw = decodeRaw(
      buildRawMessage(draft(), {
        fromEmail: 'nick@gmail.com',
        now: NOW,
        inReplyTo: '<CA+prev999@mail.fernwood.dev>',
        references: '<CA+root000@mail.fernwood.dev> <CA+prev999@mail.fernwood.dev>',
      }),
    )
    expect(raw).toContain('In-Reply-To: <CA+prev999@mail.fernwood.dev>')
    expect(raw).toContain('References: <CA+root000@mail.fernwood.dev> <CA+prev999@mail.fernwood.dev>')
  })

  it('omits reply headers on a fresh message', () => {
    const raw = decodeRaw(buildRawMessage(draft(), { fromEmail: 'nick@gmail.com', now: NOW }))
    expect(raw).not.toContain('In-Reply-To:')
    expect(raw).not.toContain('References:')
  })
})

describe('line endings', () => {
  it('uses CRLF everywhere and never a bare LF', () => {
    const raw = decodeRaw(
      buildRawMessage(draft({ attachments: [{ filename: 'a.txt', mimeType: 'text/plain', dataBase64: 'aGk=' }] }), {
        fromEmail: 'nick@gmail.com',
        now: NOW,
      }),
    )
    expect(raw).toContain('\r\n')
    expect(/(^|[^\r])\n/.test(raw)).toBe(false)
  })
})

describe('body structure', () => {
  it('builds multipart/alternative with a derived text/plain and the html', () => {
    const raw = decodeRaw(buildRawMessage(draft(), { fromEmail: 'nick@gmail.com', now: NOW }))
    const boundary = boundaryOf(raw, 'multipart/alternative')

    expect(raw).toContain(`--${boundary}\r\n`)
    expect(raw.trimEnd().endsWith(`--${boundary}--`)).toBe(true)
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"')
    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"')
    expect(raw).toContain('Content-Transfer-Encoding: quoted-printable')
    // text/plain must come before text/html (least rich first, per RFC 2046).
    expect(raw.indexOf('text/plain')).toBeLessThan(raw.indexOf('text/html'))
    expect(raw).toContain('Hello there')
  })

  it('nests the alternative inside multipart/mixed when attachments exist', () => {
    const raw = decodeRaw(
      buildRawMessage(
        draft({
          attachments: [
            { filename: 'invoice.pdf', mimeType: 'application/pdf', dataBase64: Buffer.alloc(300, 7).toString('base64') },
          ],
        }),
        { fromEmail: 'nick@gmail.com', now: NOW },
      ),
    )
    const mixed = boundaryOf(raw, 'multipart/mixed')
    const alt = boundaryOf(raw, 'multipart/alternative')
    expect(mixed).not.toBe(alt)

    expect(raw.indexOf(`--${mixed}`)).toBeLessThan(raw.indexOf(`--${alt}`))
    expect(raw).toContain('Content-Type: application/pdf; name="invoice.pdf"')
    expect(raw).toContain('Content-Disposition: attachment; filename="invoice.pdf"')
    expect(raw).toContain('Content-Transfer-Encoding: base64')
    expect(raw.trimEnd().endsWith(`--${mixed}--`)).toBe(true)
  })

  it('wraps attachment base64 at 76 columns', () => {
    const raw = decodeRaw(
      buildRawMessage(
        draft({
          attachments: [
            { filename: 'blob.bin', mimeType: 'application/octet-stream', dataBase64: Buffer.alloc(500, 3).toString('base64') },
          ],
        }),
        { fromEmail: 'nick@gmail.com', now: NOW },
      ),
    )
    const body = raw.split('Content-Disposition: attachment; filename="blob.bin"\r\n\r\n')[1]
    const lines = body.split('\r\n').filter((l) => /^[A-Za-z0-9+/=]+$/.test(l))
    expect(lines.length).toBeGreaterThan(5)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(76)
  })
})

describe('quotedPrintableEncode', () => {
  it('escapes = and non-ASCII bytes, and preserves plain ASCII', () => {
    expect(quotedPrintableEncode('café = 1')).toBe('caf=C3=A9 =3D 1')
  })

  it('soft-wraps lines longer than 76 characters', () => {
    const out = quotedPrintableEncode('x'.repeat(200))
    for (const line of out.split('\r\n')) expect(line.length).toBeLessThanOrEqual(76)
    expect(out).toContain('=\r\n')
  })

  it('escapes trailing whitespace so it survives transport', () => {
    expect(quotedPrintableEncode('trail \r\nnext')).toBe('trail=20\r\nnext')
  })
})

describe('htmlToText', () => {
  it('turns block elements into blank lines and strips tags', () => {
    expect(htmlToText('<p>Hello <b>there</b></p><p>Line two</p>')).toBe('Hello there\n\nLine two')
  })

  it('turns br into a single newline and decodes entities', () => {
    expect(htmlToText('a<br>b &amp; c &mdash; d&nbsp;e')).toBe('a\nb & c — d e')
  })

  it('drops script and style content', () => {
    expect(htmlToText('<style>p{color:red}</style><p>keep</p><script>alert(1)</script>')).toBe('keep')
  })
})
