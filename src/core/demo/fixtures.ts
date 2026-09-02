// Demo-mode fixtures. Every name, domain and address here is invented.
//
// The data is generated relative to a `now` so the app always looks live: the
// spec below is written in "days ago" and expanded at build time. Bodies are
// inline-styled HTML only. Exactly two threads reference remote https images,
// so the image-blocking UI has something real to block.

import type { Account, Attachment, EmailAddress, Label, Message, Thread } from '../types'
import { mapGmailThread } from '../gmail/mapping'
import { htmlToText } from '../mime'
import { ACCOUNT_PALETTE } from '../palette'

export const DEMO_ACCOUNT_SEEDS = [
  { id: 'demo-personal', email: 'nick@gmail.com', displayName: 'Personal', color: ACCOUNT_PALETTE[0] },
  { id: 'demo-work', email: 'nick.galang@gmail.com', displayName: 'Work', color: ACCOUNT_PALETTE[1] },
]

export const DEMO_EXTRA_ACCOUNT = {
  id: 'demo-side',
  email: 'nick@fernwood.dev',
  displayName: 'Fernwood',
  color: ACCOUNT_PALETTE[2],
}

const ME_PERSONAL: EmailAddress = { name: 'Nick Galang', email: 'nick@gmail.com' }
const ME_WORK: EmailAddress = { name: 'Nick Galang', email: 'nick.galang@gmail.com' }

const A = (name: string, email: string): EmailAddress => ({ name, email })

const MAYA = A('Maya Ellison', 'maya@fernwood.dev')
const DEV = A('Dev Raman', 'dev.raman@fernwood.dev')
const PRIYA = A('Priya Nandakumar', 'priya@lanternhouse.co')
const TOM = A('Tom Okafor', 'tom.okafor@northshoreapp.io')
const SAM = A('Sam Beltrán', 'sam@beltranstudio.example')
const MUM = A('Lin Galang', 'lin.galang@example.com')
const JULES = A('Jules Whitfield', 'jules@porterandmoss.example')
const ROSA = A('Rosa Iremonger', 'rosa@quillfield.example')
const HANI = A('Hani Aziz', 'hani.aziz@northshoreapp.io')

// --- body helpers ----------------------------------------------------------

const SANS = 'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif'

function plain(...paragraphs: string[]): string {
  return paragraphs.map((p) => `<p style="margin:0 0 14px;${SANS};font-size:15px;line-height:1.55;color:#1f2937">${p}</p>`).join('')
}

function newsletter(opts: {
  masthead: string
  accent: string
  kicker: string
  headline: string
  standfirst: string
  items: { title: string; blurb: string }[]
  footer: string
  heroImage?: string
}): string {
  const items = opts.items
    .map(
      (i) => `
      <tr><td style="padding:0 0 18px">
        <div style="${SANS};font-size:16px;font-weight:600;color:#111827;margin:0 0 4px">${i.title}</div>
        <div style="${SANS};font-size:14px;line-height:1.6;color:#4b5563">${i.blurb}</div>
      </td></tr>`,
    )
    .join('')
  const hero = opts.heroImage
    ? `<tr><td style="padding:0 0 20px"><img src="${opts.heroImage}" width="560" alt="" style="display:block;width:100%;max-width:560px;border-radius:8px"></td></tr>`
    : ''
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:28px 0">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
      <tr><td style="padding:0 0 18px;border-bottom:2px solid ${opts.accent}">
        <div style="${SANS};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${opts.accent};font-weight:700">${opts.masthead}</div>
      </td></tr>
      <tr><td style="padding:20px 0 6px">
        <div style="${SANS};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280">${opts.kicker}</div>
        <h1 style="${SANS};font-size:24px;line-height:1.25;margin:6px 0 10px;color:#0f172a">${opts.headline}</h1>
        <p style="${SANS};font-size:15px;line-height:1.6;color:#374151;margin:0">${opts.standfirst}</p>
      </td></tr>
      ${hero}
      <tr><td style="padding:18px 0 0"><table role="presentation" width="100%">${items}</table></td></tr>
      <tr><td style="padding:16px 0 0;border-top:1px solid #e5e7eb">
        <div style="${SANS};font-size:12px;line-height:1.6;color:#9ca3af">${opts.footer}</div>
      </td></tr>
    </table>
  </td></tr>
</table>`
}

function receipt(opts: { brand: string; accent: string; title: string; rows: [string, string][]; note: string }): string {
  const rows = opts.rows
    .map(
      ([k, v]) => `
      <tr>
        <td style="${SANS};font-size:14px;color:#6b7280;padding:8px 0;border-bottom:1px solid #f1f5f9">${k}</td>
        <td style="${SANS};font-size:14px;color:#111827;text-align:right;padding:8px 0;border-bottom:1px solid #f1f5f9">${v}</td>
      </tr>`,
    )
    .join('')
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:24px 0">
  <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;padding:24px">
      <tr><td style="${SANS};font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${opts.accent};padding:0 0 12px">${opts.brand}</td></tr>
      <tr><td style="${SANS};font-size:20px;font-weight:600;color:#0f172a;padding:0 0 16px">${opts.title}</td></tr>
      <tr><td><table role="presentation" width="100%">${rows}</table></td></tr>
      <tr><td style="${SANS};font-size:13px;line-height:1.6;color:#6b7280;padding:16px 0 0">${opts.note}</td></tr>
    </table>
  </td></tr>
</table>`
}

