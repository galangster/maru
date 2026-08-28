// Hand-built Gmail wire-format fixtures. Shapes follow
// users.messages.get / users.threads.get as documented at
// https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages

export function b64u(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64uBytes(bytes: number[]): string {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const H = (name: string, value: string) => ({ name, value })

/** multipart/alternative: text/plain + text/html, plain To/Cc lists. */
export const SIMPLE_ALTERNATIVE = {
  id: 'm-simple-1',
  threadId: 't-simple',
  labelIds: ['INBOX', 'UNREAD', 'IMPORTANT'],
  snippet: 'Thanks for the update &mdash; see you Tuesday',
  historyId: '900100',
  internalDate: '1755000000000',
  payload: {
    partId: '',
    mimeType: 'multipart/alternative',
    filename: '',
    headers: [
      H('Date', 'Tue, 12 Aug 2025 09:20:00 -0700'),
      H('From', 'Maya Ellison <maya@fernwood.dev>'),
      H('To', 'Nick Galang <nick@gmail.com>, "Ellison, Dana" <dana@fernwood.dev>'),
      H('Cc', 'ops@fernwood.dev'),
      H('Reply-To', 'Maya Ellison <maya+reply@fernwood.dev>'),
      H('Subject', 'Re: Tuesday walkthrough'),
      H('Message-ID', '<CA+abc123@mail.fernwood.dev>'),
      H('In-Reply-To', '<CA+prev999@mail.fernwood.dev>'),
      H('References', '<CA+root000@mail.fernwood.dev> <CA+prev999@mail.fernwood.dev>'),
    ],
    body: { size: 0 },
    parts: [
      {
        partId: '0',
        mimeType: 'text/plain',
        filename: '',
        headers: [H('Content-Type', 'text/plain; charset="UTF-8"')],
        body: { size: 44, data: b64u('Thanks for the update - see you Tuesday.\n') },
      },
      {
        partId: '1',
        mimeType: 'text/html',
        filename: '',
        headers: [H('Content-Type', 'text/html; charset="UTF-8"')],
        body: { size: 70, data: b64u('<div dir="ltr">Thanks for the update &mdash; see you Tuesday.</div>') },
      },
    ],
  },
  sizeEstimate: 4210,
}

/**
 * multipart/mixed > [ multipart/related > [ multipart/alternative, inline png ],
 * application/pdf attachment ]. Exercises deep nesting, inline contentId, and
 * attachment metadata carried on body.attachmentId.
 */
export const NESTED_WITH_ATTACHMENTS = {
  id: 'm-nested-1',
  threadId: 't-nested',
  labelIds: ['INBOX', 'STARRED'],
  snippet: 'Your order is on its way',
  historyId: '900200',
  internalDate: '1755100000000',
  payload: {
    partId: '',
    mimeType: 'multipart/mixed',
    filename: '',
    headers: [
      H('From', '"Harlow Supply" <orders@harlowsupply.example>'),
      H('To', 'nick@gmail.com'),
      H('Subject', 'Order HS-40812 shipped'),
      H('Message-ID', '<order-40812@harlowsupply.example>'),
      H('Date', 'Wed, 13 Aug 2025 12:00:00 +0000'),
    ],
    body: { size: 0 },
    parts: [
      {
        partId: '0',
        mimeType: 'multipart/related',
        filename: '',
        headers: [H('Content-Type', 'multipart/related; boundary="rel"')],
        body: { size: 0 },
        parts: [
          {
            partId: '0.0',
            mimeType: 'multipart/alternative',
            filename: '',
            headers: [H('Content-Type', 'multipart/alternative; boundary="alt"')],
            body: { size: 0 },
            parts: [
              {
                partId: '0.0.0',
                mimeType: 'text/plain',
                filename: '',
                headers: [H('Content-Type', 'text/plain; charset="UTF-8"')],
                body: { size: 25, data: b64u('Your order is on its way.') },
              },
              {
                partId: '0.0.1',
                mimeType: 'text/html',
                filename: '',
                headers: [H('Content-Type', 'text/html; charset="UTF-8"')],
                body: {
                  size: 60,
                  data: b64u('<p>Your order is on its way. <img src="cid:logo-1"></p>'),
                },
              },
            ],
          },
          {
            partId: '0.1',
            mimeType: 'image/png',
            filename: 'logo.png',
            headers: [
              H('Content-Type', 'image/png; name="logo.png"'),
              H('Content-Disposition', 'inline; filename="logo.png"'),
              H('Content-ID', '<logo-1>'),
            ],
            body: { size: 1180, attachmentId: 'att-logo-1' },
          },
        ],
      },
      {
        partId: '1',
        mimeType: 'application/pdf',
        filename: 'invoice-40812.pdf',
        headers: [
          H('Content-Type', 'application/pdf; name="invoice-40812.pdf"'),
          H('Content-Disposition', 'attachment; filename="invoice-40812.pdf"'),
        ],
        body: { size: 88231, attachmentId: 'att-invoice-1' },
      },
    ],
  },
  sizeEstimate: 91000,
}

/** text/plain only, no html part, RFC 2047 encoded display name and subject. */
export const PLAIN_ONLY_ENCODED = {
  id: 'm-plain-1',
  threadId: 't-plain',
  labelIds: ['INBOX'],
  snippet: 'Sending the notes over',
  historyId: '900300',
  internalDate: '1755200000000',
  payload: {
    partId: '',
    mimeType: 'text/plain',
    filename: '',
    headers: [
      H('From', '=?UTF-8?B?TsOpaWxsIMOTIENvbm5vcg==?= <neall@example.org>'),
      H('To', 'nick@gmail.com'),
      H('Subject', '=?UTF-8?Q?Caf=C3=A9_notes?='),
      H('Message-ID', '<plain-1@example.org>'),
      H('Date', 'Thu, 14 Aug 2025 08:00:00 +0000'),
    ],
    body: { size: 30, data: b64u('Sending the notes over.\nBest,\nN') },
  },
  sizeEstimate: 900,
}

/** threads.get?format=metadata shape: three messages, newest last. */
export const THREAD_THREE_MESSAGES = {
  id: 't-simple',
  historyId: '900400',
  messages: [
    {
      id: 'm-1',
      threadId: 't-simple',
      labelIds: ['INBOX'],
      snippet: 'Can we move the walkthrough?',
      internalDate: '1754900000000',
      payload: {
        partId: '',
        mimeType: 'text/plain',
        filename: '',
        headers: [
          H('From', 'Nick Galang <nick@gmail.com>'),
          H('To', 'Maya Ellison <maya@fernwood.dev>'),
          H('Subject', 'Tuesday walkthrough'),
          H('Message-ID', '<root-1@mail.gmail.com>'),
        ],
        body: { size: 0 },
      },
    },
    {
      id: 'm-2',
      threadId: 't-simple',
      labelIds: ['INBOX', 'UNREAD'],
      snippet: 'Tuesday works',
      internalDate: '1754950000000',
      payload: {
        partId: '',
        mimeType: 'text/plain',
        filename: '',
        headers: [
          H('From', 'Maya Ellison <maya@fernwood.dev>'),
          H('To', 'Nick Galang <nick@gmail.com>'),
          H('Subject', 'Re: Tuesday walkthrough'),
          H('Message-ID', '<CA+prev999@mail.fernwood.dev>'),
        ],
        body: { size: 0 },
      },
    },
    SIMPLE_ALTERNATIVE,
  ],
}
