/* Tiles : everything the site draws in the same squares as the birds of the backdrop (backdrop.js).
   Scenes for the step panels, icons, a quiet field of tiles behind the big circles, and screenshots
   shown as a halftone of tiles that clears into the real image. */
const FULL = ['S', 'X', '%', 't', '8', 'S', 'X', '@', 't', '%', 'S', '#'];
const EDGE = ['.', ':', ';', "'", '`', ':', '.'];
const hash = (x, y, s = 0) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const inks = () => { const s = getComputedStyle(document.documentElement); return { ink: s.getPropertyValue('--mira-text').trim() || '#ededed', paper: s.getPropertyValue('--mira-bg').trim() || '#000000' }; };
const font = (ctx, c) => { ctx.font = `700 ${Math.max(5, c - 3)}px ui-monospace, "SF Mono", Menlo, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; };

/* one cell : k = 1 a tile with a character on it, k = 0 a light character only (the frayed edge of a bird) */
function paint(ctx, x, y, c, v, k, tick, ink, paper, mul = 1) {
  const px = x * c, py = y * c, flick = hash(x, y, tick) > 0.93 ? tick : 0;
  const grain = hash(x, y, 11 + flick), pick = hash(x, y, 23 + flick);
  const glyph = (ch) => ctx.fillText(ch, px + c / 2, py + c / 2 + 0.5);
  if (!k) { ctx.globalAlpha = mul * (0.25 + 0.6 * v); ctx.fillStyle = ink; glyph(grain > 0.8 ? 'o' : EDGE[Math.floor(pick * EDGE.length)]); return; }
  const shade = (pick > 0.84 ? 1 : pick < 0.05 ? 0.2 : 0.42 + 0.52 * grain) * (0.45 + 0.55 * v);
  ctx.globalAlpha = mul * shade; ctx.fillStyle = ink; ctx.fillRect(px + 1, py + 1, c - 1, c - 1);
  if (c < 8) return;
  ctx.globalAlpha = mul * 0.9; ctx.fillStyle = shade > 0.5 ? paper : ink;
  glyph(FULL[Math.floor(pick * 997) % FULL.length]);
}

/* a drawing is a list of cells { x, y, k, v } */
function S() {
  const out = [];
  const api = {
    out,
    tile: (x, y, v = 1) => out.push({ x, y, k: 1, v }),
    edge: (x, y, v = 1) => out.push({ x, y, k: 0, v }),
    rect(x, y, w, h, v = 1) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) api.tile(x + i, y + j, v); },
    frame(x, y, w, h, v = 1, k = 1) {
      const add = k ? api.tile : api.edge;
      for (let i = 0; i < w; i++) { add(x + i, y, v); if (h > 1) add(x + i, y + h - 1, v); }
      for (let j = 1; j < h - 1; j++) { add(x, y + j, v); add(x + w - 1, y + j, v); }
    },
    // straight segments through the given points ; returns the cells, in order
    line(pts, v = 0.8, k = 0) {
      const cells = [];
      for (let s = 0; s < pts.length - 1; s++) {
        const [x0, y0] = pts[s], [x1, y1] = pts[s + 1], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let i = s ? 1 : 0; i <= n; i++) cells.push([x0 + Math.sign(x1 - x0) * i, y0 + Math.sign(y1 - y0) * i]);
      }
      for (const [x, y] of cells) (k ? api.tile : api.edge)(x, y, v);
      return cells;
    },
  };
  return api;
}
// a packet running along a line, like a request going through
const packet = (s, cells, t, speed, off) => { const at = Math.floor((t * speed + off) % (cells.length + 5)); if (at < cells.length) s.tile(cells[at][0], cells[at][1], 1); };

/* ---------- the three scenes of the step panels (40 x 30 cells) */
const SW = 40, SH = 30;
const SCENES = {
  map(t) {
    const s = S();
    // two apps on top, the api in the middle (selected, so filled), the data below
    const blocks = [[1, 1, 12, 7], [27, 1, 12, 7], [14, 12, 12, 7, true], [1, 22, 12, 7], [27, 22, 12, 7]];
    for (const [x, y, w, h, sel] of blocks) {
      if (sel) { s.rect(x, y, w, h, 1); continue; }
      s.frame(x, y, w, h, 0.62); s.rect(x + 2, y + 2, w - 6, 1, 0.9); s.line([[x + 2, y + 4], [x + w - 4, y + 4]], 0.7);
    }
    const links = [[[7, 8], [7, 15], [13, 15]], [[33, 8], [33, 15], [26, 15]], [[17, 19], [17, 20], [7, 20], [7, 21]], [[22, 19], [22, 20], [33, 20], [33, 21]]];
    links.forEach((pts, i) => packet(s, s.line(pts, 0.7), t, 7, i * 5));
    return s.out;
  },
  agents(t) {
    const s = S();
    s.frame(0, 0, 40, 30, 0.5);
    s.rect(2, 1, 9, 2, 0.95); s.frame(12, 1, 7, 2, 0.45, 0); // two tabs, the first one open
    s.line([[1, 3], [38, 3]], 0.45, 1);
    s.line([[20, 4], [20, 28]], 0.45, 1);
    const pane = (x0, width, seed, speed) => {
      const lens = Array.from({ length: 9 }, (_, i) => 3 + Math.floor(hash(i, seed) * (width - 3)));
      const total = lens.reduce((a, b) => a + b, 0), c = (t * speed + seed * 7) % (total + 24);
      let done = 0;
      lens.forEach((len, i) => {
        const you = hash(i, seed + 1) > 0.62; // your lines are bright, the agent's are dimmer
        for (let k = 0; k < len; k++) s.tile(x0 + k, 5 + i * 2, done + k < c ? (you ? 1 : 0.55) : 0);
        done += len;
      });
      s.frame(x0 - 1, 24, width + 2, 4, 0.5, 0); // its message box
      s.tile(x0 + 1, 25, (t * 1.6) % 1 < 0.5 ? 1 : 0); // and the cursor in it
    };
    pane(2, 17, 3, 16); pane(22, 15, 5, 11);
    return s.out;
  },
  tasks(t) {
    const s = S(), X = [1, 14, 27];
    s.line([[13, 0], [13, 29]], 0.3); s.line([[26, 0], [26, 29]], 0.3);
    X.forEach((x, i) => {
      s.rect(x, 1, 5 - i, 1, 0.9); s.edge(x + 7, 1, 0.6);
      for (const y of [4, 10]) { s.frame(x, y, 12, 5, 0.6); s.rect(x + 2, y + 2, 6, 1, 0.8); }
    });
    // one card goes across the board : to do, in progress, done
    const cyc = t % 7.5;
    const x = X[0] + (X[1] - X[0]) * ease(clamp((cyc - 1.8) / 0.8)) + (X[2] - X[1]) * ease(clamp((cyc - 4.6) / 0.8));
    const fade = clamp(cyc / 0.5) * clamp((7.5 - cyc) / 0.5), done = cyc > 5.6, mx = Math.round(x);
    for (let j = 0; j < 5; j++) for (let i = 0; i < 12; i++) {
      const rim = !i || !j || i === 11 || j === 4;
      s.tile(mx + i, 16 + j, fade * (done ? (rim ? 0.75 : j === 2 && i >= 2 && i < 8 ? 0.9 : 0) : 1));
    }
    return s.out;
  },
};

/* ---------- icons (16 x 16 cells), drawn like the pixel pictograms of a tile font */
const ICONS = {
  map(t) {
    const s = S(), on = Math.floor(t / 1.8) % 3;
    [[1, 1, 5, 5], [10, 1, 5, 5], [5, 10, 6, 5]].forEach(([x, y, w, h], i) => (i === on ? s.rect(x, y, w, h, 1) : s.frame(x, y, w, h, 0.7)));
    [s.line([[6, 3], [9, 3]], 0.75), s.line([[3, 6], [3, 12], [4, 12]], 0.75), s.line([[12, 6], [12, 12], [11, 12]], 0.75)].forEach((c, i) => packet(s, c, t, 5, i * 2.3));
    s.tile(15, 13, 0.25); s.tile(14, 15, 0.18); s.edge(0, 14, 0.5); s.edge(15, 8, 0.4); s.edge(8, 0, 0.4);
    return s.out;
  },
  agents(t) {
    const s = S(), on = [0, 1, 3, 2][Math.floor(t / 1.4) % 4];
    [[0, 0], [9, 0], [0, 9], [9, 9]].forEach(([x, y], i) => {
      if (i === on) s.rect(x, y, 7, 7, 1);
      else { s.frame(x, y, 7, 7, 0.6); s.line([[x + 2, y + 3], [x + 4, y + 3]], 0.7); }
    });
    s.edge(7, 15, 0.4); s.edge(15, 7, 0.4);
    return s.out;
  },
  tasks(t) {
    const s = S(), cells = [];
    for (let i = 0; i <= 4; i++) cells.push([1 + i, 9 + i, i / 14]);
    for (let i = 0; i <= 9; i++) cells.push([5 + i, 13 - i, (4 + i) / 14]);
    cells.push([15, 3, 1]);
    const glint = (t * 0.45) % 1.6;
    for (const [x, y, u] of cells) { const v = Math.min(1, 0.45 + 0.5 * u + (Math.abs(u - glint) < 0.09 ? 0.4 : 0)); s.tile(x, y, v); s.tile(x, y + 1, v * 0.85); }
    // the trail of a quick stroke
    s.tile(0, 13, 0.2); s.tile(1, 15, 0.16); s.edge(0, 11, 0.5); s.edge(2, 15, 0.45); s.edge(3, 14, 0.3); s.edge(13, 8, 0.3);
    return s.out;
  },
  limits(t) {
    const s = S();
    [0.55, 0.85, 0.3].forEach((base, i) => {
      const y = 2 + i * 5, fill = Math.round(14 * clamp(base + Math.sin(t * 0.7 + i * 2) * 0.12));
      s.line([[1, y + 2], [14, y + 2]], 0.4);
      for (let x = 1; x <= 14; x++) if (x <= fill) { s.tile(x, y, x > 11 ? 1 : 0.7); s.tile(x, y + 1, x > 11 ? 0.9 : 0.6); }
    });
    return s.out;
  },
  download(t) {
    const s = S(), shaft = s.line([[7, 0], [7, 9]], 0.8, 1); s.line([[8, 0], [8, 9]], 0.8, 1);
    [[7, 3, 12], [8, 4, 11], [9, 5, 10], [10, 6, 9], [11, 7, 8]].forEach(([y, a, b]) => { for (let x = a; x <= b; x++) s.tile(x, y, 1); });
    s.line([[1, 10], [1, 14], [14, 14], [14, 10]], 0.7, 1);
    packet(s, shaft, t, 6, 0);
    s.edge(0, 15, 0.4); s.edge(15, 15, 0.4);
    return s.out;
  },
  folder(t) {
    const s = S();
    s.rect(1, 2, 6, 2, 0.8); s.frame(1, 4, 14, 10, 0.75);
    for (let i = 0; i < 3; i++) { const len = 3 + Math.floor(((Math.sin(t * 1.3 + i * 1.7) + 1) / 2) * 7); for (let x = 3; x < 3 + len; x++) s.tile(x, 6 + i * 2, 0.6); }
    s.edge(15, 15, 0.4); s.edge(0, 15, 0.3);
    return s.out;
  },
  play(t) {
    const s = S(), pulse = (t * 0.6) % 1;
    for (let y = 1; y <= 14; y++) { const half = 7.5 - Math.abs(y - 7.5), len = Math.round(half * 1.65); for (let x = 3; x < 3 + len; x++) s.tile(x, y, Math.min(1, 0.5 + 0.5 * ((x - 3) / 12) + (Math.abs((x - 3) / 12 - pulse) < 0.08 ? 0.4 : 0))); }
    s.edge(0, 15, 0.4); s.edge(15, 0, 0.4);
    return s.out;
  },
  shield(t) {
    const s = S(), rows = [[1, 2, 13], [2, 2, 13], [3, 2, 13], [4, 2, 13], [5, 2, 13], [6, 2, 13], [7, 2, 13], [8, 2, 13], [9, 3, 12], [10, 4, 11], [11, 5, 10], [12, 6, 9], [13, 7, 8]];
    for (const [y, a, b] of rows) { s.tile(a, y, 0.8); s.tile(b, y, 0.8); if (y === 1) for (let x = a + 1; x < b; x++) s.tile(x, y, 0.8); else for (let x = a + 1; x < b; x++) s.edge(x, y, 0.25); }
    const on = (t % 2.4) < 1.8 ? 1 : 0.55;
    s.rect(7, 4, 2, 3, on); s.rect(7, 7, 2, 2, on * 0.8);
    return s.out;
  },
};

/* draws the cells of a drawing ; while age is short the cells arrive in a wave from the top left */
function render(ctx, cells, c, ox, oy, tick, ink, paper, age, mul = 1) {
  const best = new Map();
  for (const q of cells) {
    if (q.v <= 0.02) continue;
    const x = q.x + ox, y = q.y + oy, at = (q.x + q.y) * 0.03;
    if (age < at) continue;
    const k = age < at + 0.14 ? 0 : q.k, key = y * 4096 + x, o = best.get(key);
    if (!o || k > o.k || (k === o.k && q.v > o.v)) best.set(key, { x, y, v: q.v, k });
  }
  for (const q of best.values()) paint(ctx, q.x, q.y, c, q.v, q.k, tick, ink, paper, mul);
  ctx.globalAlpha = 1;
}

/* runs draw(now) about 30 times a second, only while the canvas is on screen */
function animate(cv, draw, fps = 30) {
  let raf = 0, last = 0, visible = false, first = null;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && first == null) first = performance.now() / 1000; });
  io.observe(cv);
  const loop = (now) => { raf = requestAnimationFrame(loop); if (!visible || document.hidden || now - last < 1000 / fps) return; last = now; draw(now / 1000, now / 1000 - first); };
  if (still) { const once = () => draw(4, 99); new ResizeObserver(once).observe(cv); return; }
  raf = requestAnimationFrame(loop);
}
const fitCanvas = (cv, ctx) => { const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1; cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); ctx.setTransform(d, 0, 0, d, 0, 0); return r; };

/** a scene of the step panels, centred in its canvas ; the panel gets --cell so its grid lines match the tiles */
export function mountScene(cv, name) {
  const ctx = cv.getContext('2d'), make = SCENES[name]; if (!make) return;
  let { ink, paper } = inks(), w = 0, h = 0, c = 12, ox = 0, oy = 0;
  const size = () => {
    ({ width: w, height: h } = fitCanvas(cv, ctx));
    c = Math.max(5, Math.min(12, Math.floor(Math.min(w / (SW + 2), (h - 36) / (SH + 1)))));
    cv.parentElement.style.setProperty('--cell', c + 'px');
    ox = Math.floor((Math.ceil(w / c) - SW) / 2); oy = Math.max(3, Math.floor((Math.ceil(h / c) - SH) / 2) + 1);
  };
  new ResizeObserver(size).observe(cv); size();
  animate(cv, (t, age) => { ctx.clearRect(0, 0, w, h); font(ctx, c); render(ctx, make(t), c, ox, oy, still ? 0 : Math.floor(t * 1.5), ink, paper, age); });
  addEventListener('mira-theme', () => ({ ink, paper } = inks()));
}

/** an icon, 16 cells wide ; cell is the size of a cell in px */
export function mountIcon(cv, name, { cell = 12 } = {}) {
  const ctx = cv.getContext('2d'), make = ICONS[name]; if (!make) return;
  let { ink, paper } = inks();
  const n = 16, size = n * cell;
  cv.style.width = cv.style.height = size + 'px';
  const d = devicePixelRatio || 1; cv.width = cv.height = Math.round(size * d); ctx.setTransform(d, 0, 0, d, 0, 0);
  animate(cv, (t, age) => { ctx.clearRect(0, 0, size, size); font(ctx, cell); render(ctx, make(t), cell, 0, 0, still ? 0 : Math.floor(t * 1.5), ink, paper, age); }, 25);
  addEventListener('mira-theme', () => ({ ink, paper } = inks()));
}

/** a quiet round field of dim tiles, with a ring that slowly goes out from the centre (in place of a glow) */
export function mountField(cv, { cell = 12, mul = 0.32, hole = 0 } = {}) {
  const ctx = cv.getContext('2d');
  let { ink, paper } = inks(), w = 0, h = 0;
  new ResizeObserver(() => ({ width: w, height: h } = fitCanvas(cv, ctx))).observe(cv);
  animate(cv, (t) => {
    ctx.clearRect(0, 0, w, h); font(ctx, cell);
    const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell), cx = cols / 2, cy = rows / 2, R = Math.min(cols, rows) * 0.52;
    const ring = still ? -1 : (t * 0.11) % 1.35, tick = still ? 0 : Math.floor(t * 1.2);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const dd = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.05) / R; if (dd > 1 || dd < hole) continue;
      const dens = Math.pow(1 - dd, 1.6), near = Math.exp(-((dd - ring) ** 2) / 0.003);
      if (hash(x, y, 1) > dens * 0.3 + near * 0.3) continue;
      paint(ctx, x, y, cell, Math.min(1, 0.15 + dens * 0.5 + near * 0.6), hash(x, y, 2) > 0.3 ? 1 : 0, tick, ink, paper, mul * (0.5 + dens + near));
    }
    ctx.globalAlpha = 1;
  }, 20);
}

/** an image shown as a halftone of tiles ; reveal(true) clears it into the real image, and the pointer clears it locally */
export function mountDither(cv, src, { fit = 'cover', cell = 7 } = {}) {
  const ctx = cv.getContext('2d'), img = new Image();
  let { ink, paper } = inks(), w = 0, h = 0, cols = 0, rows = 0, lum = null, box = null, r = 0, target = 0, since = 0, mx = -1e4, my = -1e4, dirty = true, crispOnly = false;
  const layout = () => {
    ({ width: w, height: h } = fitCanvas(cv, ctx)); dirty = true;
    if (!img.naturalWidth || !w) return;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const s = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min((w * 0.84) / iw, (h * 0.84) / ih);
    box = fit === 'cover' ? { x: 0, y: 0, w: iw * s, h: ih * s } : { x: (w - iw * s) / 2, y: (h - ih * s) / 2, w: iw * s, h: ih * s };
    cols = Math.ceil(w / cell); rows = Math.ceil(h / cell);
    try {
      const off = document.createElement('canvas'); off.width = cols; off.height = rows;
      const o = off.getContext('2d', { willReadFrequently: true }); o.fillStyle = '#000'; o.fillRect(0, 0, cols, rows);
      o.drawImage(img, box.x / cell, box.y / cell, box.w / cell, box.h / cell);
      const px = o.getImageData(0, 0, cols, rows).data; lum = new Float32Array(cols * rows);
      // screenshots of a dark app are mostly black : lift the darks so the halftone still shows the layout
      for (let i = 0; i < cols * rows; i++) lum[i] = Math.sqrt((0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255);
    } catch { crispOnly = true; } // a page opened from the disk cannot read its pixels : show the image as it is
  };
  img.onload = layout; img.src = src;
  new ResizeObserver(layout).observe(cv);
  cv.addEventListener('pointermove', (e) => { const b = cv.getBoundingClientRect(); mx = e.clientX - b.left; my = e.clientY - b.top; dirty = true; });
  cv.addEventListener('pointerleave', () => { mx = my = -1e4; dirty = true; });
  const draw = (t) => {
    const want = target && t - since > 0.2 ? 1 : target ? r : 0;
    if (Math.abs(want - r) > 0.002) { r += (want - r) * (still ? 1 : 0.07); dirty = true; } else r = want;
    if (!dirty || !box) return; dirty = false;
    ctx.globalAlpha = 1; ctx.fillStyle = paper; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, box.x, box.y, box.w, box.h);
    if (crispOnly || !lum) return;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const px = x * cell, py = y * cell, th = hash(x, y, 5) * 0.75 + (y / rows) * 0.25;
      const dl = Math.hypot(px + cell / 2 - mx, py + cell / 2 - my), lens = dl < 110 ? (1 - dl / 110) * 1.3 : 0;
      if (r + lens > th) continue;
      ctx.globalAlpha = 1; ctx.fillStyle = paper; ctx.fillRect(px, py, cell, cell);
      const L = lum[y * cols + x]; if (L < 0.05) continue;
      const s = Math.max(1, Math.round((cell - 1) * Math.sqrt(Math.min(1, L * 1.2))));
      ctx.globalAlpha = 0.35 + 0.6 * L; ctx.fillStyle = ink; ctx.fillRect(px + (cell - s) / 2, py + (cell - s) / 2, s, s);
    }
    ctx.globalAlpha = 1;
  };
  animate(cv, (t) => draw(t), 30);
  return { reveal(on) { if (!!on !== !!target) { target = on ? 1 : 0; since = performance.now() / 1000; dirty = true; } } };
}