// --- spec ------------------------------------------------------------------

interface MessageSpec {
  from: EmailAddress
  to?: EmailAddress[]
  cc?: EmailAddress[]
  daysAgo: number
  hour?: number
  html: string
  attachments?: { filename: string; mimeType: string; sizeBytes: number; inline?: boolean; contentId?: string }[]
  labels?: string[]
}

interface ThreadSpec {
  account: 0 | 1
  id: string
  subject: string
  labels: string[]
  messages: MessageSpec[]
}

const SIGN_OFF = 'Nick'

function reply(from: EmailAddress, to: EmailAddress[], daysAgo: number, hour: number, ...paras: string[]): MessageSpec {
  return { from, to, daysAgo, hour, html: plain(...paras) }
}

/**
 * ~45 threads across two accounts, spread over the last 90 days. The mix is
 * deliberate: multi-message personal threads, transactional mail, newsletters
 * with real HTML, sent items, and trash.
 */
export const THREAD_SPECS: ThreadSpec[] = [
  // --- personal account: conversations -------------------------------------
  {
    account: 0,
    id: 'p-walkthrough',
    subject: 'Tuesday walkthrough',
    labels: ['INBOX', 'UNREAD'],
    messages: [
      reply(ME_PERSONAL, [MAYA], 4, 9, 'Can we move the walkthrough to Tuesday? Thursday got eaten by the install.'),
      reply(MAYA, [ME_PERSONAL], 3, 17, 'Tuesday works. I will bring the revised elevations.', 'Do you want Dev there for the wiring questions?'),
      reply(ME_PERSONAL, [MAYA], 3, 18, 'Yes please — the panel placement is the whole argument.'),
      reply(MAYA, [ME_PERSONAL], 2, 8, 'Booked. 10:30, meet at the side entrance. I will bring coffee.'),
    ],
  },
  {
    account: 0,
    id: 'p-cabin',
    subject: 'Cabin weekend — dates?',
    labels: ['INBOX', 'Label_travel'],
    messages: [
      reply(JULES, [ME_PERSONAL, SAM], 12, 11, 'The cabin is free the second and fourth weekends of next month.', 'Second weekend suits me better but I can flex.'),
      reply(SAM, [JULES, ME_PERSONAL], 12, 14, 'Fourth for me — I am at the print fair on the second.'),
      reply(ME_PERSONAL, [JULES, SAM], 11, 9, 'Fourth works. I will drive if someone else does the food plan.'),
      reply(JULES, [ME_PERSONAL, SAM], 11, 10, 'Deal. I will start a list.'),
      reply(SAM, [JULES, ME_PERSONAL], 10, 20, 'Adding the good bread place to the route.'),
    ],
  },
  {
    account: 0,
    id: 'p-mum',
    subject: 'Photos from the weekend',
    labels: ['INBOX', 'STARRED', 'Label_family'],
    messages: [
      {
        from: MUM,
        to: [ME_PERSONAL],
        daysAgo: 6,
        hour: 19,
        html: plain('A few from Sunday. The one of you and your father came out well.', 'Call when you have a minute.'),
        attachments: [{ filename: 'sunday-01.png', mimeType: 'image/png', sizeBytes: 2_411_002 }],
      },
      reply(ME_PERSONAL, [MUM], 5, 21, 'These are lovely. Calling tomorrow evening.'),
    ],
  },
  {
    account: 0,
    id: 'p-bike',
    subject: 'Bike service — ready Thursday',
    labels: ['INBOX', 'UNREAD'],
    messages: [
      reply(A('Ridgeline Cycles', 'shop@ridgelinecycles.example'), [ME_PERSONAL], 2, 15, 'Your bike is ready. Rear hub was the noise, as suspected.', 'We are open until 18:00 Thursday and Friday.'),
    ],
  },
  {
    account: 0,
    id: 'p-neighbour',
    subject: 'Parcel taken in',
    labels: ['INBOX'],
    messages: [
      reply(A('Rosa Iremonger', 'rosa@quillfield.example'), [ME_PERSONAL], 8, 13, 'Took in a box for you this morning. Knock whenever.'),
      reply(ME_PERSONAL, [ROSA], 8, 18, 'You are a hero. Coming by after seven.'),
    ],
  },
  {
    account: 0,
    id: 'p-booklub',
    subject: 'Book club: next pick',
    labels: ['INBOX', 'UNREAD'],
    messages: [
      reply(PRIYA, [ME_PERSONAL, JULES, SAM], 1, 12, 'Two candidates for next month. Vote by Friday, please.', 'I am mildly biased toward the shorter one.'),
    ],
  },
  {
    account: 0,
    id: 'p-dentist',
    subject: 'Appointment reminder — 14:20',
    labels: ['INBOX'],
    messages: [
      reply(A('Fairhaven Dental', 'reception@fairhavendental.example'), [ME_PERSONAL], 16, 8, 'This is a reminder for your appointment. Reply CONFIRM to hold the slot.'),
    ],
  },
  {
    account: 0,
    id: 'p-guitar',
    subject: 'Strings and a setup',
    labels: ['INBOX'],
    messages: [
      reply(SAM, [ME_PERSONAL], 22, 16, 'The shop on Alder Street does setups for less than you paid last time.', 'Ask for Nadia.'),
      reply(ME_PERSONAL, [SAM], 21, 9, 'Booked for the 12th. Thanks.'),
    ],
  },

  // --- personal account: transactional --------------------------------------
  {
    account: 0,
    id: 'p-flight',
    subject: 'Your Alderfly Air itinerary — SFO to PDX',
    labels: ['INBOX', 'STARRED', 'Label_travel'],
    messages: [
      {
        from: A('Alderfly Air', 'no-reply@alderflyair.example'),
        to: [ME_PERSONAL],
        daysAgo: 9,
        hour: 6,
        html: receipt({
          brand: 'Alderfly Air',
          accent: '#0f766e',
          title: 'Booking confirmed — AF 2214',
          rows: [
            ['Passenger', 'Nick Galang'],
            ['Route', 'San Francisco (SFO) → Portland (PDX)'],
            ['Departs', 'Fri, 09:40'],
            ['Arrives', 'Fri, 11:25'],
            ['Seat', '14A · window'],
            ['Confirmation', 'QK7RTP'],
            ['Total', '$188.40'],
          ],
          note: 'Check in opens 24 hours before departure. Carry-on only on this fare.',
        }),
      },
    ],
  },
  {
    account: 0,
    id: 'p-order',
    subject: 'Order HS-40812 has shipped',
    labels: ['INBOX', 'Label_receipts'],
    messages: [
      {
        from: A('Harlow Supply', 'orders@harlowsupply.example'),
        to: [ME_PERSONAL],
        daysAgo: 5,
        hour: 11,
        html: receipt({
          brand: 'Harlow Supply',
          accent: '#b45309',
          title: 'Your order is on its way',
          rows: [
            ['Order', 'HS-40812'],
            ['Shipped', 'Today, 09:12'],
            ['Carrier', 'Meridian Post'],
            ['Tracking', 'MP 4471 9902 55'],
            ['Items', 'Drafting lamp, 2 × A2 pad'],
            ['Total', '$142.00'],
          ],
          note: 'Your invoice is attached as a PDF.',
        }),
        attachments: [{ filename: 'invoice-40812.pdf', mimeType: 'application/pdf', sizeBytes: 88_231 }],
      },
    ],
  },
  {
    account: 0,
    id: 'p-bank',
    subject: 'Statement ready — Northshore Bank',
    labels: ['INBOX', 'Label_receipts'],
    messages: [
      {
        from: A('Northshore Bank', 'alerts@northshorebank.example'),
        to: [ME_PERSONAL],
        daysAgo: 18,
        hour: 7,
        html: plain('Your monthly statement is ready to view.', 'We will never ask for your password by email.'),
        attachments: [{ filename: 'statement-august.pdf', mimeType: 'application/pdf', sizeBytes: 214_880 }],
      },
    ],
  },
  {
    account: 0,
    id: 'p-gym',
    subject: 'Membership renews on the 1st',
    labels: ['INBOX', 'UNREAD', 'Label_receipts'],
    messages: [
      reply(A('Ridgeline Gym', 'hello@ridgelinegym.example'), [ME_PERSONAL], 3, 7, 'Your membership renews on the 1st at the current rate.', 'Nothing to do unless you want to change plan.'),
    ],
  },

  // --- personal account: newsletters ----------------------------------------
  {
    account: 0,
    id: 'p-marginal',
    subject: 'The Marginal Weekly — issue 148',
    labels: ['INBOX', 'UNREAD'],
    messages: [
      {
        from: A('The Marginal Weekly', 'hello@marginalweekly.example'),
        to: [ME_PERSONAL],
        daysAgo: 1,
        hour: 6,
        html: newsletter({
          masthead: 'The Marginal Weekly',
          accent: '#7c3aed',
          kicker: 'Issue 148',
          headline: 'The quiet case for doing less, better',
          standfirst: 'Three arguments for narrowing scope, and one against.',
          items: [
            { title: 'Scope is a budget, not a wish', blurb: 'Teams that write down what they are not doing ship earlier and argue less.' },
            { title: 'The second draft problem', blurb: 'Why the middle of a project is where quality is actually decided.' },
            { title: 'Reader mail', blurb: 'On calendars, meetings, and the myth of the maker day.' },
          ],
          footer: 'You are receiving this because you subscribed at marginalweekly.example. Unsubscribe any time.',
        }),
      },
    ],
  },
  {
    account: 0,
    id: 'p-offhours',
    subject: 'Offhours: eleven small things',
    labels: ['INBOX'],
    messages: [
      {
        from: A('Offhours', 'dispatch@offhours.example'),
        to: [ME_PERSONAL],
        daysAgo: 7,
        hour: 8,
        // One of the two threads that pulls a remote image.
        html: newsletter({
          masthead: 'Offhours',
          accent: '#e11d48',
          kicker: 'Saturday dispatch',
          headline: 'Eleven small things worth your weekend',
          standfirst: 'A short list, mostly about making things with your hands.',
          heroImage: 'https://images.offhours.example/dispatch/hero-114.jpg',
          items: [
            { title: 'A better bread tin', blurb: 'Heavier than it looks, and the only one that has not warped.' },
            { title: 'Field notes on repair', blurb: 'A repair café in a converted bus, and what they fix most.' },
          ],
          footer: 'Offhours, sent most Saturdays. Reply to this email to reach a human.',
        }),
      },
    ],
  },
  {
    account: 0,
    id: 'p-typetuesday',
    subject: 'Type Tuesday — grotesques that age well',
    labels: ['INBOX'],
    messages: [
      {
        from: A('Type Tuesday', 'letters@typetuesday.example'),
        to: [ME_PERSONAL],
        daysAgo: 14,
        hour: 9,
        html: newsletter({
          masthead: 'Type Tuesday',
          accent: '#0f172a',
          kicker: 'Letter 62',
          headline: 'Grotesques that still look right at 11px',
          standfirst: 'Screen typography is mostly a question of what survives the small sizes.',
          items: [
            { title: 'Hinting is not the whole story', blurb: 'Counters and terminals matter more than most hinting arguments admit.' },
            { title: 'Three pairings', blurb: 'One safe, one interesting, one you should probably not ship.' },
          ],
          footer: 'Type Tuesday · unsubscribe · manage preferences',
        }),
      },
    ],
  },
  {
    account: 0,
    id: 'p-brightwater',
    subject: 'New arrivals: the Kirinyaga lot',
    labels: ['INBOX'],
    messages: [
      {
        from: A('Brightwater Coffee', 'news@brightwatercoffee.example'),
        to: [ME_PERSONAL],
        daysAgo: 24,
        hour: 10,
        html: newsletter({
          masthead: 'Brightwater Coffee',
          accent: '#b45309',
          kicker: 'New arrivals',
          headline: 'The Kirinyaga lot is back',
          standfirst: 'Blackcurrant, brown sugar, and the acidity you either love or complain about.',
          heroImage: 'https://cdn.brightwatercoffee.example/lots/kirinyaga-2026.jpg',
          items: [{ title: 'Subscriptions', blurb: 'Skip, pause, or swap any week from your account page.' }],
          footer: 'Brightwater Coffee · you subscribed in store · unsubscribe',
        }),
      },
    ],
  },
  {
    account: 0,
    id: 'p-signal',
    subject: 'Signal & Noise: the interface issue',
    labels: ['INBOX'],
    messages: [
      {
        from: A('Signal & Noise', 'editor@signalnoise.example'),
        to: [ME_PERSONAL],
        daysAgo: 31,
        hour: 7,
        html: newsletter({
          masthead: 'Signal & Noise',
          accent: '#0891b2',
          kicker: 'Monthly',
          headline: 'Interfaces that tell you the truth',
          standfirst: 'On progress bars, optimistic updates, and lying politely.',
          items: [
            { title: 'The optimistic lie', blurb: 'When showing the result before it happens is honest, and when it is not.' },
            { title: 'Undo as an apology', blurb: 'Cheap undo beats expensive confirmation, almost always.' },
          ],
          footer: 'Signal & Noise · unsubscribe',
        }),
      },
    ],
  },

  // --- personal: sent, trash ------------------------------------------------
  {
    account: 0,
    id: 'p-sent-landlord',
    subject: 'Radiator in the back room',
    labels: ['SENT'],
    messages: [
      reply(ME_PERSONAL, [A('Porter & Moss Lettings', 'repairs@porterandmoss.example')], 13, 10, 'The radiator in the back room is cold at the top again.', 'I bled it in spring, so I suspect the valve.', SIGN_OFF),
    ],
  },
  {
    account: 0,
    id: 'p-sent-rsvp',
    subject: 'Re: Housewarming, the 22nd',
    labels: ['SENT'],
    messages: [
      reply(ME_PERSONAL, [PRIYA], 20, 21, 'Wouldn\'t miss it. Bringing the good olives.', SIGN_OFF),
    ],
  },
  {
    account: 0,
    id: 'p-trash-promo',
    subject: 'LAST CHANCE: 40% off everything',
    labels: ['TRASH'],
    messages: [
      reply(A('Verge Outfitters', 'promo@vergeoutfitters.example'), [ME_PERSONAL], 26, 5, 'Final hours. Everything must go.'),
    ],
  },

  // --- work account: conversations -----------------------------------------
  {
    account: 1,
    id: 'w-quarterly',
    subject: 'Quarterly review — draft agenda',
    labels: ['INBOX', 'UNREAD', 'Label_reviews'],
    messages: [
      reply(TOM, [ME_WORK, HANI], 1, 9, 'Draft agenda attached to the doc. Two open questions on hiring.', 'Can you take the platform section?'),
      reply(HANI, [TOM, ME_WORK], 1, 10, 'I can cover the incident review if that helps.'),
    ],
  },
  {
    account: 1,
    id: 'w-onboarding',
    subject: 'Onboarding doc needs a second pass',
    labels: ['INBOX', 'Label_hiring'],
    messages: [
      reply(HANI, [ME_WORK], 3, 14, 'The setup section drifted. Half of it references the old CLI.'),
      reply(ME_WORK, [HANI], 3, 16, 'I will rewrite it Thursday. Do you have the new flags list?'),
      reply(HANI, [ME_WORK], 2, 9, 'Pushed to the wiki this morning.'),
    ],
  },
  {
    account: 1,
    id: 'w-latency',
    subject: 'p95 latency after the cache change',
    labels: ['INBOX', 'UNREAD'],
    messages: [
      reply(DEV, [ME_WORK, TOM], 2, 11, 'p95 dropped from 840ms to 310ms after the cache change. Graphs in the dashboard.', 'The tail is still ugly on cold start.'),
      reply(TOM, [DEV, ME_WORK], 2, 12, 'Great result. What is the cold-start path doing?'),
      reply(DEV, [TOM, ME_WORK], 2, 13, 'Rebuilding the whole index. I want to persist it between deploys.'),
    ],
  },
  {
    account: 1,
    id: 'w-contract',
    subject: 'Contract redlines — Lanternhouse',
    labels: ['INBOX'],
    messages: [
      {
        from: PRIYA,
        to: [ME_WORK],
        daysAgo: 10,
        hour: 15,
        html: plain('Redlines attached. The indemnity clause is the only one I would push back on.', 'Everything else is housekeeping.'),
        attachments: [{ filename: 'lanternhouse-msa-redlines.pdf', mimeType: 'application/pdf', sizeBytes: 402_118 }],
      },
      reply(ME_WORK, [PRIYA], 9, 9, 'Agreed on indemnity. I will get legal to look Monday.'),
    ],
  },
  {
    account: 1,
    id: 'w-design-review',
    subject: 'Design review: settings surface',
    labels: ['INBOX', 'Label_reviews'],
    messages: [
      reply(MAYA, [ME_WORK, DEV], 6, 10, 'Two options in the file. Option B collapses the account block.', 'I lean B, but it costs us a click on the common path.'),
      reply(ME_WORK, [MAYA, DEV], 6, 11, 'B, but promote the signed-in account to the header so the click is not lost.'),
      reply(DEV, [MAYA, ME_WORK], 5, 8, 'Works for me. I will stub the header slot today.'),
    ],
  },
  {
    account: 1,
    id: 'w-incident',
    subject: 'Incident 2026-14 — write-up',
    labels: ['INBOX', 'STARRED'],
    messages: [
      reply(DEV, [ME_WORK, TOM, HANI], 15, 18, 'Write-up is in the doc. Root cause was the retry storm, not the deploy.', 'Action items are assigned and dated.'),
      reply(TOM, [DEV, ME_WORK, HANI], 15, 19, 'Thanks for the fast turnaround. Adding it to Friday.'),
    ],
  },
  {
    account: 1,
    id: 'w-vendor',
    subject: 'Renewal quote — observability',
    labels: ['INBOX', 'UNREAD'],
    messages: [
      reply(A('Keel Metrics', 'accounts@keelmetrics.example'), [ME_WORK], 4, 13, 'Your renewal quote is ready. Volume tier moves you into the next band.'),
    ],
  },
  {
    account: 1,
    id: 'w-standup',
    subject: 'Moving standup to 09:45',
    labels: ['INBOX'],
    messages: [
      reply(HANI, [ME_WORK, DEV, TOM], 19, 8, 'Moving standup fifteen minutes later so the Europe folk are not dialling in at dawn.'),
      reply(DEV, [HANI, ME_WORK, TOM], 19, 8, 'Much better, thanks.'),
    ],
  },
  {
    account: 1,
    id: 'w-calendar',
    subject: 'Invitation: Platform sync @ Thu 15:00',
    labels: ['INBOX'],
    messages: [
      {
        from: A('Calendar', 'calendar-notification@northshoreapp.io'),
        to: [ME_WORK],
        daysAgo: 2,
        hour: 9,
        html: `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:20px 0">
  <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
      <tr><td style="background:#1d4ed8;padding:16px 20px;${SANS};color:#ffffff;font-size:16px;font-weight:600">Platform sync</td></tr>
      <tr><td style="padding:20px">
        <div style="${SANS};font-size:14px;color:#374151;line-height:1.7">
          <strong>When</strong> Thursday, 15:00 – 15:45<br>
          <strong>Where</strong> Meeting room 2 / video<br>
          <strong>Organiser</strong> Tom Okafor<br>
          <strong>Guests</strong> 5 invited, 3 accepted
        </div>
        <div style="padding:18px 0 0">
          <span style="display:inline-block;${SANS};font-size:13px;font-weight:600;color:#ffffff;background:#1d4ed8;border-radius:6px;padding:8px 16px;margin-right:8px">Yes</span>
          <span style="display:inline-block;${SANS};font-size:13px;font-weight:600;color:#374151;background:#f1f5f9;border-radius:6px;padding:8px 16px;margin-right:8px">Maybe</span>
          <span style="display:inline-block;${SANS};font-size:13px;font-weight:600;color:#374151;background:#f1f5f9;border-radius:6px;padding:8px 16px">No</span>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>`,
        attachments: [{ filename: 'invite.ics', mimeType: 'text/calendar', sizeBytes: 1_204 }],
      },
    ],
  },
  {
    account: 1,
    id: 'w-hiring',
    subject: 'Candidate debrief — backend',
    labels: ['INBOX', 'Label_hiring'],
    messages: [
      reply(TOM, [ME_WORK, HANI], 27, 16, 'Debrief notes are in. Strong on systems, thin on testing habits.', 'I would still say hire, with a clear ramp plan.'),
      reply(ME_WORK, [TOM, HANI], 27, 17, 'Agreed. I will write the ramp plan before the offer goes out.'),
    ],
  },
  {
    account: 1,
    id: 'w-security',
    subject: 'Dependency advisory — action needed',
    labels: ['INBOX', 'UNREAD'],
    messages: [
      reply(A('Sentinel Advisories', 'alerts@sentineladvisories.example'), [ME_WORK], 8, 5, 'A dependency in two of your services has a published advisory.', 'Patched versions are available for both.'),
    ],
  },
  {
    account: 1,
    id: 'w-offsite',
    subject: 'Offsite logistics',
    labels: ['INBOX'],
    messages: [
      reply(A('Ilse Vantongeren', 'ilse@northshoreapp.io'), [ME_WORK], 34, 11, 'Rooms are held for the 3rd and 4th. Dietary form goes out Monday.'),
      reply(ME_WORK, [A('Ilse Vantongeren', 'ilse@northshoreapp.io')], 34, 12, 'Both nights for me, no dietary restrictions.'),
    ],
  },
  {
    account: 1,
    id: 'w-api-docs',
    subject: 'API docs: versioning question',
    labels: ['INBOX'],
    messages: [
      reply(A('Bo Lindqvist', 'bo@quillfield.example'), [ME_WORK], 41, 14, 'Are you versioning the docs alongside the API, or keeping one live set?'),
      reply(ME_WORK, [A('Bo Lindqvist', 'bo@quillfield.example')], 41, 15, 'One live set for now. We will version when the first breaking change lands.'),
    ],
  },
  {
    account: 1,
    id: 'w-budget',
    subject: 'Q4 tooling budget',
    labels: ['INBOX'],
    messages: [
      reply(TOM, [ME_WORK], 52, 10, 'Send me your tooling asks for Q4 by the end of the month.'),
    ],
  },
  {
    account: 1,
    id: 'w-postmortem-old',
    subject: 'Postmortem template refresh',
    labels: ['INBOX'],
    messages: [
      reply(HANI, [ME_WORK, DEV], 63, 9, 'The template is too long and nobody fills in section 5.', 'Proposal: cut it to one page.'),
      reply(ME_WORK, [HANI, DEV], 63, 13, 'Strongly in favour. One page or it does not get written.'),
    ],
  },
  {
    account: 1,
    id: 'w-conference',
    subject: 'Talk accepted — Interfaces track',
    labels: ['INBOX', 'STARRED'],
    messages: [
      reply(A('Fieldnotes Conf', 'program@fieldnotesconf.example'), [ME_WORK], 71, 12, 'Your talk was accepted for the Interfaces track.', 'Speaker logistics follow in a separate email.'),
    ],
  },
  {
    account: 1,
    id: 'w-archive-old',
    subject: 'Welcome to Northshore',
    labels: ['INBOX'],
    messages: [
      reply(A('Northshore People', 'people@northshoreapp.io'), [ME_WORK], 86, 9, 'Everything you need for your first week is in this note.'),
    ],
  },

  // --- work: sent, trash ----------------------------------------------------
  {
    account: 1,
    id: 'w-sent-summary',
    subject: 'Weekly summary — platform',
    labels: ['SENT'],
    messages: [
      reply(ME_WORK, [TOM, HANI, DEV], 2, 17, 'Cache change shipped, p95 down to 310ms. Cold start is next.', 'Docs pass moves to Thursday.', SIGN_OFF),
    ],
  },
  {
    account: 1,
    id: 'w-sent-intro',
    subject: 'Intro: Priya and Dev',
    labels: ['SENT'],
    messages: [
      reply(ME_WORK, [PRIYA, DEV], 11, 10, 'Connecting you two on the contract questions. Priya has the redlines.', SIGN_OFF),
    ],
  },
  {
    account: 1,
    id: 'w-sent-ramp',
    subject: 'Ramp plan draft',
    labels: ['SENT'],
    messages: [
      reply(ME_WORK, [TOM], 26, 15, 'First draft of the ramp plan. Four weeks, with a checkpoint at two.', SIGN_OFF),
    ],
  },
  {
    account: 1,
    id: 'w-sent-decline',
    subject: 'Re: Partnership call',
    labels: ['SENT'],
    messages: [
      reply(ME_WORK, [A('Ravi Deshpande', 'ravi@meridianworks.example')], 44, 9, 'Thanks for the note — not the right quarter for us, but keep us posted.', SIGN_OFF),
    ],
  },
  {
    account: 0,
    id: 'p-podcast',
    subject: 'That episode you mentioned',
    labels: ['INBOX', 'Label_family'],
    messages: [
      reply(SAM, [ME_PERSONAL], 37, 20, 'Found it — the one about the bridge engineers. Second half is the good half.'),
      reply(ME_PERSONAL, [SAM], 36, 8, 'Listening on the drive up. Thanks.'),
    ],
  },
  {
    account: 0,
    id: 'p-library',
    subject: 'Hold ready for collection',
    labels: ['INBOX'],
    messages: [
      reply(A('Quillfield Library', 'holds@quillfieldlibrary.example'), [ME_PERSONAL], 45, 7, 'Your hold is ready and will be kept for seven days.'),
    ],
  },
  {
    account: 1,
    id: 'w-retro',
    subject: 'Retro actions from last sprint',
    labels: ['INBOX'],
    messages: [
      reply(DEV, [ME_WORK, HANI], 57, 15, 'Three actions carried over. Two are mine, one is unowned.'),
      reply(ME_WORK, [DEV, HANI], 57, 16, 'I will take the unowned one. It is the flaky test job.'),
    ],
  },
  {
    account: 1,
    id: 'w-trash-recruiter',
    subject: 'Exciting opportunity!!',
    labels: ['TRASH'],
    messages: [
      reply(A('Talent Reach', 'jobs@talentreach.example'), [ME_WORK], 30, 8, 'I came across your profile and thought of a role that could be perfect.'),
    ],
  },
]

