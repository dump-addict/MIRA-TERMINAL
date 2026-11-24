/* Motion of the home page : words that come out of a blur, sections driven by the scroll, counters. */
import { mountBackdrop } from './backdrop.js';
import { mountScene, mountIcon, mountField, mountDither } from './tiles.js';

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (u) => 1 - Math.pow(1 - u, 3);
const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const head = () => (innerWidth > 860 ? 72 : 64);
const desk = () => innerWidth > 860;

// the camera of the opening's birds, moved by the scroll (see the hero below)
const cam = { x: 0.5, y: 0.2, z: 1 };
for (const id of ['sky', 'sky2', 'sky3']) { const c = document.getElementById(id); if (c) mountBackdrop(c, id === 'sky' ? { view: () => cam } : {}); }

/* ---------- words : each word of a title in its own span */
function split(el) {
  let i = 0;
  const walk = (node) => {
    for (const n of [...node.childNodes]) {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const p of n.textContent.split(/(\s+)/)) {
          if (!p) continue;
          if (/^\s+$/.test(p)) { frag.append(p); continue; }
          const s = document.createElement('span'); s.className = 'w'; s.style.setProperty('--i', i++); s.textContent = p; frag.append(s);
        }
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
    }
  };
  walk(el);
  return [...el.querySelectorAll('.w')];
}
// every title comes out of a blur word by word, every paragraph rises in : marked here so the markup stays plain
document.querySelectorAll('section h2, .cell h3').forEach((h) => { if (!h.closest('.astep')) h.setAttribute('data-words', ''); });
document.querySelectorAll('.shead .txt, .cell > p, .cell > .num, #faq details, .end p').forEach((el, i) => { if (!el.classList.contains('reveal')) { el.classList.add('reveal'); el.style.setProperty('--d', (el.matches('.cell > p') ? 120 : 0) + 'ms'); } });
document.querySelectorAll('[data-words], .read').forEach(split);
// the steps of the strengths : their words come in each time the step comes to the front
document.querySelectorAll('.astep h3, .astep p').forEach(split);

const seen = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px' });
document.querySelectorAll('[data-words], .reveal').forEach((el) => seen.observe(el));

/* ---------- smooth scroll : the wheel sets a target, the page glides to it ; anything else that scrolls (keys, links, the bar) is followed */
if (!still && matchMedia('(pointer: fine)').matches) {
  let target = scrollY, cur = scrollY, gliding = false, last = 0;
  const max = () => document.documentElement.scrollHeight - innerHeight;
  // a wheel over something that scrolls by itself is left to it
  const ownScroll = (el) => { for (; el instanceof Element && el !== document.body; el = el.parentElement) { const o = getComputedStyle(el).overflowY; if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight) return true; } return false; };
  const glide = (now) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
    cur += (target - cur) * (1 - Math.pow(0.9, dt * 60));
    if (Math.abs(target - cur) < 0.4) cur = target;
    scrollTo({ top: cur, behavior: 'instant' });
    if (cur !== target) requestAnimationFrame(glide); else { gliding = false; last = 0; }
  };
  addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.defaultPrevented || ownScroll(e.target)) return;
    e.preventDefault();
    if (!gliding) { cur = target = scrollY; }
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    target = clamp(target + d, 0, max());
    if (!gliding) { gliding = true; requestAnimationFrame(glide); }
  }, { passive: false });
  addEventListener('scroll', () => { if (!gliding) cur = target = scrollY; }, { passive: true });
}

/* ---------- one pass per frame for everything that follows the scroll */
const jobs = [];
let queued = false;
const run = () => { queued = false; for (const f of jobs) f(); };
const ask = () => { if (!queued) { queued = true; requestAnimationFrame(run); } };
addEventListener('scroll', ask, { passive: true });
addEventListener('resize', ask);
// how far a tall section with a sticky stage has been scrolled, from 0 to 1
const travel = (el) => { const r = el.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - (innerHeight - head()))); };

/* the header takes its background once the page moves */
const bar = document.querySelector('header.top');
if (bar) jobs.push(() => bar.classList.toggle('scrolled', scrollY > 8));

