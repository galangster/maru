import sharp from '/Users/galangster/Projects/wren/node_modules/sharp/dist/index.mjs';
const SRC = process.argv[2]; const W = 440;
let img = sharp(SRC);
if (process.argv.length >= 7) {
  const meta = await sharp(SRC).metadata();
  const [cx, cy, cw, chh] = process.argv.slice(3, 7).map(Number);
  img = img.extract({ left: Math.round(cx * meta.width), top: Math.round(cy * meta.height), width: Math.round(cw * meta.width), height: Math.round(chh * meta.height) });
}
const { data, info } = await img.resize(W, W).raw().toBuffer({ resolveWithObject: true });
const ch = info.channels;
const rgb = (x, y) => { const i = (y * W + x) * ch; return [data[i], data[i+1], data[i+2]]; };
const dist = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
const BG = [248, 68, 104];

// class: 0 undecided/bg, 1 white, 3 pale, 5 pink-candidate
const cls = new Uint8Array(W * W);
for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
  const c = rgb(x, y); const i = y * W + x;
  if (c[0] > 240 && c[1] > 225 && c[2] > 225) cls[i] = 1;
  else if (c[0] > 243 && c[1] > 150 && c[1] <= 225) cls[i] = 3;
  else if (c[0] > 190 && c[1] < 130) cls[i] = 5;
}
// flood bg from borders through pink-candidates near BG color
const st = [];
for (let x = 0; x < W; x++) st.push([x, 0], [x, W-1]);
for (let y = 0; y < W; y++) st.push([0, y], [W-1, y]);
while (st.length) {
  const [x, y] = st.pop();
  if (x < 0 || y < 0 || x >= W || y >= W) continue;
  const i = y * W + x;
  if (cls[i] !== 5) continue;
  if (dist(rgb(x, y), BG) > 15) continue;
  cls[i] = 0;
  st.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
}
// `target` is a class value, or a predicate for a union of classes (the
// silhouette). One walker either way.
function comps(target, minN) {
  const ok = typeof target === 'function' ? target : (v) => v === target;
  const seen = new Uint8Array(W * W); const out = [];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!ok(cls[i]) || seen[i]) continue;
    const q = [[x, y]]; seen[i] = 1; const pts = [];
    let minX = W, maxX = 0, minY = W, maxY = 0;
    while (q.length) {
      const [cx, cy] = q.pop(); pts.push([cx, cy]);
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cx+dx, ny = cy+dy;
        if (nx<0||ny<0||nx>=W||ny>=W) continue;
        const j = ny*W+nx;
        if (ok(cls[j]) && !seen[j]) { seen[j] = 1; q.push([nx, ny]); }
      }
    }
    if (pts.length >= minN) out.push({ pts, bbox: [minX, minY, maxX, maxY], n: pts.length });
  }
  return out.sort((a, b) => b.n - a.n);
}
function boundary(c) {
  const inC = new Set(c.pts.map(([x, y]) => y*W+x));
  const isIn = (x, y) => x>=0 && y>=0 && x<W && y<W && inC.has(y*W+x);
  let start = null;
  for (const [x, y] of c.pts) if (!isIn(x, y-1)) { if (!start || y < start[1] || (y===start[1] && x<start[0])) start = [x, y]; }
  const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const out = [start]; let cur = start, d = 6;
  for (let s = 0; s < 30000; s++) {
    let ok = false;
    for (let k = 0; k < 8; k++) {
      const nd = (d + 6 + k) % 8;
      const nx = cur[0]+dirs[nd][0], ny = cur[1]+dirs[nd][1];
      if (isIn(nx, ny)) { cur = [nx, ny]; d = nd; out.push(cur); ok = true; break; }
    }
    if (!ok || (cur[0]===start[0] && cur[1]===start[1] && out.length > 3)) break;
  }
  return out;
}
// A traced boundary is a staircase: the source is an antialiased raster, so a
// threshold turns every soft edge into single-pixel steps. Simplifying that
// directly forces a bad trade — a loose tolerance facets the curves, a tight
// one faithfully reproduces the jaggies. Averaging each point against its
// neighbours around the closed loop removes the pixel noise and leaves the
// shape, so the tolerance below can then be tight without being noisy.
function denoise(pts, k) {
  const n = pts.length;
  if (n < 2 * k + 1) return pts;
  const out = [];
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0;
    for (let j = -k; j <= k; j++) { const p = pts[(i + j + n) % n]; sx += p[0]; sy += p[1]; }
    out.push([sx / (2 * k + 1), sy / (2 * k + 1)]);
  }
  return out;
}
function simplify(pts, tol) {
  const sq = tol*tol; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length-1] = 1;
  const rec = (a, b) => {
    let mx = 0, idx = -1; const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx-ax, dy = by-ay, l2 = dx*dx+dy*dy || 1;
    for (let i = a+1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0]-ax)*dx + (pts[i][1]-ay)*dy) / l2));
      const ex = ax+t*dx-pts[i][0], ey = ay+t*dy-pts[i][1]; const d2 = ex*ex+ey*ey;
      if (d2 > mx) { mx = d2; idx = i; }
    }
    if (mx > sq) { keep[idx] = 1; rec(a, idx); rec(idx, b); }
  };
  rec(0, pts.length-1);
  return pts.filter((_, i) => keep[i]);
}
function smooth(pts) {
  const n = pts.length; let d = `M ${pts[0][0]} ${pts[0][1]} `;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i-1+n)%n], p1 = pts[i], p2 = pts[(i+1)%n], p3 = pts[(i+2)%n];
    d += `C ${(p1[0]+(p2[0]-p0[0])/6).toFixed(1)} ${(p1[1]+(p2[1]-p0[1])/6).toFixed(1)} ${(p2[0]-(p3[0]-p1[0])/6).toFixed(1)} ${(p2[1]-(p3[1]-p1[1])/6).toFixed(1)} ${p2[0]} ${p2[1]} `;
  }
  return d + 'Z';
}
const white = comps(1, 400);
const body = white[0];
const pinks = comps(5, 80);
const pales = comps(3, 60);
// Identify the pink components. The ground shadow in Nick's art is a darker
// pink than the plate background, so the border flood leaves it classified as
// pink alongside the wing, beak and eye — and it is BIGGER than the beak, so a
// naive "first remaining component" rule labelled the shadow as the beak and
// dropped the real beak entirely (perched, found 2026-08-31). It is separated
// first, by the two things that only a cast shadow is: wide and flat, and
// lying at the bottom of the figure.
const wing = pinks[0];
const rest = pinks.slice(1);
const w_ = c => c.bbox[2] - c.bbox[0];
const h_ = c => c.bbox[3] - c.bbox[1];
const shadow = rest.find(c => w_(c) > 2.5 * h_(c) && (c.bbox[1] + c.bbox[3]) / 2 > body.bbox[3] - h_(body) * 0.12);
const rest2 = rest.filter(c => c !== shadow);
// The cast shadow is on the GROUND, so it must not join the figure's
// silhouette — erase it before the union below, or the bird grows a lump.
if (shadow) for (const [x, y] of shadow.pts) cls[y * W + x] = 0;
const eye = rest2.find(c => h_(c) > w_(c));
const beak = rest2.find(c => c !== eye);
// highlight: small white comp inside eye bbox
const hi = white.slice(1).find(c => eye && c.bbox[0] >= eye.bbox[0]-4 && c.bbox[2] <= eye.bbox[2]+4 && c.bbox[1] >= eye.bbox[1]-4 && c.bbox[3] <= eye.bbox[3]+4);
// THE SILHOUETTE: the union of every non-background class, as one closed
// outline. It is what the white body is actually drawn from, and the wing,
// beak and eye are then painted ON it.
//
// Tracing the white region alone (the old BODY) made the body and the wing
// share an edge. Two independently simplified polylines never agree along a
// shared edge, so a sub-pixel seam opened between them and the BACKGROUND
// showed through — invisible on the pale field, a black outline on the dark
// one, which is how the owner found it (2026-08-31). A silhouette underneath
// has no internal edges to disagree about.
const figure = comps((v) => v !== 0, 400)[0];
const P = (c, tol, k = 3) => smooth(simplify(denoise(boundary(c), k), tol));
const lines = [];
lines.push(`SILHOUETTE ${P(figure, 1.1)}`);
lines.push(`BODY ${P(body, 1.1)}`);
if (wing) lines.push(`WING ${P(wing, 1.1)}`);
if (beak) lines.push(`BEAK ${P(beak, 1, 1)}`);
if (shadow) lines.push(`SHADOW ${P(shadow, 2)}`);
if (eye) lines.push(`EYE bbox ${eye.bbox.join(',')}`);
if (hi) lines.push(`HI bbox ${hi.bbox.join(',')}`);
for (const [i, c] of pales.slice(0, 4).entries()) lines.push(`PALE${i} n=${c.n} ${P(c, 1.1, 1)}`);
console.log(lines.join('\n'));