// --- expansion -------------------------------------------------------------

const HOUR = 3_600_000
const DAY = 24 * HOUR

function snippetOf(html: string): string {
  const text = htmlToText(html).replace(/\s+/g, ' ').trim()
  return text.length > 140 ? `${text.slice(0, 139)}…` : text
}

export interface DemoData {
  accounts: Account[]
  threads: Thread[]
  messagesByThread: Map<string, Message[]>
  labelsByAccount: Map<string, Label[]>
}

const SYSTEM_LABELS = ['INBOX', 'SENT', 'TRASH', 'STARRED', 'UNREAD', 'DRAFT', 'IMPORTANT']

/**
 * The user labels each demo account offers.
 *
 * **Every one of them has threads behind it, and must keep having them.** The
 * demo is the only way to see Maru without connecting a Gmail account, so a
 * label declared here and attached to nothing makes the label lens, the
 * coloured chips, the picker and the `label:` operator all look like features
 * that do nothing (issue 4). The ids appear in THREAD_SPECS' `labels` arrays;
 * tests/demo.test.ts fails if a label is left empty.
 */
const USER_LABELS: Record<string, { id: string; name: string }[]> = {
  'demo-personal': [
    { id: 'Label_travel', name: 'Travel' },
    { id: 'Label_receipts', name: 'Receipts' },
    { id: 'Label_family', name: 'Family' },
  ],
  'demo-work': [
    { id: 'Label_reviews', name: 'Reviews' },
    { id: 'Label_hiring', name: 'Hiring' },
  ],
  'demo-side': [{ id: 'Label_clients', name: 'Clients' }],
}

