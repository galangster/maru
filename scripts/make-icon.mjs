// The macOS app icon, built from Nick's coral-bird art.
//
//   node scripts/make-icon.mjs
//
// Input:  src-tauri/icons/source.png — the full-square art (bird on coral).
// Output: src-tauri/icons/icon.icns — the same art on Apple's icon grid:
//         a 1024 canvas, transparent margins, the art masked into an
//         824×824 rounded rect (radius 185, ~the Big Sur squircle). Without
//         the grid, macOS 26 renders the square on a generated backing
//         plate — the grey slab this script exists to kill.
//
// Windows (.ico), Linux and the store tiles stay full-square on purpose:
// only macOS composes its shelf from the icon's own silhouette.

import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceFile = resolve(root, "src-tauri/icons/source.png");
const icnsFile = resolve(root, "src-tauri/icons/icon.icns");

const CANVAS = 1024;
const ART = 824; // Apple's icon-grid artwork square
const RADIUS = 185; // ≈ the Big Sur corner radius at this size

const mask = Buffer.from(
  `<svg width="${ART}" height="${ART}"><rect width="${ART}" height="${ART}" rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/></svg>`,
);

const art = await sharp(sourceFile)
  .resize(ART, ART)
  .composite([{ input: mask, blend: "dest-in" }])
  .png()
  .toBuffer();

const canvas = await sharp({
  create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: art, left: (CANVAS - ART) / 2, top: (CANVAS - ART) / 2 }])
  .png()
  .toBuffer();

// iconutil wants the named-size set; each entry is (points, scale).
const iconset = resolve(tmpdir(), `wren-${Date.now()}.iconset`);
await mkdir(iconset, { recursive: true });
const entries = [
  [16, 1], [16, 2], [32, 1], [32, 2], [128, 1], [128, 2], [256, 1], [256, 2], [512, 1], [512, 2],
];
for (const [points, scale] of entries) {
  const px = points * scale;
  const name = `icon_${points}x${points}${scale === 2 ? "@2x" : ""}.png`;
  await writeFile(resolve(iconset, name), await sharp(canvas).resize(px, px).png().toBuffer());
}
execFileSync("iconutil", ["-c", "icns", iconset, "-o", icnsFile]);
await rm(iconset, { recursive: true });
console.log(`Wrote ${icnsFile}`);
