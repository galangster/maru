// @vitest-environment jsdom
//
// The first DOM-dependent tests in the repo. `vitest.config.ts` runs the engine
// in plain Node on purpose, so this file opts itself into a DOM rather than
// slowing every other suite down.
//
// It exists because sanitize.ts is the app's whole defence against hostile mail
// and it had NO coverage at all — which is how three defects survived to be
// found by eye in a screenshot (P16, 2026-08-31): a ~350px hole where a blocked
// hero used to be, a "Show" that silently did nothing for CSS-background
// imagery, and a set of remote-fetch bypasses that defeated the very promise
// the "Remote images blocked" pill makes.

import { describe, expect, it } from 'vitest'

import { buildSrcdoc, sanitizeBody } from '@/lib/sanitize'

const blocked = (html: string) => sanitizeBody(html, { allowRemoteImages: false })
const allowed = (html: string) => sanitizeBody(html, { allowRemoteImages: true })

describe('remote image blocking', () => {
  it('withholds a plain remote image and leaves a chip, not a hole', () => {
    const r = blocked('<img src="https://tracker.example/hero.png" alt="Spring sale" width="600" height="350">')
    expect(r.blockedImages).toBe(1)
    expect(r.html).not.toContain('tracker.example/hero.png')
    expect(r.html).toContain('wren-blocked')
    // The alt survives as the chip's text — that is the whole point of a chip.
    expect(r.html).toContain('Spring sale')
    // And the box it used to reserve is gone.
    expect(r.html).not.toMatch(/height="350"/)
  })

  it('lets the image through once the reader asks', () => {
    const r = allowed('<img src="https://tracker.example/hero.png">')
    expect(r.blockedImages).toBe(0)
    expect(r.html).toContain('https://tracker.example/hero.png')
  })

  it.each([
    ['protocol-relative', '<img src="//tracker.example/px.gif" width="600" height="400">'],
    ['leading whitespace', '<img src="  https://tracker.example/px.gif" width="600" height="400">'],
  ])('blocks a remote src written as %s', (_label, html) => {
    const r = blocked(html)
    expect(r.blockedImages).toBe(1)
    expect(r.html).not.toContain('tracker.example')
  })

  it('drops a tracking pixel entirely rather than showing a chip for it', () => {
    const r = blocked('<p>Hello</p><img src="https://tracker.example/o.gif" width="1" height="1">')
    expect(r.blockedImages).toBe(1)
    expect(r.html).not.toContain('tracker.example')
    // A 1x1 beacon is not a picture; a chip for it would be noise.
    expect(r.html).not.toContain('wren-blocked')
  })

  it('resolves a cid: image against its inline attachment', () => {
    const r = sanitizeBody('<img src="cid:logo@x">', {
      allowRemoteImages: false,
      inlineImages: new Map([['logo@x', 'data:image/png;base64,AAAA']]),
    })
    expect(r.blockedImages).toBe(0)
    expect(r.html).toContain('data:image/png;base64,AAAA')
  })
})

describe('the void — containers a blocked image left empty', () => {
  it('collapses a height attribute on a box that now holds nothing', () => {
    const r = blocked(
      '<table><tr><td height="350"><img src="https://t.example/hero.png" width="600" height="350"></td></tr></table>',
    )
    expect(r.html).not.toMatch(/height="350"/)
  })

  it('collapses an inline height in the same declaration as the stripped background', () => {
    const r = blocked('<div style="background-image:url(https://t.example/h.png);height:350px"></div>')
    expect(r.html).not.toContain('t.example')
    expect(r.html).not.toMatch(/height:\s*350px/)
  })

  it('KEEPS the sizing of a box that still has text', () => {
    // The conservative half of the rule: a wrong collapse silently reflows a
    // legitimate newsletter, which is worse than the hole it fixes.
    // Wrapped in a table: a bare <td> is dropped by the HTML parser itself.
    const r = blocked(
      '<table><tr><td height="350"><img src="https://t.example/h.png" width="600" height="350">Still here</td></tr></table>',
    )
    expect(r.html).toMatch(/height="350"/)
  })

  it('never mangles line-height or max-height while stripping height', () => {
    // The sizing regex had no left boundary, so it matched INSIDE
    // `line-height:` and turned `line-height:20px;color:red` into
    // `line-color:red`. Mail carries line-height on nearly every <td>.
    const r = blocked(
      '<div style="line-height:20px;color:red"><img src="https://t.example/h.png" width="600" height="400"></div>',
    )
    expect(r.html).toContain('line-height')
    expect(r.html).not.toContain('line-color')
  })

  it('KEEPS the sizing of a box painting its own background colour', () => {
    const r = blocked('<div style="background-color:#eee;height:80px"></div>')
    expect(r.html).toMatch(/height:\s*80px/)
  })
})