export function labelsFor(accountId: string): Label[] {
  const system: Label[] = SYSTEM_LABELS.map((id) => ({ id, accountId, name: id, type: 'system' as const }))
  const user: Label[] = (USER_LABELS[accountId] ?? []).map((l) => ({
    id: l.id,
    accountId,
    name: l.name,
    type: 'user' as const,
  }))
  return [...system, ...user]
}

function expandThread(spec: ThreadSpec, accountId: string, now: number): { thread: Thread; messages: Message[] } {
  const messages: Message[] = spec.messages.map((m, index) => {
    const date = now - m.daysAgo * DAY + (m.hour ?? 9) * HOUR - 9 * HOUR
    const id = `${spec.id}-m${index}`
    const attachments: Attachment[] = (m.attachments ?? []).map((a, ai) => ({
      id: `${id}-att${ai}`,
      messageId: id,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      inline: a.inline ?? false,
      contentId: a.contentId,
    }))
    const isLast = index === spec.messages.length - 1
    const labelIds = m.labels ?? (isLast ? spec.labels : spec.labels.filter((l) => l !== 'UNREAD'))
    return {
      id,
      threadId: spec.id,
      accountId,
      from: m.from,
      to: m.to ?? [],
      cc: m.cc ?? [],
      bcc: [],
      replyTo: [],
      date,
      subject: index === 0 ? spec.subject : `Re: ${spec.subject}`,
      snippet: snippetOf(m.html),
      bodyHtml: m.html,
      bodyText: htmlToText(m.html),
      bodyState: 'full',
      labelIds,
      attachments,
      rfcMessageId: `<${id}@wren.demo>`,
      references: index === 0 ? undefined : `<${spec.id}-m0@wren.demo>`,
      inReplyTo: index === 0 ? undefined : `<${spec.id}-m${index - 1}@wren.demo>`,
      unread: labelIds.includes('UNREAD'),
      starred: labelIds.includes('STARRED'),
    }
  })

  return { thread: mapGmailThread(accountId, { id: spec.id }, messages), messages }
}