/* ---------- the opening : the birds come in, then as you scroll the text goes up and out and the camera moves closer */
const hero = document.querySelector('.hero');
if (hero) {
  const copy = hero.querySelector('.col'), sky = hero.querySelector('.sky'), stage = hero.querySelector('.stage');
  requestAnimationFrame(() => hero.classList.add('on'));
  // the demo rises in slowly on load (opacity and translate) ; its tilt follows the scroll, without a transition
  if (stage && !still) stage.style.transition = 'opacity 1.4s var(--out), translate 1.6s var(--out)';
  jobs.push(() => {
    if (still) return;
    // the demo starts tilted back, like a screen seen from below, and stands up as it comes into view
    const up = easeInOut(clamp(scrollY / (innerHeight * 0.95)));
    stage.style.transform = `perspective(1600px) rotateX(${(14 * (1 - up)).toFixed(2)}deg) scale(${(0.95 + 0.05 * up).toFixed(3)})`;
    const p = clamp(scrollY / (innerHeight * 0.7)), out = ease(p);
    cam.z = 1 + 0.7 * out;
    sky.style.setProperty('--z', cam.z.toFixed(3));
    copy.style.opacity = (1 - out).toFixed(3);
    copy.style.transform = out ? `translateY(${(-50 * out).toFixed(1)}px)` : '';
    copy.style.filter = out > 0.01 ? `blur(${(8 * out).toFixed(1)}px)` : '';
  });
}

/* a paragraph that lights up word by word as it is read */
for (const p of document.querySelectorAll('.read')) {
  const ws = [...p.querySelectorAll('.w')];
  jobs.push(() => {
    const r = p.getBoundingClientRect(), u = still ? 1 : clamp((innerHeight * 0.88 - r.top) / (r.height + innerHeight * 0.3));
    const n = Math.round(u * ws.length);
    ws.forEach((w, k) => w.classList.toggle('lit', k < n));
  });
}

/* ---------- the orbit : the cards leave the centre as you scroll */
const orbit = document.querySelector('.orbit');
if (orbit) {
  const rings = orbit.querySelector('.rings'), cards = [...orbit.querySelectorAll('.ocard')], stage = orbit.querySelector('.pin');
  mountField(orbit.querySelector('canvas.field'), { hole: 0.12 });
  jobs.push(() => {
    if (!desk()) { cards.forEach((c) => { c.style.transform = ''; c.style.opacity = ''; }); return; }
    const p = travel(orbit), W = Math.min(stage.clientWidth, 1240), H = stage.clientHeight;
    rings.style.setProperty('--s', (0.62 + 0.38 * ease(clamp(p / 0.45))).toFixed(3));
    cards.forEach((c, i) => {
      const [fx, fy] = c.dataset.to.split(',').map(Number), t = still ? 1 : ease(clamp((p - 0.08 - i * 0.12) / 0.3));
      c.style.transform = `translate(calc(-50% + ${(fx * W * t).toFixed(1)}px), calc(-50% + ${(fy * H * t).toFixed(1)}px)) scale(${(0.55 + 0.45 * t).toFixed(3)})`;
      c.style.opacity = t.toFixed(3);
    });
  });
}

/* ---------- the steps : the card on the left stays, the panels on the right go by */
const arc = document.querySelector('.arc');
if (arc) {
  const slides = [...arc.querySelectorAll('.astep')], panels = [...arc.querySelectorAll('.panel')], segs = [...arc.querySelectorAll('.segs i')];
  panels.forEach((p) => { const c = p.querySelector('canvas:not(.icon)'); if (c) mountScene(c, p.dataset.scene); });
  // the example of a panel plays only while it is the one in front and on screen
  const seenPanels = new Set();
  const playPanel = (p) => { const v = p.querySelector('video'); if (!v) return; if (p.classList.contains('on') && seenPanels.has(p) && !still) v.play().catch(() => {}); else v.pause(); };
  const po = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) seenPanels.add(e.target); else seenPanels.delete(e.target); playPanel(e.target); }), { threshold: 0.3 });
  panels.forEach((p) => po.observe(p));
  let on = -1;
  jobs.push(() => {
    const sticky = arc.querySelector('.sticky').getBoundingClientRect();
    const mid = desk() ? (head() + innerHeight) / 2 : (sticky.bottom + innerHeight) / 2;
    let best = 0, bd = Infinity;
    panels.forEach((p, i) => { const r = p.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - mid); if (d < bd) { bd = d; best = i; } });
    if (best === on) return;
    on = best;
    slides.forEach((s, i) => s.classList.toggle('on', i === on));
    segs.forEach((s, i) => s.classList.toggle('on', i <= on));
    panels.forEach((p, i) => {
      p.classList.toggle('on', i === on);
      playPanel(p);
    });
  });
}

