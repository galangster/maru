// One-off: convert the bundled DM Sans TTFs to woff2.
//
// DIRECTION.md §4 asks for woff2 for both families. Open Runde already ships
// as woff2; DM Sans ships as ~56 KB TTFs. ttf2woff2 is pure JS (emscripten),
// so this runs anywhere node runs and needs no system toolchain.
//
//   node scripts/build-fonts.mjs
//
// Re-run only when the source TTFs change. The generated .woff2 files are
// committed, so a normal build never invokes this.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ttf2woff2 from 'ttf2woff2'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'src/assets/fonts/dm-sans')
const faces = ['DMSans-Regular', 'DMSans-Medium']

for (const face of faces) {
  const src = join(dir, `${face}.ttf`)
  if (!existsSync(src)) {
    console.error(`missing ${src}`)
    process.exitCode = 1
    continue
  }
  const ttf = readFileSync(src)
  const woff2 = ttf2woff2(ttf)
  const out = join(dir, `${face}.woff2`)
  writeFileSync(out, woff2)
  const pct = Math.round((1 - woff2.length / ttf.length) * 100)
  console.log(`${face}: ${ttf.length} -> ${woff2.length} bytes (-${pct}%)`)
}