describe('Show actually shows', () => {
  it('strips a remote CSS background only while images are withheld', () => {
    const css = '<div style="background-image:url(https://t.example/h.png)"></div>'
    expect(blocked(css).html).not.toContain('t.example')
    // The regression: the strip used to be unconditional, so the pill dropped
    // to zero on Show and NOTHING appeared.
    expect(allowed(css).html).toContain('t.example')
  })

  it('never destroys a data: background', () => {
    const css = "<div style=\"background-image:url(data:image/gif;base64,AAAA)\"></div>"
    expect(blocked(css).html).toContain('data:image/gif')
    expect(allowed(css).html).toContain('data:image/gif')
  })

  it('counts a withheld CSS background', () => {
    expect(blocked('<div style="background:url(https://t.example/h.png)"></div>').blockedImages).toBe(1)
  })

  it('does NOT count a cursor url toward the pill', () => {
    // The pill's sentence is about images a sender can use to see that you
    // opened the mail. A cursor is stripped, but counting it makes that
    // number say something untrue.
    const r = blocked('<div style="cursor:url(https://t.example/c.png),auto">x</div>')
    expect(r.html).not.toContain('t.example')
    expect(r.blockedImages).toBe(0)
  })

  it('does NOT count an href on an HTML img, which fetches nothing', () => {
    expect(blocked('<img href="https://t.example/x.png" alt="a">').blockedImages).toBe(0)
  })
})

describe('fetch bypasses', () => {
  it.each([
    ['SVG <image href>', '<svg><image href="https://t.example/px.png"></image></svg>'],
    ['video poster', '<video poster="https://t.example/px.png"></video>'],
    ['list-style-image', '<ul style="list-style-image:url(https://t.example/px.png)"><li>x</li></ul>'],
    ['mask-image', '<div style="mask-image:url(https://t.example/px.png)">x</div>'],
    ['border-image', '<div style="border-image:url(https://t.example/px.png) 30">x</div>'],
    ['cursor', '<div style="cursor:url(https://t.example/px.png),auto">x</div>'],
  ])('closes the %s route', (_label, html) => {
    expect(blocked(html).html).not.toContain('t.example')
  })

  it('still removes scripts and event handlers', () => {
    const r = blocked('<img src="x.png" onerror="alert(1)"><script>alert(2)</script>')
    expect(r.html).not.toContain('onerror')
    expect(r.html).not.toContain('alert(2)')
  })

  it('does not let alt text smuggle markup into the chip', () => {
    const r = blocked('<img src="https://t.example/h.png" width="600" height="400" alt="&lt;b&gt;bold&lt;/b&gt;">')
    expect(r.html).not.toContain('<b>')
  })
})

describe('the srcdoc CSP backstop', () => {
  it('forbids everything and permits data: images while blocking', () => {
    const doc = buildSrcdoc('<p>hi</p>')
    expect(doc).toContain("default-src 'none'")
    expect(doc).toContain('img-src data:;')
  })

  it('widens to exactly what the sanitizer lets through, once allowed', () => {
    // http: as well as https: — the sanitizer treats both as remote-and-
    // allowable, so a CSP permitting only https: would block an http-only
    // newsletter the sanitizer had already passed, and Show would reveal
    // nothing. That is defect 2 one layer down.
    expect(buildSrcdoc('<p>hi</p>', { allowRemoteImages: true })).toContain(
      'img-src data: https: http:;',
    )
  })

})

describe('stripping a height leaves its neighbours intact', () => {
  // `CSS_SIZING` captures the separator that ended the PREVIOUS declaration.
  // Replacing with '' instead of '$1' welded the neighbours together:
  // `width:600px;height:350px;border:0` -> `width:600pxborder:0`, which kills
  // width AND border. Every minified-inline-CSS newsletter with a blocked
  // image hit it. The original tests missed it because none of them put a
  // declaration on both sides of the height.
  const styled = (style: string) =>
    blocked(
      `<div style="${style};background-image:url(https://cdn.example/a.png)">x</div>`,
    ).html

  it('keeps the declaration before the height', () => {
    expect(styled('width:600px;height:350px;border:0')).toContain('width:600px')
  })

  it('keeps the declaration after the height', () => {
    expect(styled('width:600px;height:350px;border:0')).toContain('border:0')
  })

  it('never welds two declarations into one', () => {
    const out = styled('text-align:center;height:350px;font-size:0')
    expect(out).not.toContain('text-align:centerfont-size')
    expect(out).toContain('text-align:center')
    expect(out).toContain('font-size:0')
  })

  it('still does not eat line-height', () => {
    const out = styled('line-height:20px;height:350px;color:red')
    expect(out).toContain('line-height:20px')
    expect(out).toContain('color:red')
    expect(out).not.toContain('line-color')
  })
})