/* ---------- the dial : the ring fills as you scroll, one step per third */
const dial = document.querySelector('.dial');
if (dial) {
  const svg = dial.querySelector('svg.ring'), g = svg.querySelector('.ticks'), prog = svg.querySelector('.prog');
  const steps = [...dial.querySelectorAll('.dstep')], icons = [...dial.querySelectorAll('.dicon')];
  const N = 120, ticks = [], NS = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2, big = i % 10 === 0, r0 = big ? 224 : 240, r1 = 258, l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', (320 + Math.cos(a) * r0).toFixed(1)); l.setAttribute('y1', (320 + Math.sin(a) * r0).toFixed(1));
    l.setAttribute('x2', (320 + Math.cos(a) * r1).toFixed(1)); l.setAttribute('y2', (320 + Math.sin(a) * r1).toFixed(1));
    if (big) l.setAttribute('class', 'big');
    g.append(l); ticks.push(l);
  }
  const C = 2 * Math.PI * 290; prog.style.strokeDasharray = C.toFixed(1);
  icons.forEach((c) => mountIcon(c, c.dataset.icon, { cell: 8 }));
  mountField(dial.querySelector('canvas.field'), { hole: 0.4 });
  let on = -1, lit = -1;
  jobs.push(() => {
    const p = travel(dial);
    prog.style.strokeDashoffset = (C * (1 - p)).toFixed(1);
    const n = Math.round(p * N);
    if (n !== lit) { lit = n; ticks.forEach((t, i) => t.classList.toggle('lit', i < n)); }
    const s = Math.min(steps.length - 1, Math.floor(p * steps.length));
    if (s !== on) { on = s; steps.forEach((x, i) => x.classList.toggle('on', i === s)); icons.forEach((x, i) => x.classList.toggle('on', i === s)); }
  });
}

/* ---------- small pages : each little interface plays its part on its own, while it is on screen */
const swap = (el, text) => { if (!el || el.textContent === text) return; el.textContent = text; el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); };
const pick = (seg, i) => { seg.style.setProperty('--i', i); [...seg.querySelectorAll('span')].forEach((s, k) => s.classList.toggle('on', k === i)); };
const AGENTS = [['S', 'Claude Code', 'opus, high effort', 'work', '62% left'], ['X', 'Codex', 'gpt-5, medium', 'personal', '80% left'], ['%', 'Gemini', 'pro, fast', 'work', '45% left']];
const PERIODS = [[0.62, '3', '12', '+4', '62%'], [0.41, '5', '48', '+11', '41%'], [0.18, '6', '190', '+32', '18%']];
const LINES = ['Fix the redirect after login, then run the tests.', 'Here is the error, can you check the api route?', 'Move the card to done when the build passes.'];
const FILES = [['screenshot.png'], ['login.tsx', 'error.log'], []];
for (const box of document.querySelectorAll('.mini')) {
  let visible = false, k = 0;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.3 }).observe(box);
  const segs = [...box.querySelectorAll('.tabs')];
  segs.forEach((s) => s.style.setProperty('--n', s.querySelectorAll('span').length));
  const kind = box.dataset.mini;
  if (kind === 'talk') {
    // a message typed letter by letter, its files dropped above it, sent, then the next one
    const tt = box.querySelector('.tt'), att = box.querySelector('.att');
    let line = 0, ch = 0, wait = 0;
    const show = (i) => { att.innerHTML = ''; for (const f of FILES[i]) { const s = document.createElement('span'); s.className = 'tag swap'; s.textContent = f; att.append(s); } };
    show(0);
    if (still) tt.textContent = LINES[0];
    else setInterval(() => {
      if (!visible) return;
      if (wait > 0) { wait--; if (!wait) { line = (line + 1) % LINES.length; ch = 0; tt.textContent = ''; show(line); } return; }
      ch++; tt.textContent = LINES[line].slice(0, ch);
      if (ch >= LINES[line].length) wait = 28;
    }, 55);
    continue;
  }
  if (still) continue;
  setInterval(() => {
    if (!visible) return;
    k++;
    if (kind === 'agent') {
      const a = Math.floor(k / 2) % 3, m = k % 3, A = AGENTS[a];
      pick(segs[0], a); pick(segs[1], m);
      swap(box.querySelector('.av'), A[0]); swap(box.querySelector('.nm'), A[1]); swap(box.querySelector('.mt'), A[2]);
      swap(box.querySelector('.acc'), A[3]); swap(box.querySelector('.lim'), A[4]);
    } else if (kind === 'usage') {
      const p = k % 3, P = PERIODS[p], v2 = box.querySelector('.v2');
      pick(segs[0], p);
      box.querySelector('.meter').style.setProperty('--f', P[0]);
      swap(box.querySelector('.v1'), P[1]); swap(box.querySelector('.v3'), P[4]);
      swap(v2, P[2]);
    }
  }, 2400);
}