export function buildDemoData(now = Date.now()): DemoData {
  const accounts: Account[] = DEMO_ACCOUNT_SEEDS.map((seed, i) => ({ ...seed, addedAt: now - (90 - i) * DAY }))
  const threads: Thread[] = []
  const messagesByThread = new Map<string, Message[]>()

  for (const spec of THREAD_SPECS) {
    const accountId = accounts[spec.account].id
    const { thread, messages } = expandThread(spec, accountId, now)
    threads.push(thread)
    messagesByThread.set(thread.key, messages)
  }
  threads.sort((a, b) => b.lastMessageAt - a.lastMessageAt)

  const labelsByAccount = new Map<string, Label[]>()
  for (const a of accounts) labelsByAccount.set(a.id, labelsFor(a.id))

  return { accounts, threads, messagesByThread, labelsByAccount }
}

/** The account `addAccount()` adds in demo mode, with a small inbox of its own. */
export function buildExtraAccount(now = Date.now()): {
  account: Account
  threads: Thread[]
  messagesByThread: Map<string, Message[]>
  labels: Label[]
} {
  const account: Account = { ...DEMO_EXTRA_ACCOUNT, addedAt: now }
  const specs: ThreadSpec[] = [
    {
      account: 0,
      id: 's-brief',
      subject: 'Brief for the Quillfield rebrand',
      labels: ['INBOX', 'UNREAD', 'Label_clients'],
      messages: [
        reply(ROSA, [A('Nick Galang', DEMO_EXTRA_ACCOUNT.email)], 1, 10, 'Brief attached in the doc. Two weeks for a first pass?'),
      ],
    },
    {
      account: 0,
      id: 's-invoice',
      subject: 'Invoice 2026-041 paid',
      labels: ['INBOX', 'Label_clients'],
      messages: [
        reply(A('Quillfield Studio', 'accounts@quillfield.example'), [A('Nick Galang', DEMO_EXTRA_ACCOUNT.email)], 4, 8, 'Invoice 2026-041 has been paid. Remittance attached.'),
      ],
    },
    {
      account: 0,
      id: 's-sent-scope',
      subject: 'Scope and rates',
      labels: ['SENT', 'Label_clients'],
      messages: [
        reply(A('Nick Galang', DEMO_EXTRA_ACCOUNT.email), [ROSA], 6, 16, 'Scope, rates and availability in one place.', SIGN_OFF),
      ],
    },
  ]

  const threads: Thread[] = []
  const messagesByThread = new Map<string, Message[]>()
  for (const spec of specs) {
    const { thread, messages } = expandThread(spec, account.id, now)
    threads.push(thread)
    messagesByThread.set(thread.key, messages)
  }

  return { account, threads, messagesByThread, labels: labelsFor(account.id) }
}