describe('Show actually shows — the two layers must agree', () => {
  // The defect this pins: every increment of `blockedImages` lives inside a
  // `!allowRemoteImages` guard, so the count is 0 in exactly the pass where
  // Show has been clicked. The reading pane keyed the CSP on that count, so
  // clicking Show un-blocked the images in the sanitizer and re-blocked them
  // in the CSP, in the same render. Show was dead for every message.
  //
  // Testing one pass in isolation could never catch it. These assert the
  // ROUND TRIP: block, then allow, and check the second pass still knows the
  // body has remote imagery.
  const cases: [string, string][] = [
    ['an <img>', '<img src="https://cdn.example/hero.png" width="600" height="300">'],
    ['an SVG <image>', '<svg><image href="https://cdn.example/a.png" /></svg>'],
    ['a CSS background', '<div style="background-image:url(https://cdn.example/a.png)">x</div>'],
    ['a protocol-relative src', '<img src="//cdn.example/hero.png" width="600" height="300">'],
  ]

  for (const [what, body] of cases) {
    it(`counts ${what} as remote in BOTH passes`, () => {
      const off = sanitizeBody(body, { allowRemoteImages: false })
      const on = sanitizeBody(body, { allowRemoteImages: true })

      // Withheld only while blocking...
      expect(off.blockedImages).toBeGreaterThan(0)
      expect(on.blockedImages).toBe(0)

      // ...but PRESENT in both, which is what the CSP is keyed on.
      expect(off.remoteImages).toBeGreaterThan(0)
      expect(
        on.remoteImages,
        'if this is 0, the CSP stays at `img-src data:` and Show reveals nothing',
      ).toBeGreaterThan(0)
    })
  }

  it('does not claim remote images for a body that has none', () => {
    // The other half of the contract: a plain reply must NOT widen its CSP,
    // or every message in a thread reloads on every Show click.
    const plain = sanitizeBody('<p>Just text, and a <a href="https://x.test">link</a>.</p>', {
      allowRemoteImages: true,
    })
    expect(plain.remoteImages).toBe(0)
  })

  it('does not count a cid: attachment as remote', () => {
    const inline = new Map([['logo', 'data:image/png;base64,AAA']])
    const out = sanitizeBody('<img src="cid:logo">', {
      allowRemoteImages: false,
      inlineImages: inline,
    })
    expect(out.remoteImages).toBe(0)
    expect(out.blockedImages).toBe(0)
  })
})

describe('link handling', () => {
  it('keeps the link target contract', () => {
    expect(blocked('<a href="https://example.com">x</a>').html).toContain('target="_top"')
  })

  // A srcdoc iframe resolves relative URLs against the PARENT — the app's own
  // origin — and `target="_top"` made that a real top-level navigation the
  // Rust guard allows, because the host matches. So a link in a stranger's
  // email could reload the reader's mail client into another mode.
  const relative = [
    '?screenshot=1',
    '/index.html?demo=1',
    'index.html?onboarding=1',
    './?sync=partial',
    '../?tune=1',
  ]
  for (const href of relative) {
    it(`defuses the relative href ${href}`, () => {
      const out = blocked(`<a href="${href}">Read online</a>`).html
      expect(out).not.toContain('target="_top"')
      expect(out).not.toContain('href=')
      // The text survives — the link is inert, not deleted.
      expect(out).toContain('Read online')
    })
  }

  it('leaves absolute and mailto links alone', () => {
    for (const href of ['https://example.com/x', 'http://example.com', 'mailto:a@b.test']) {
      const out = blocked(`<a href="${href}">x</a>`).html
      expect(out, href).toContain('target="_top"')
      expect(out, href).toContain(href)
    }
  })

  it('keeps in-document anchors usable', () => {
    // A #fragment cannot leave the srcdoc, so it is not a navigation vector.
    expect(blocked('<a href="#footnote">jump</a>').html).toContain('href="#footnote"')
  })
})