/* ---------- the rest of the tiles */
document.querySelectorAll('canvas.icon[data-icon]').forEach((c) => mountIcon(c, c.dataset.icon, { cell: +c.dataset.cell || 12 }));
document.querySelectorAll('canvas.halftone[data-src]').forEach((c) => mountDither(c, c.dataset.src, { fit: c.dataset.fit || 'cover', cell: 6 }));
document.querySelectorAll('canvas.field.free').forEach((c) => mountField(c));

/* ---------- how it works : a line that types its examples one after the other, numbers that count up again and again */
for (const el of document.querySelectorAll('.how .type')) {
  const lines = el.dataset.lines.split('|'); let i = 0, ch = 0, wait = 0, on = false;
  // the line starts empty : watch its box, which has a size
  new IntersectionObserver(([e]) => (on = e.isIntersecting)).observe(el.closest('.hint'));
  if (still) { el.textContent = lines[0]; continue; }
  setInterval(() => {
    if (!on) return;
    if (wait > 0) { if (--wait === 0) { i = (i + 1) % lines.length; ch = 0; } return; }
    el.textContent = lines[i].slice(0, ++ch);
    if (ch >= lines[i].length) wait = 30;
  }, 60);
}
for (const box of document.querySelectorAll('.how .hint')) {
  const nums = [...box.querySelectorAll('.count')]; if (!nums.length) continue;
  let on = false; new IntersectionObserver(([e]) => (on = e.isIntersecting)).observe(box);
  if (still) { nums.forEach((n) => (n.textContent = n.dataset.to)); continue; }
  let t0 = 0;
  const tick = (now) => { requestAnimationFrame(tick); if (!on) { t0 = 0; return; } if (!t0) t0 = now;
    const u = ((now - t0) / 1000) % 4.5, k = ease(clamp(u / 2.2));
    nums.forEach((n) => (n.textContent = Math.round(+n.dataset.to * k))); };
  requestAnimationFrame(tick);
}

/* the task card of "how it works" says its status as it crosses the board (its move is a CSS animation of 7 s) */
const pill = document.querySelector('.m-board2 .pill');
if (pill && !still) setInterval(() => {
  const a = pill.closest('.tcard').getAnimations()[0]; if (!a) return;
  const u = (a.currentTime % 7000) / 7000, t = u < 0.3 ? 'Todo' : u < 0.6 ? 'In progress' : 'Done';
  if (pill.textContent !== t) pill.textContent = t;
}, 120);
else if (pill) pill.textContent = 'Done';

