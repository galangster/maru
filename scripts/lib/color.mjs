// The colour maths behind every contrast number this repo prints or asserts.
//
// It lives in one file because three callers need to agree exactly:
// `scripts/contrast-audit.mjs` (the report), `tests/contrast.test.ts` (the
// regression gate) and any future capture harness. Two copies of an sRGB
// decode is how a palette ends up certified by one formula and rendered
// against another.

/** OKLab -> linear sRGB (Bjorn Ottosson's matrices). */
export function oklabToLinearSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

export const encode = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)
export const decode = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)

/**
 * An OKLCH triple as the 8-bit sRGB a screen actually shows.
 *
 * Clamped and rounded on purpose: an out-of-gamut value is CLIPPED by the
 * browser, and a ratio computed from the unclipped maths would certify a
 * colour nobody can see. `clipped` reports when that happened.
 */
export function oklchToRgb(L, C, h) {
  const rad = (h * Math.PI) / 180
  const linear = oklabToLinearSrgb(L, C * Math.cos(rad), C * Math.sin(rad))
  const encoded = linear.map(encode)
  const clipped = encoded.some((v) => v < -0.0005 || v > 1.0005)
  const rgb = encoded.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255))
  return { rgb, clipped }
}

export const hex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('')

/** WCAG relative luminance, from the 8-bit values a screen receives. */
export const luminance = ([r, g, b]) =>
  0.2126 * decode(r / 255) + 0.7152 * decode(g / 255) + 0.0722 * decode(b / 255)

/** WCAG 2.x contrast ratio between two opaque colours. */
export function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export const r2 = (n) => Math.round(n * 100) / 100

/**
 * Composite a translucent colour over its backdrop before measuring.
 *
 * A ratio taken against a colour with an alpha channel is meaningless — what
 * the eye receives is the blend, and that is what has to clear the floor.
 */
export function over(fg, bg, alpha) {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)))
}
