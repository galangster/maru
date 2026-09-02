// Which way a piece of mail reads — issue #59.
//
// Maru's chrome is left-to-right and stays that way: the panes, the toolbars,
// the sidebar and every label in them are the app's own language. Mail is not.
// A subject or a body in Arabic or Hebrew rendered with an LTR base direction
// has correct WORDS and wrong everything else — the full stop lands at the
// right-hand end of the line instead of the left, and paragraphs align to the
// wrong edge of the sheet.
//
// This is the Unicode first-strong rule, which is what `dir="auto"` runs and
// what every mail client uses: the base direction is decided by the first
// character in the string that has a strong direction of its own. Digits,
// punctuation, spaces and emoji have none, so a subject that opens with "Re:"
// or with a family emoji still takes its direction from the first real word.
//
// It is written out rather than left to `dir="auto"` for two reasons. It can
// be tested, which is how this file earns the claim above. And the answer is a
// value, so a caller that needs to align a box — not just lay out a run of
// text — can ask the same question and get the same answer.

/** The base direction of a run of text. */
export type TextDirection = 'ltr' | 'rtl'

/**
 * The scripts that are written right to left.
 *
 * By script rather than by code-point range, so the classes stay readable and
 * cannot drift out of step with Unicode as blocks are extended. Hebrew and
 * Arabic are what mail actually arrives in; the other five are the rest of the
 * right-to-left world and cost one word each.
 */
const RTL_SCRIPT =
  /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}]/u

/**
 * Anything with a direction at all.
 *
 * A letter, in any script. Digits, punctuation, spaces, symbols and emoji are
 * deliberately absent: they are the neutrals the first-strong rule is defined
 * to skip, which is what lets "Re: مرحبا" and a subject that opens with a
 * family emoji both take their direction from the first real word.
 */
const STRONG = /\p{Letter}/u

/**
 * The base direction of `text`, by the first character that has one.
 *
 * `ltr` when the string is empty, absent, or made entirely of neutrals — a
 * subject of "..." or of one emoji has no direction to find, and the app's own
 * language is the honest default.
 */
export function textDirection(text: string | null | undefined): TextDirection {
  if (!text) return 'ltr'
  // `for…of` walks code POINTS, so an astral character — an emoji, a rarer
  // CJK ideograph — is one step and never splits into two surrogates that
  // could each be classified as something neither of them is.
  for (const ch of text) {
    if (RTL_SCRIPT.test(ch)) return 'rtl'
    if (STRONG.test(ch)) return 'ltr'
  }
  return 'ltr'
}