/* ---------- the footer's name : "Mira" across the whole width, made of tiles like the birds, light and frayed at the edges ; the tiles part under the mouse */
const word = document.querySelector('footer canvas.word');
if (word) {
  const ctx = word.getContext('2d'), GLYPH = ['S', 'X', '%', 't', '8', '@', '#'], EDGE = ['.', ':', ';', "'", '`'];
  let cells = [], W = 0, H = 0, cell = 10, mx = -1e3, my = -1e3, on = false, ink = '#0a0a0a', paper = '#ffffff';
  const h = (x, y, s) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
  const build = () => {
    const r = word.getBoundingClientRect(), d = devicePixelRatio || 1; W = r.width; H = r.height; if (!W) return;
    word.width = Math.round(W * d); word.height = Math.round(H * d); ctx.setTransform(d, 0, 0, d, 0, 0);
    const css = getComputedStyle(document.documentElement); ink = css.getPropertyValue('--mira-text').trim() || ink; paper = css.getPropertyValue('--mira-bg').trim() || paper;
    cell = Math.max(8, Math.round(W / 150));
    const off = document.createElement('canvas'); off.width = Math.ceil(W / cell); off.height = Math.ceil(H / cell); const o = off.getContext('2d');
    let fs = 100; o.font = `500 ${fs}px Geist`; fs *= (off.width * 0.97) / o.measureText('Mira').width; o.font = `500 ${fs}px Geist`; o.letterSpacing = `${-fs * 0.05}px`;
    // the canvas is as tall as the letters plus a cell of air on top, minus a tenth : the foot runs off the page, the top never does
    const asc = o.measureText('Mira').actualBoundingBoxAscent, rows = Math.ceil(asc * 0.9) + 2, want = rows * cell + 'px';
    if (word.style.height !== want) { word.style.height = want; return build(); }
    const base = 2 + asc;
    // supersampled : each cell knows how much of it the letter covers, so the edges fray like the birds'
    const S = 4, big = document.createElement('canvas'); big.width = off.width * S; big.height = off.height * S; const g = big.getContext('2d');
    g.scale(S, S); g.font = o.font; g.letterSpacing = o.letterSpacing; g.fillText('Mira', (off.width - o.measureText('Mira').width) / 2, base);
    const px = g.getImageData(0, 0, big.width, big.height).data; cells = [];
    for (let y = 0; y < off.height; y++) for (let x = 0; x < off.width; x++) {
      let a = 0; for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) a += px[((y * S + j) * big.width + x * S + i) * 4 + 3];
      a /= S * S * 255; if (a > 0.08) cells.push({ x, y, v: a });
    }
  };
  word.addEventListener('mousemove', (e) => { const r = word.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; });
  word.addEventListener('mouseleave', () => { mx = my = -1e3; });
  const draw = (now) => {
    ctx.clearRect(0, 0, W, H); ctx.font = `700 ${cell - 3}px ui-monospace, "SF Mono", Menlo, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tick = Math.floor(now / 666);
    for (const c of cells) {
      let X = c.x * cell, Y = c.y * cell; const dx = X - mx, dy = Y - my, d = Math.hypot(dx, dy);
      if (d < 110 && d > 0) { const k = (1 - d / 110) * 22; X += (dx / d) * k; Y += (dy / d) * k; }
      const flick = h(c.x, c.y, 1) > 0.94 ? tick : 0, grain = h(c.x, c.y, 11 + flick), pick = h(c.x, c.y, 23 + flick);
      if (c.v < 0.55) { ctx.globalAlpha = 0.22 + c.v * 0.5; ctx.fillStyle = ink; ctx.fillText(grain > 0.8 ? 'o' : EDGE[Math.floor(pick * EDGE.length)], X + cell / 2, Y + cell / 2 + 0.5); continue; }
      // shades like the far birds : light tiles, a few darker ones
      const shade = pick > 0.9 ? 0.55 : pick < 0.06 ? 0.12 : 0.18 + 0.3 * grain;
      ctx.globalAlpha = shade; ctx.fillStyle = ink; ctx.fillRect(X + 1, Y + 1, cell - 1, cell - 1);
      ctx.globalAlpha = shade > 0.4 ? 0.8 : 0.35; ctx.fillStyle = shade > 0.4 ? paper : ink;
      ctx.fillText(GLYPH[Math.floor(pick * 997) % GLYPH.length], X + cell / 2, Y + cell / 2 + 0.5);
    }
    ctx.globalAlpha = 1;
  };
  let last = 0;
  const loop = (now) => { requestAnimationFrame(loop); if (!on || now - last < 33) return; last = now; draw(now); };
  new IntersectionObserver(([e]) => (on = e.isIntersecting)).observe(word);
  new ResizeObserver(() => { build(); draw(0); }).observe(word);
  document.fonts.ready.then(() => { build(); draw(0); if (!still) requestAnimationFrame(loop); });
}

/* ---------- numbers that count when they come into view */
for (const n of document.querySelectorAll('[data-count]')) {
  const end = +n.dataset.count, from = +(n.dataset.from || 0), suf = n.dataset.suffix || '';
  const go = () => {
    if (still) { n.textContent = end + suf; return; }
    const t0 = performance.now();
    const f = (now) => { const u = clamp((now - t0) / 1500); n.textContent = Math.round(from + (end - from) * ease(u)) + suf; if (u < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  };
  new IntersectionObserver(([e], o) => { if (e.isIntersecting) { go(); o.disconnect(); } }, { threshold: 0.6 }).observe(n);
}

run();
