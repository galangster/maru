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
function comps(target, minN) {
  const seen = new Uint8Array(W * W); const out = [];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (cls[i] !== target || seen[i]) continue;
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
        if (cls[j] === target && !seen[j]) { seen[j] = 1; q.push([nx, ny]); }
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
// identify: wing = largest pink; eye = tall small pink inside head; beak = pink at far right
const wing = pinks[0];
const rest = pinks.slice(1);
const eye = rest.find(c => (c.bbox[3]-c.bbox[1]) > (c.bbox[2]-c.bbox[0]));
const beak = rest.find(c => c !== eye);
// highlight: small white comp inside eye bbox
const hi = white.slice(1).find(c => eye && c.bbox[0] >= eye.bbox[0]-4 && c.bbox[2] <= eye.bbox[2]+4 && c.bbox[1] >= eye.bbox[1]-4 && c.bbox[3] <= eye.bbox[3]+4);
const P = (c, tol) => smooth(simplify(boundary(c), tol));
const lines = [];
lines.push(`BODY ${P(body, 2.2)}`);
if (wing) lines.push(`WING ${P(wing, 2)}`);
if (beak) lines.push(`BEAK ${P(beak, 1.5)}`);
if (eye) lines.push(`EYE bbox ${eye.bbox.join(',')}`);
if (hi) lines.push(`HI bbox ${hi.bbox.join(',')}`);
for (const [i, c] of pales.slice(0, 4).entries()) lines.push(`PALE${i} n=${c.n} ${P(c, 1.6)}`);
console.log(lines.join('\n'));
