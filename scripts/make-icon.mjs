// Rasterizes the Wren app mark to src-tauri/icons/source.png at 1024x1024.
// Run with: node scripts/make-icon.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = resolve(root, "src-tauri/icons/source.png");

const SIZE = 1024;

// Rounded square with a vertical blue gradient, plus a white bird mark drawn
// from two quadratic wing arcs. Generous margins keep it readable when small.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#1E40AF"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1024" height="1024" rx="224" ry="224" fill="url(#bg)"/>
  <g fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-width="52">
    <path d="M 288 596 Q 512 372 736 596"/>
    <path d="M 376 460 Q 512 300 648 460"/>
  </g>
</svg>`;

await mkdir(dirname(outFile), { recursive: true });
const png = await sharp(Buffer.from(svg)).resize(SIZE, SIZE).png().toBuffer();
await writeFile(outFile, png);
console.log(`Wrote ${outFile} (${SIZE}x${SIZE}, ${png.length} bytes)`);
