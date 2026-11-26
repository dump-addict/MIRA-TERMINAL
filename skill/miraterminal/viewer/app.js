/* miraterminal: core of the page (data, block folding, flows, panels). Renderers: diagram.js (2D), scene3d.js (3D). */
import { icon, kindIcon } from "./icons.js";
import * as Diagram from "./diagram.js";

const TOKEN = document.body.dataset.token;
// map shown inside the app (iframe) or ?embedded=1: a plain map tab, with no panels or chat
const EMBED = window.parent !== window || new URLSearchParams(location.search).get("embedded") === "1";
if (EMBED) document.body.classList.add("embedded");
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// group colours: small identity swatches, read from tokens.css (--mira-group-1 to 8), never blue
const GROUP_FALLBACK = ["#e5e5e5", "#c4b5fd", "#f9a8d4", "#fdba74", "#f0abfc", "#a3a3a3", "#fde68a", "#fca5a5"];
const RANK = { unknown: 0, pending: 0, off: 1, ok: 2, warn: 3, fail: 4 };
// a status as a coloured word: the design has no dots as indicators
export const stWord = (st) => (st && st !== "unknown" ? `<span class="stw ${st}">${STATUS_TXT[st]}</span>` : "");
export const STATUS_TXT = { ok: "Available", warn: "Degraded", fail: "Down", off: "Off", unknown: "Unknown" };  // terms used by status pages (Atlassian Statuspage)
const LIFE = { live: "Live", wip: "In progress", planned: "Planned", broken: "Broken", deprecated: "Deprecated" };
// status colours: read from tokens.css (--mira-ok, --mira-warn, --mira-bad), fallback values otherwise
const tok = (v, d) => { try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || d; } catch (e) { return d; } };
export const COL = { ok: tok("--mira-ok", "#45dd8a"), warn: tok("--mira-warn", "#f5a524"), fail: tok("--mira-bad", "#f26b6b"), off: tok("--mira-off", "#5c5c5c"), unknown: tok("--mira-edge", "#4a4a4a"), text: tok("--mira-text", "#ededed"), bg: tok("--mira-bg", "#000000") };
const PALETTE = GROUP_FALLBACK.map((d, i) => tok(`--mira-group-${i + 1}`, d));
// a colour written in map.json (a cloned repository controls it) : #rgb to #rrggbbaa or rgb()/rgba() only, else the palette
const safeColor = (c) => (typeof c === "string" && /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\))$/i.test(c.trim()) ? c.trim() : null);

function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

const S = {
  map: null, mtime: 0, byId: {}, kids: {}, groups: [], gcolor: {}, res: {}, saved: {}, saved3: {}, auto: {},
  expanded: new Set(JSON.parse(store("pm.exp") || "[]")), depth: EMBED ? "essential" : store("pm.depth") || "essential",
  mode: EMBED ? "2d" : store("pm.mode") || "2d", sel: null, hover: null, flow: null, flowStep: -1, search: "", act: {},
  // the block one has gone into (2D), and whether the import links are hidden
  room: null, mainSaved: null, noImports: store("pm.noimp") === "1",
};
let R = null;            // active renderer
let Scene = null;        // 3D module loaded on demand

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { "X-Token": TOKEN, "Content-Type": "application/json", ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2500); }
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  }
}
const worst = (list) => list.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "unknown");

// ------------------------------------------------------------ model
const linkId = (l) => l.id || `${l.source}--${l.target}`;
const elStatus = (key) => (S.res[key] && S.res[key].status) || "unknown";
const byKey = (key) => {
  const i = key.indexOf(":"), k = key.slice(0, i), id = key.slice(i + 1);
  return k === "node" ? S.byId[id] : S.map.links.find((l) => linkId(l) === id);
};
const labelOf = (el) => el.__kind === "link" ? el.label || `${S.byId[el.source]?.label} → ${S.byId[el.target]?.label}` : el.label || el.id;
const isExpanded = (id) => S.depth === "all" || S.expanded.has(id);
const descendants = (id) => (S.kids[id] || []).flatMap((c) => [c, ...descendants(c)]);
function rep(id) {
  if (roomOn()) return roomRep(id);
  const chain = [];
  for (let n = S.byId[id]; n; n = n.parent ? S.byId[n.parent] : null) chain.unshift(n.id);
  for (const a of chain) { if (a !== id && !isExpanded(a)) return a; }
  return id;
}
function nodeStatus(id) {
  const own = elStatus(`node:${id}`);
  if (!(S.kids[id] || []).length || isExpanded(id)) return own;
  return worst([own, ...descendants(id).map((d) => elStatus(`node:${d}`))]);
}
const edgeStatus = (e) => worst(e.members.map((l) => elStatus(`link:${linkId(l)}`)));

/* Inside a block (2D): its components fill the page, and what it talks to stands at the edges as small cards,
   "Used by" on the left and "Uses" on the right (as Floorplan does), instead of cables across the whole map.
   Double-click a block to go in, Escape or the bar at the top left to come back. */
const roomOn = () => !!S.room && S.mode === "2d";
const inRoom = (id) => { for (let n = S.byId[id]?.parent ? S.byId[S.byId[id].parent] : null; n; n = n.parent ? S.byId[n.parent] : null) if (n.id === S.room) return true; return false; };
function roomRep(id) {
  if (id === S.room) return null;   // a link of the block as a whole says nothing about its parts
  if (inRoom(id)) {
    const chain = [];
    for (let n = S.byId[id]; n && n.id !== S.room; n = n.parent ? S.byId[n.parent] : null) chain.unshift(n.id);
    for (const a of chain) { if (a !== id && !isExpanded(a)) return a; }
    return id;
  }
  // outside: the largest block that does not hold the room (a neighbour's whole card), an outside system under its own name
  const holds = new Set(); for (let n = S.byId[S.room]; n; n = n.parent ? S.byId[n.parent] : null) holds.add(n.id);
  let n = S.byId[id];
  while (n && n.parent && S.byId[n.parent] && !holds.has(n.parent) && n.parent !== OUTSIDE) n = S.byId[n.parent];
  return n ? n.id : id;
}
const shownLink = (l) => !(S.noImports && l.label === "imports");
function roomView() {
  const nodes = [];
  const walk = (n, depth) => { nodes.push({ n, depth }); if (isExpanded(n.id)) (S.kids[n.id] || []).forEach((c) => walk(S.byId[c], depth + 1)); };
  (S.kids[S.room] || []).forEach((c) => walk(S.byId[c], 0));
  const inside = new Set(nodes.map(({ n }) => n.id));
  const pills = new Map(), weight = {}, edges = new Map();
  S.map.links.forEach((l) => {
    if (!shownLink(l)) return;
    const a = rep(l.source), b = rep(l.target);
    if (!a || !b || a === b || (!inside.has(a) && !inside.has(b))) return;
    // what uses the block stands on the left, what it uses on the right
    if (!inside.has(a) && !pills.has(a)) pills.set(a, "by");
    if (!inside.has(b)) pills.set(b, "uses");
    [a, b].forEach((x) => { if (!inside.has(x)) weight[x] = (weight[x] || 0) + 1; });
    const k = a < b ? `${a}>${b}` : `${b}>${a}`;
    // a cable to a neighbour at the edge is drawn only when one of its two ends is hovered or selected:
    // the column it stands in already says the block uses it or is used by it
    if (!edges.has(k)) edges.set(k, { key: k, source: a, target: b, members: [], away: !inside.has(a) || !inside.has(b) });
    edges.get(k).members.push(l);
  });
  const side = (s) => [...pills.keys()].filter((id) => pills.get(id) === s).sort((x, y) => weight[y] - weight[x] || String(S.byId[x].label).localeCompare(S.byId[y].label));
  const by = side("by"), uses = side("uses");
  by.concat(uses).forEach((id) => nodes.push({ n: S.byId[id], depth: 0 }));
  // columns: Used by, the block's own parts (6 cards a column at most), Uses
  const room = S.byId[S.room], grey = PALETTE[5], groups = [], gof = {};
  let col = 0;
  if (by.length) { groups.push({ id: "room-by", label: "Used by", color: grey, col: col++, row: 0 }); by.forEach((id) => (gof[id] = "room-by")); }
  const own = nodes.filter(({ n }) => inside.has(n.id));
  for (let i = 0; i < Math.max(1, Math.ceil(own.length / 6)); i++) {
    const g = `room-in-${i}`;
    groups.push({ id: g, label: room.label, color: S.gcolor[room.group] || grey, col: col++, row: 0 });
    own.slice(i * 6, i * 6 + 6).forEach(({ n }) => (gof[n.id] = g));
  }
  if (uses.length) { groups.push({ id: "room-uses", label: "Uses", color: grey, col: col++, row: 0 }); uses.forEach((id) => (gof[id] = "room-uses")); }
  return { nodes, edges: [...edges.values()], groups, gof, pills };
}
const groupsNow = () => (roomOn() ? view().groups : S.groups);
const groupOf = (id) => (roomOn() ? view().gof[id] : S.byId[id]?.group);
const isPill = (id) => roomOn() && view().pills.has(id);
const small = (n) => n.size === "s" || isPill(n.id);

let VIEW = null;
function view() {
  if (VIEW) return VIEW;
  if (roomOn()) { VIEW = roomView(); labelEdges(VIEW.edges); return VIEW; }
  const nodes = [];
  const walk = (n, depth) => {
    nodes.push({ n, depth });
    if (isExpanded(n.id)) (S.kids[n.id] || []).forEach((c) => walk(S.byId[c], depth + 1));
  };
  S.map.nodes.filter((n) => !n.parent || !S.byId[n.parent]).forEach((n) => walk(n, 0));
  const edges = new Map();
  S.map.links.forEach((l) => {
    if (!shownLink(l)) return;
    const a = rep(l.source), b = rep(l.target);
    if (a === b) return;
    // one cable per pair of blocks, whatever the direction : it keeps the direction of the first link
    const k = a < b ? `${a}>${b}` : `${b}>${a}`;
    if (!edges.has(k)) edges.set(k, { key: k, source: a, target: b, members: [] });
    edges.get(k).members.push(l);
  });
  VIEW = { nodes, edges: [...edges.values()] };
  labelEdges(VIEW.edges);
  return VIEW;
}
function labelEdges(list) {
  list.forEach((e) => {
    e.label = e.members.length === 1 ? e.members[0].label || "" : `${e.members.length} links`;
    e.selKey = `link:${linkId(e.members[0])}`;
  });
}
function invalidate() { VIEW = null; }

/* The outside systems (services, registries, APIs: top-level blocks with no file of the project) are many in a large project.
   Drawn one by one they fill columns of their own, and every block sends a long cable across the map to each of them.
   Here they become the components of one "Outside services" block, folded like any other block: one card and a few
   cables at first, every system and its links when it is opened. Only in the page: map.json is not changed. */
const OUTSIDE = "mira-outside";
function foldOutside(m) {
  if (m.nodes.some((n) => n.id === OUTSIDE)) return;
  const hasKids = new Set(m.nodes.map((n) => n.parent).filter(Boolean));
  const out = m.nodes.filter((n) => !n.parent && n.kind !== "user" && !(n.files || []).length && !hasKids.has(n.id));
  if (out.length < 4) return;
  const groups = {};
  out.forEach((n) => { groups[n.group] = (groups[n.group] || 0) + 1; });
  const group = Object.keys(groups).sort((a, b) => groups[b] - groups[a])[0];
  m.nodes.push({ id: OUTSIDE, __kind: "node", __virtual: true, label: "Outside services", kind: "external", group, status: "live",
    summary: `The ${out.length} systems outside the code this project talks to.` });
  out.forEach((n) => { n.parent = OUTSIDE; n.group = group; });
}

function normalize(m) {
  m.nodes = m.nodes || []; m.links = m.links || []; m.flows = m.flows || [];
  m.nodes.forEach((n) => { n.__kind = "node"; n.group = n.group || "other"; });
  m.links.forEach((l) => { l.__kind = "link"; });
  foldOutside(m);
  S.byId = Object.fromEntries(m.nodes.map((n) => [n.id, n]));
  S.kids = {};
  m.nodes.forEach((n) => { if (n.parent && S.byId[n.parent]) (S.kids[n.parent] = S.kids[n.parent] || []).push(n.id); });
  // a group left without blocks (its outside systems went into the one "Outside services" block) takes no room
  const used = new Set(m.nodes.map((n) => n.group));
  const order = (m.groups || []).map((g) => g.id).filter((id) => used.has(id));
  m.nodes.forEach((n) => { if (!order.includes(n.group)) order.push(n.group); });
  S.groups = order.map((id, i) => {
    const g = (m.groups || []).find((x) => x.id === id) || {};
    return { id, label: g.label || id, color: safeColor(g.color) || PALETTE[i % PALETTE.length], col: g.col ?? i, row: g.row ?? 0 };
  });
  // columns left empty (their blocks went into another group) take no room: the others close up, in the same order
  const cols = [...new Set(S.groups.map((g) => g.col))].sort((a, b) => a - b);
  S.groups.forEach((g) => (g.col = cols.indexOf(g.col)));
  S.gcolor = Object.fromEntries(S.groups.map((g) => [g.id, g.color]));
  return m;
}

// ------------------------------------------------------------ layout
export const CARD = { w: 232, h: 136, sw: 232, sh: 40, gapY: 16, head: 46, rowGap: 120, gapMin: 96, labPad: 40 };
const cardH = (n) => (small(n) ? CARD.sh : CARD.h);
// width of a link label (same font as .elabel: 11px, weight 600, 8px padding on each side, border)
let measureCtx;
export function labelW(txt) {
  if (!txt) return 0;
  measureCtx = measureCtx || document.createElement("canvas").getContext("2d");
  measureCtx.font = `600 11px ${getComputedStyle(document.body).fontFamily}`;
  return Math.ceil(measureCtx.measureText(txt).width) + 18;
}
/* Columns: each aisle between two columns has one lane per cable going up or down in it (16 px each, the minimum gap
   the router keeps) plus room for the longest label that has to sit there, so nothing overlaps. */
const LANE = 16;
function layout() {
  const v = view();
  S.auto = {};
  const G = groupsNow();
  const colOf = (id) => G.find((g) => g.id === groupOf(id))?.col ?? 0;
  const ncol = Math.max(0, ...G.map((g) => g.col)) + 1;
  const lab = new Array(ncol).fill(0), lanes = new Array(ncol).fill(0);   // aisle i: between column i and i+1
  v.edges.filter((e) => !e.away).forEach((e) => {
    const a = colOf(e.source), b = colOf(e.target), w = labelW(e.label);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    // a cable only goes up or down in the start aisle and the end aisle; in between it runs flat.
    // its label sits on the longest flat stretch: it only claims an aisle if the cable crosses just one
    if (lo === hi) { const i = Math.min(lo, ncol - 2); if (i >= 0) { lab[i] = Math.max(lab[i], w); lanes[i]++; } }
    else {
      lanes[lo]++; if (hi - 1 !== lo) lanes[hi - 1]++;
      if (hi - lo === 1) lab[lo] = Math.max(lab[lo], w);
    }
  });
  S.colX = [0];
  for (let i = 1; i < ncol; i++) S.colX[i] = S.colX[i - 1] + CARD.w + Math.max(CARD.gapMin, lab[i - 1] + CARD.labPad + lanes[i - 1] * LANE);
  const rows = [...new Set(G.map((g) => g.row))].sort((a, b) => a - b);
  let top = 0;
  rows.forEach((r) => {
    let bottom = top;
    G.filter((g) => g.row === r).forEach((g) => {
      let y = top + CARD.head;
      v.nodes.filter(({ n }) => groupOf(n.id) === g.id).forEach(({ n }) => {
        S.auto[n.id] = { x: S.colX[g.col] ?? 0, y };
        y += cardH(n) + CARD.gapY;
      });
      bottom = Math.max(bottom, y);
    });
    top = bottom + CARD.rowGap;
  });
}
/* magnet: a card dropped near a column snaps to it, near another card's row aligns with it */
function snap(id, x, y, skip) {
  let bx = x, by = y, dx = 28, dy = 10;
  (S.colX || []).forEach((cx) => { if (Math.abs(cx - x) < dx) { dx = Math.abs(cx - x); bx = cx; } });
  Object.keys(S.auto || {}).forEach((o) => {
    if (o === id || (skip && skip.has(o))) return;
    const p = pos(o);
    if (Math.abs(p.x - x) < dx) { dx = Math.abs(p.x - x); bx = p.x; }
    if (Math.abs(p.y - y) < dy) { dy = Math.abs(p.y - y); by = p.y; }
  });
  return { x: Math.round(bx), y: Math.round(by) };
}
// position of a block: saved, otherwise relative to the moved ancestor, otherwise automatic
function pos(id) {
  if (S.saved[id]) {
    // a saved position a few pixels off a column is snapped back onto it (older layouts)
    const s = S.saved[id], c = (S.colX || []).find((cx) => cx !== s.x && Math.abs(cx - s.x) < 28);
    return c !== undefined ? { x: c, y: s.y } : s;
  }
  for (let p = S.byId[id]?.parent; p; p = S.byId[p]?.parent) {
    if (S.saved[p] && S.auto[p] && S.auto[id]) return { x: S.saved[p].x + S.auto[id].x - S.auto[p].x, y: S.saved[p].y + S.auto[id].y - S.auto[p].y };
  }
  return S.auto[id] || { x: 0, y: 0 };
}
let saveT;
function moveNode(id, x, y, done) {
  if (done) ({ x, y } = snap(id, x, y));
  const p = pos(id), dx = x - p.x, dy = y - p.y;
  S.saved[id] = { x: Math.round(x), y: Math.round(y) };
  descendants(id).forEach((d) => { if (S.saved[d]) S.saved[d] = { x: S.saved[d].x + dx, y: S.saved[d].y + dy }; });
  if (done) saveLayout();
}
function saveLayout() {
  if (S.room) return;   // inside a block the cards are placed for this page only
  clearTimeout(saveT);
  saveT = setTimeout(() => api("/api/layout", { method: "POST", body: JSON.stringify({ positions: S.saved, positions3d: S.saved3 }) }).catch(() => toast("Position not saved")), 300);
}
function save3(id, x, z) { if (id) S.saved3[id] = { x: +x.toFixed(2), z: +z.toFixed(2) }; else saveLayout(); }
/* 2D position history: Cmd+Z undoes, Cmd+Shift+Z redoes */
const HIST = [], REDO = [];
function pushHist() { HIST.push(JSON.stringify(S.saved)); if (HIST.length > 200) HIST.shift(); REDO.length = 0; }
function stepHist(back) {
  const from = back ? HIST : REDO, to = back ? REDO : HIST;
  if (!from.length) return toast(back ? "Nothing to undo" : "Nothing to redo");
  to.push(JSON.stringify(S.saved)); S.saved = JSON.parse(from.pop());
  saveLayout(); R && R.resize && R.resize();
}
async function resetLayout() {
  if (roomOn()) { S.saved = {}; return rerender(true); }
  if (S.mode !== "3d") pushHist();
  if (S.mode === "3d") S.saved3 = {}; else S.saved = {};
  await api("/api/layout", { method: "POST", body: JSON.stringify({ positions: S.saved, positions3d: S.saved3 }) }).catch(() => {});
  rerender(true);
}

// ------------------------------------------------------------ focus (hover, selection, flows, search)
function flowSteps() {
  if (!S.flow) return [];
  return (S.flow.steps || []).map((s, i) => {
    const a = rep(s.from), b = rep(s.to);
    const e = view().edges.find((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
    return { ...s, i, a, b, edge: e ? e.key : null, rev: e ? e.source !== a : false };
  });
}
function focusSet() {
  if (S.flow) {
    const set = new Set();
    flowSteps().forEach((s) => { if (S.flowStep < 0 || s.i === S.flowStep) { set.add(`n:${s.a}`); set.add(`n:${s.b}`); if (s.edge) set.add(`e:${s.edge}`); } });
    return set;
  }
  const key = S.hover || S.sel;
  if (!key) return null;
  const set = new Set();
  if (key.startsWith("node:")) {
    const id = rep(key.slice(5)); set.add(`n:${id}`);
    view().edges.forEach((e) => { if (e.source === id || e.target === id) { set.add(`e:${e.key}`); set.add(`n:${e.source}`); set.add(`n:${e.target}`); } });
  } else {
    const l = byKey(key); if (!l) return null;
    const a = rep(l.source), b = rep(l.target);
    set.add(`n:${a}`); set.add(`n:${b}`);
    view().edges.forEach((e) => { if ((e.source === a && e.target === b) || (e.source === b && e.target === a)) set.add(`e:${e.key}`); });
  }
  return set;
}
function matches(n) {
  if (!S.search) return false;
  const q = S.search.toLowerCase();
  const all = [n, ...descendants(n.id).map((d) => S.byId[d])];
  return all.some((x) => [x.label, x.id, x.summary, ...(x.tech || []), ...(x.files || []).map((f) => f.path || f)].join(" ").toLowerCase().includes(q));
}
function metricOf(n) {
  const m = n.metric; if (!m) return null;
  const r = S.res[`node:${n.id}`]; if (!r || !r.checks) return null;
  const c = r.checks[m.check || 0]; if (!c || !c.values) return null;
  let v = c.values[m.value];
  if (v === undefined || v === null) return null;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(+v)) v = +v;
  if (typeof v === "number") v = v.toLocaleString("en-US", { maximumFractionDigits: m.digits ?? 2 });
  return { value: `${v}${m.unit ? " " + m.unit : ""}`, label: m.label || "" };
}
function openTodos(el) { return (el.todos || []).filter((t) => !(t && t.done)).length; }

// ------------------------------------------------------------ loading
async function loadMap(first) {
  let j;
  try { j = await api("/api/map"); } catch (e) { return; }
  if (j.error) { banner(j.error); return; }
  banner(j.errors && j.errors.length ? `map.json: ${j.errors[0]}` : "");
  if (!first && j.mtime === S.mtime) return;
  S.mtime = j.mtime;
  // label widths are measured with Geist: wait for the font before the first layout
  if (first && document.fonts) { try { await document.fonts.load(`600 11px ${getComputedStyle(document.body).fontFamily}`); } catch (e) { /* font unavailable */ } }
  S.map = normalize(j.map);
  if (S.room && !S.byId[S.room]) leaveRoom();
  if (first) { try { const L = await api("/api/layout"); S.saved = L.positions || {}; S.saved3 = L.positions3d || {}; } catch (e) { S.saved = {}; S.saved3 = {}; } }
  $("#pname").textContent = S.map.project || "Mira Terminal";
  document.title = S.map.project ? `${S.map.project} map` : "Mira Terminal";
  $("#psum").textContent = S.map.summary || "";
  $("#empty").hidden = !(j.map._missing || !S.map.nodes.length);
  if (S.flow) S.flow = S.map.flows.find((f) => f.id === S.flow.id) || null;
  renderSide();
  rerender(first);
  // in the app: the name and kind of each part, for the icons of tabs already open
  if (EMBED) window.parent.postMessage({ type: "mira:parts", parts: S.map.nodes.map((n) => ({ id: n.id, kind: n.kind || "", label: n.label || n.id })) }, "*");
  if (S.sel && byKey(S.sel)) openPanel(S.sel, true); else if (S.sel) closePanel();
  runChecks(false);
}
function banner(msg) {
  let b = $(".err-banner");
  if (!msg) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement("div"); b.className = "err-banner"; document.body.appendChild(b); }
  b.textContent = msg;
}
async function runChecks(force, key, manual) {
  if (!S.map || !S.map.nodes.length) return;
  if (!key) $("#recheck").classList.add("busy");
  try {
    const q = new URLSearchParams({ ...(force ? { force: 1 } : {}), ...(key ? { key } : {}), ...(manual ? { manual: 1 } : {}) });
    Object.assign(S.res, await api(`/api/checks?${q}`));
  } catch (e) { toast("Checks unreachable"); }
  $("#recheck").classList.remove("busy");
  R && R.paint(true);
  renderCounts(); renderSide();
  if (S.sel && document.activeElement !== $("#q")) openPanel(S.sel, true);
}

// ------------------------------------------------------------ rendering
async function rerender(fit) {
  invalidate(); layout();
  document.querySelectorAll("#mode button").forEach((b) => b.classList.toggle("on", b.dataset.mode === S.mode));
  document.querySelectorAll("#depth button").forEach((b) => b.classList.toggle("on", b.dataset.depth === S.depth));
  $("#d2").hidden = S.mode !== "2d"; $("#d3").hidden = S.mode !== "3d";
  if (S.mode === "3d") {
    if (!Scene) {
      try { Scene = await import("./scene3d.js"); Scene.init(ctx); } catch (e) { console.error(e); toast("3D unavailable"); S.mode = "2d"; return rerender(fit); }
    }
    R = Scene;
  } else R = Diagram;
  if (S.mode === "3d") Diagram.sleep(); else Scene && Scene.sleep();
  R.render(fit);
  renderFlowbar(); renderRoombar();
}

// ------------------------------------------------------------ going into a block
function leaveRoom() { if (!S.room) return; S.room = null; S.saved = S.mainSaved || S.saved; S.mainSaved = null; invalidate(); }
function setRoom(id) {
  if (S.room === id) return;
  if (!id) leaveRoom();
  else { if (!S.room) S.mainSaved = S.saved; S.room = id; S.saved = {}; invalidate(); }
  // a flow plays on the whole map
  if (S.flow) { clearInterval(flowTimer); S.flow = null; S.flowStep = -1; renderSide(); }
  S.hover = null; $("#tip").hidden = true; closePanel();
  rerender(true);
}
function openRoom(id) {
  if (S.mode !== "2d" || !S.byId[id]) return;
  if ((S.kids[id] || []).length) return setRoom(id);
  // a neighbour with nothing inside: back to the whole map, on it
  if (isPill(id)) { setRoom(null); select(`node:${id}`, true, true); }
}
function roomUp() { if (S.room) setRoom(S.byId[S.room]?.parent || null); }
function renderRoombar() {
  const b = $("#roombar");
  if (!roomOn()) { b.hidden = true; return; }
  const chain = [];
  for (let n = S.byId[S.room]; n; n = n.parent ? S.byId[n.parent] : null) chain.unshift(n);
  b.hidden = false;
  b.innerHTML = `<button class="ibtn" data-up title="Back (Esc)">${icon("arrow-left", 15)}</button><button class="crumb" data-room="">Whole map</button>`
    + chain.map((n, i) => `<span class="sep">/</span>${i === chain.length - 1 ? `<span class="crumb here">${esc(n.label)}</span>` : `<button class="crumb" data-room="${esc(n.id)}">${esc(n.label)}</button>`}`).join("");
  b.querySelector("[data-up]").onclick = roomUp;
  b.querySelectorAll("[data-room]").forEach((x) => (x.onclick = () => setRoom(x.dataset.room || null)));
}
function paint() { R && R.paint(); }
function renderCounts() {
  const c = { ok: 0, warn: 0, fail: 0 };
  Object.values(S.res).forEach((r) => { if (c[r.status] !== undefined) c[r.status]++; });
  $("#counts").innerHTML = ["ok", "warn", "fail"].filter((s) => c[s] || s === "ok")
    .map((s) => `<span class="pill stw ${s}" title="${STATUS_TXT[s]}">${c[s]} ${STATUS_TXT[s].toLowerCase()}</span>`).join("");
}
function renderSide() {
  if (!S.map) return;
  const fl = S.map.flows;
  $("#flows").innerHTML = fl.length ? fl.map((f) => `<button class="flow ${S.flow && S.flow.id === f.id ? "on" : ""}" data-flow="${esc(f.id)}">
      <div class="fl"><div class="f1">${esc(f.label)}</div><div class="f2">${(f.steps || []).length} steps${f.summary ? `, ${esc(f.summary)}` : ""}</div></div>
      <span class="play">${icon(S.flow && S.flow.id === f.id ? "square" : "play", 14)}</span></button>`).join("")
    : `<div class="none">No flows in the map</div>`;
  $("#flows").querySelectorAll("[data-flow]").forEach((b) => b.onclick = () => setFlow(S.flow && S.flow.id === b.dataset.flow ? null : b.dataset.flow));
  const items = [];
  const push = (key, el) => {
    const r = S.res[key]; const st = r ? r.status : "unknown";
    const bad = r && r.checks ? r.checks.find((c) => c.status === st) : null;
    if (st === "fail" || st === "warn") items.push({ key, el, st, txt: bad ? `${bad.label}: ${bad.detail}` : "" });
  };
  S.map.nodes.forEach((n) => push(`node:${n.id}`, n));
  S.map.links.forEach((l) => push(`link:${linkId(l)}`, l));
  items.sort((a, b) => RANK[b.st] - RANK[a.st]);
  const todos = S.map.nodes.filter((n) => openTodos(n)).length;
  $("#issues").innerHTML = (items.length ? items.map((it) => `<div class="issue" data-go="${esc(it.key)}"><div><div class="i1">${esc(labelOf(it.el))} ${stWord(it.st)}</div><div class="i2">${esc(it.txt)}</div></div></div>`).join("") : `<div class="none">All up</div>`)
    + (todos ? `<div class="none" style="margin-top:10px">${todos} block${todos > 1 ? "s have" : " has"} open points</div>` : "");
  $("#issues").querySelectorAll("[data-go]").forEach((d) => d.onclick = () => select(d.dataset.go, true));
}

// ------------------------------------------------------------ flows
let flowTimer = null;
function setFlow(id) {
  clearInterval(flowTimer);
  if (id && S.room) leaveRoom();
  S.flow = id ? S.map.flows.find((f) => f.id === id) : null;
  S.flowStep = -1;
  if (S.flow) {
    // the flow's blocks must be visible: expand their parents
    (S.flow.steps || []).forEach((s) => [s.from, s.to].forEach((x) => { for (let p = S.byId[x]?.parent; p; p = S.byId[p]?.parent) S.expanded.add(p); }));
    store("pm.exp", JSON.stringify([...S.expanded]));
    rerender(true);
    let i = -1;
    flowTimer = setInterval(() => { i = (i + 1) % (S.flow.steps.length + 1); S.flowStep = i === S.flow.steps.length ? -1 : i; renderFlowbar(); paint(); }, 2200);
  } else { rerender(false); }
  renderSide(); renderFlowbar(); paint();
}
function renderFlowbar() {
  const fb = $("#flowbar");
  if (!S.flow) { fb.hidden = true; return; }
  fb.hidden = false;
  const steps = S.flow.steps || [];
  const s = steps[S.flowStep];
  fb.innerHTML = `<span class="fn">${esc(S.flow.label)}</span><span class="fs">${s ? `<b>${S.flowStep + 1}/${steps.length}</b>${esc(s.text || `${S.byId[s.from]?.label} → ${S.byId[s.to]?.label}`)}` : `${steps.length} steps`}</span><button class="ibtn" id="flowx" title="Stop">${icon("x", 14)}</button>`;
  $("#flowx").onclick = () => setFlow(null);
}

// ------------------------------------------------------------ hover, selection
let lastMouse = { x: 0, y: 0 };
function moveTip(e) {
  if (e) lastMouse = { x: e.clientX, y: e.clientY };
  const t = $("#tip"); if (t.hidden) return;
  t.style.left = Math.min(window.innerWidth - t.offsetWidth - 8, lastMouse.x + 14) + "px";
  t.style.top = Math.min(window.innerHeight - t.offsetHeight - 8, lastMouse.y + 14) + "px";
}
function hover(key, e, edge) {
  if (S.hover === key) return;
  S.hover = key;
  const t = $("#tip");
  if (!key) t.hidden = true;
  else {
    const el = byKey(key); if (!el) return;
    const isLink = el.__kind === "link";
    const st = edge ? edgeStatus(edge) : isLink ? elStatus(key) : nodeStatus(el.id);
    const r = S.res[key];
    const bad = r && r.checks ? r.checks.filter((c) => ["fail", "warn"].includes(c.status)).map((c) => `${c.label}: ${c.detail}`) : [];
    let h = `<div class="t1">${stWord(st)} ${esc(edge && edge.members.length > 1 ? `${S.byId[edge.source].label} → ${S.byId[edge.target].label}` : labelOf(el))}</div>`;
    if (isLink) h += `<div class="t3">${esc(S.byId[el.source]?.label)} → ${esc(S.byId[el.target]?.label)}</div>`;
    if (edge && edge.members.length > 1) h += `<div class="t2">${edge.members.map((l) => esc(l.label || "")).join("<br>")}</div>`;
    else h += `<div class="t2">${esc(el.summary || "")}</div>`;
    if (bad.length) h += `<div class="t3" style="color:${COL[st] || COL.warn}">${esc(bad[0])}</div>`;
    const nt = openTodos(el); if (nt) h += `<div class="t3">${nt} open point${nt > 1 ? "s" : ""}</div>`;
    t.innerHTML = h; t.hidden = false; moveTip(e);
  }
  paint();
}
/* file paths of a block and the deepest common folder (relative to the root, "" if none) */
const FILE_NO_EXT = new Set(["Makefile", "Dockerfile", "Procfile", "LICENSE", "Gemfile", "Rakefile", "Justfile"]);
function blockFiles(n) {
  const files = (n.files || []).map((f) => (typeof f === "string" ? f : f && f.path) || "").filter(Boolean);
  const dirs = files.filter((f) => !/^[a-z]+:/i.test(f)).map((f) => {
    const isDir = f.endsWith("/"), parts = f.replace(/^\.\//, "").split("/").filter((x) => x && x !== ".");
    const last = parts[parts.length - 1] || "";
    // folder: trailing slash, or last segment without an extension (except known file names)
    if (!isDir && (last.includes(".") || FILE_NO_EXT.has(last))) parts.pop();
    return parts;
  });
  let common = dirs.length ? dirs[0] : [];
  dirs.slice(1).forEach((d) => { let i = 0; while (i < common.length && i < d.length && common[i] === d[i]) i++; common = common.slice(0, i); });
  return { files, dir: common.join("/") };
}
/* the app tells the map which files changed (or which block tab is open): find the block, show it */
function blockOf(path) {
  // the block whose files sit closest to the changed file: exact file first, then the deepest shared folder
  const segs = String(path).replace(/^\.\//, "").split("/");
  const p = segs.join("/");
  let best = null, score = 0;
  for (const n of S.map.nodes || []) {
    let s = 0;
    for (const f of blockFiles(n).files) {
      const fs = f.replace(/^\.\//, "").replace(/\/$/, "").split("/");
      if (fs.join("/") === p) { s = Math.max(s, 1000); continue; }
      let i = 0; while (i < fs.length - 1 && i < segs.length - 1 && fs[i] === segs[i]) i++;
      if (f.endsWith("/") && fs.every((x, j) => segs[j] === x)) i = Math.max(i, fs.length + 0.5);
      s = Math.max(s, i);
    }
    if (s > score) { score = s; best = n; }
  }
  return best;
}
function shown(n) {
  // a folded child shows through its parent's card
  while (n && !Diagram.has(n.id) && n.parent) n = S.byId[n.parent];
  return n;
}
if (EMBED) window.addEventListener("message", (e) => {
  if (e.source !== window.parent) return;
  if (S.mode !== "2d" && (e.data || {}).type !== "mira:theme") return;
  const d = e.data || {};
  if (d.type === "mira:activity" && Array.isArray(d.files)) {
    const hit = new Map();
    d.files.forEach((f) => { const n = blockOf(f); if (n) hit.set(n.id, (hit.get(n.id) || 0) + 1); });
    const ids = [...hit.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    ids.forEach((id, i) => { const n = shown(S.byId[id]); if (n) Diagram.busy(n.id, i === 0); });
  }
  if (d.type === "mira:theme" && d.vars && typeof d.vars === "object") {
    // the app's theme: its token overrides apply to the map too (names checked, values set as CSS)
    const root = document.documentElement;
    [...root.style].filter((n) => n.startsWith("--mira-")).forEach((n) => root.style.removeProperty(n));
    for (const [k, v] of Object.entries(d.vars)) if (/^[a-z0-9-]+$/.test(k) && typeof v === "string" && v.length < 200) root.style.setProperty("--mira-" + k, v);
    paint();
  }
  if (d.type === "mira:pick" && d.id && S.byId[d.id]) { const n = shown(S.byId[d.id]); if (n) select("node:" + n.id, true); }
  if (d.type === "mira:focus" && d.id) { const n = shown(S.byId[d.id]); if (n) Diagram.busy(n.id, true); }
  // its tab chosen in Mira: the block is selected and the camera goes to it, without opening its panel
  if (d.type === "mira:show" && d.id && S.byId[d.id]) { const n = shown(S.byId[d.id]); if (n) select("node:" + n.id, true, true); }
});

function postBlock(id) {
  const n = S.byId[id]; if (!n) return;
  const { files, dir } = blockFiles(n);
  const status = nodeStatus(n.id);
  window.parent.postMessage({
    type: "mira:block", id: n.id, label: n.label || n.id, kind: n.kind || "", kindLabel: Diagram.KIND_TXT[n.kind] || n.tag || "",
    color: S.gcolor[n.group] || "", dir, files, summary: n.summary || "", status, statusLabel: STATUS_TXT[status] || STATUS_TXT.unknown, todos: openTodos(n),
  }, "*");
}
// click on the background (without dragging): the app closes its panel
function blank() { if (EMBED) window.parent.postMessage({ type: "mira:blank" }, "*"); }
function select(key, focus, quiet) {
  if (EMBED && !key.startsWith("node:")) return;   // in the app: clicking a link does nothing special
  if (roomOn() && key.startsWith("node:")) { const id = key.slice(5); if (id === S.room || (!inRoom(id) && !isPill(id))) { leaveRoom(); rerender(false); } }
  S.sel = key; $("#tip").hidden = true; S.hover = null;
  if (key.startsWith("node:")) {
    const id = key.slice(5);
    if (rep(id) !== id) { for (let p = S.byId[id].parent; p; p = S.byId[p]?.parent) S.expanded.add(p); rerender(false); }
  }
  if (EMBED) { if (!quiet) postBlock(key.slice(5)); paint(); }
  else { openPanel(key); paint(); }
  if (focus && R && R.focus) R.focus(key);
}
function closePanel() { S.sel = null; $("#panel").hidden = true; paint(); }
function toggleExpand(id) {
  if (S.depth === "all") { S.depth = "essential"; store("pm.depth", S.depth); S.map.nodes.forEach((n) => { if ((S.kids[n.id] || []).length) S.expanded.add(n.id); }); }
  S.expanded.has(id) ? S.expanded.delete(id) : S.expanded.add(id);
  store("pm.exp", JSON.stringify([...S.expanded]));
  rerender(false);
  if (S.sel) openPanel(S.sel, true);
}

// ------------------------------------------------------------ right panel
const PRESETS = {
  node: [
    ["Review", ""],
    ["Faster", "Find what slows this part down (computation, network calls, rendering, waits), propose optimizations with the expected gain, then apply the safest one."],
    ["What's missing", "List what this part still needs to be ready for real users: configuration, error cases, tests, monitoring."],
    ["Add checks", "Propose and add automatic, non-destructive checks (health, configuration, API) for this part in .miraterminal/map.json, then run them."],
  ],
  link: [
    ["Review", ""],
    ["Cut latency", "Measure and cut this link's end-to-end latency (round trips, serialization, block wait, cache). Give the numbers before and after."],
    ["Harden", "What happens when one side of this link goes down or misbehaves? Check timeouts, retries, error messages and alerts, and fix the riskiest gap."],
    ["What's missing", "Check this link's configuration (keys, allowed domains, URLs, environment variables, CORS) and say what is missing or fragile."],
  ],
};
function openPanel(key, refresh) {
  if (EMBED) return;   // never a detail panel in the app
  const el = byKey(key);
  if (!el) return closePanel();
  const body = $("#pbody");
  const keepQ = refresh ? ($("#q") || {}).value : "";
  const scroll = refresh ? body.scrollTop : 0;
  $("#panel").hidden = false;
  const isLink = el.__kind === "link";
  const g = S.groups.find((x) => x.id === el.group);
  $("#pkind").innerHTML = isLink ? "Link" : `<span class="sw" style="background:${esc(g?.color)}"></span>${esc(g ? g.label : "Block")}`;
  const st = isLink ? elStatus(key) : nodeStatus(el.id);
  const r = S.res[key] || {};
  let h = `<div class="ptitle">${isLink ? "" : `<span class="ico">${icon(kindIcon(el.kind), 18)}</span>`}<span>${esc(labelOf(el))}</span></div>`;
  if (isLink) {
    const a = S.byId[el.source], b = S.byId[el.target];
    h += `<div class="pends"><button data-go="node:${esc(a.id)}">${esc(a.label)}</button>${icon("arrow-left-right", 13)}<button data-go="node:${esc(b.id)}">${esc(b.label)}</button></div>`;
  }
  const tags = [`<span class="chip ${st}">${STATUS_TXT[st]}</span>`];
  if (el.status) tags.push(`<span class="chip">${esc(LIFE[el.status] || el.status)}</span>`);
  (el.tech || []).forEach((t) => tags.push(`<span class="chip">${esc(t)}</span>`));
  h += `<div class="tags">${tags.join("")}</div>`;
  if (el.summary) h += `<div class="psum">${esc(el.summary)}</div>`;
  if (el.details) h += `<div class="pdet">${esc(el.details)}</div>`;

  const kids = isLink ? [] : (S.kids[el.id] || []);
  if (kids.length) {
    h += `<div class="sec"><h4>Contains<button data-exp="${esc(el.id)}">${isExpanded(el.id) ? "Collapse" : "Expand"}</button></h4>` + kids.map((c) => {
      const n = S.byId[c]; const s = nodeStatus(c);
      return `<div class="row link" data-go="node:${esc(c)}"><div class="main"><div class="l1"><span>${esc(n.label)}</span>${stWord(s)}</div><div class="l2">${esc(n.summary || "")}</div></div></div>`;
    }).join("") + `</div>`;
  }
  const checks = r.checks || (el.checks || []).map((c, i) => ({ label: c.label || c.type, status: "pending", detail: "", index: i }));
  if (checks.length) {
    const hasManual = (el.checks || []).some((c) => c.manual);
    h += `<div class="sec"><h4>Checks<span>${hasManual ? `<button data-run="manual">Run all</button>` : ""}<button data-run="auto">Rerun</button></span></h4>` +
      checks.map((c) => {
        const vals = Object.entries(c.values || {}).filter(([, v]) => v !== null && v !== undefined)
          .map(([k, v]) => `<span><b>${esc(k)}</b> ${esc(typeof v === "number" ? +v.toFixed(4) : typeof v === "object" ? JSON.stringify(v) : v)}</span>`).join("");
        return `<div class="row"><div class="main"><div class="l1"><span>${esc(c.label)}</span><span class="ms">${c.ms !== undefined ? c.ms + " ms " : ""}${c.status === "pending" ? "" : stWord(c.status)}</span></div>` +
          (c.detail ? `<div class="l2">${esc(c.detail)}</div>` : "") + (vals ? `<div class="vals">${vals}</div>` : "") + `</div></div>`;
      }).join("") + `</div>`;
  }
  if (el.cost) {
    const c = el.cost;
    h += `<div class="sec"><h4>Cost</h4><div class="cost">${c.monthly_usd !== undefined && c.monthly_usd !== null ? `$${esc(c.monthly_usd)} / month` : esc(c.label || "To confirm")}${c.note ? `<span>${esc(c.note)}</span>` : ""}</div></div>`;
  }
  const todos = el.todos || [];
  if (todos.length) h += `<div class="sec"><h4>Open points</h4>` + todos.map((t) => `<div class="todo ${t && t.done ? "done" : ""}"><span class="box"></span><span>${esc(typeof t === "string" ? t : t.text)}</span></div>`).join("") + `</div>`;
  if (el.notes) h += `<div class="sec"><h4>Notes</h4><div class="pdet">${esc(el.notes)}</div></div>`;
  if (!isLink) {
    const ls = S.map.links.filter((l) => l.source === el.id || l.target === el.id);
    if (ls.length) h += `<div class="sec"><h4>Connections</h4>` + ls.map((l) => {
      const out = l.source === el.id, other = S.byId[out ? l.target : l.source], k = `link:${linkId(l)}`;
      return `<div class="row link" data-go="${esc(k)}"><div class="main"><div class="l1"><span>${out ? "→" : "←"} ${esc(other?.label)}</span>${stWord(elStatus(k))}</div><div class="l2">${esc(l.label || "")}</div></div></div>`;
    }).join("") + `</div>`;
  }
  if ((el.files || []).length) h += `<div class="sec"><h4>Files</h4>` + el.files.map((f) => { const p = f.path || f; return `<div class="file" data-file="${esc(p)}" title="Open"><code>${esc(p)}</code>${f.role ? `<span>${esc(f.role)}</span>` : ""}</div>`; }).join("") + `</div>`;
  h += `<div class="sec" id="act"></div>`;
  const presets = el.questions && el.questions.length ? el.questions.map((q) => (Array.isArray(q) ? q : [q, q])) : PRESETS[isLink ? "link" : "node"];
  h += `<div class="ask"><div class="chips">${presets.map(([t], i) => `<button data-preset="${i}">${esc(t)}</button>`).join("")}</div>` +
    `<textarea id="q" placeholder="What do you want to do here?">${esc(keepQ || "")}</textarea>` +
    `<div class="acts"><button class="btn primary" id="go">Start a session</button><button class="btn" id="cp" title="Copy prompt">${icon("copy", 14)}</button></div></div>`;
  body.innerHTML = h; body.scrollTop = scroll;

  body.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => select(b.dataset.go, true));
  body.querySelectorAll("[data-exp]").forEach((b) => b.onclick = () => toggleExpand(b.dataset.exp));
  body.querySelectorAll("[data-run]").forEach((b) => b.onclick = async () => { b.textContent = "…"; await runChecks(true, key, b.dataset.run === "manual"); });
  body.querySelectorAll("[data-preset]").forEach((b) => b.onclick = () => { $("#q").value = presets[+b.dataset.preset][1]; $("#q").focus(); });
  body.querySelectorAll("[data-file]").forEach((f) => f.onclick = async () => {
    const r = await api("/api/open", { method: "POST", body: JSON.stringify({ path: f.dataset.file }) }).catch(() => ({}));
    if (!r.ok) { await copy(f.dataset.file); toast("Path copied"); }
  });
  $("#go").onclick = () => session(key, true);
  $("#cp").onclick = () => session(key, false);
  $("#q").onkeydown = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) session(key, true); };
  loadActivity(key);
}
async function loadActivity(key) {
  const paintA = (a) => {
    const box = $("#act"); if (!box || !a) return;
    let h = "";
    if (a.dirty && a.dirty.length) h += `<div class="dirty">${a.dirty.map(esc).join("<br>")}</div>`;
    h += (a.commits || []).map((c) => `<div class="commit"><code>${esc(c.hash)}</code>${esc(c.msg.length > 90 ? c.msg.slice(0, 89) + "…" : c.msg)} <span style="color:var(--mira-text-3)">${esc(c.when)}
</span></div>`).join("");
    if (a.sessions && a.sessions.length) h += `<div style="margin-top:10px">` + a.sessions.map((s) => `<div class="commit"><code>${esc(s.when)}</code>${esc(s.question || "Review")}</div>`).join("") + `</div>`;
    box.innerHTML = h ? `<h4>Activity</h4>${h}` : "";
  };
  paintA(S.act[key]);
  try { const a = await api(`/api/activity?key=${encodeURIComponent(key)}`); S.act[key] = a; if (S.sel === key) paintA(a); } catch (e) { /* not a git repo */ }
}
async function session(key, launch) {
  // the "Outside services" block exists only in the page : the agent is asked about one of its systems
  if (byKey(key)?.__virtual) { toast("Open Outside services and pick one system"); return; }
  const q = ($("#q") || {}).value || "";
  const b = launch ? $("#go") : $("#cp");
  b.disabled = true;
  try {
    // in Mira Terminal (map shown in the app): the chat opens in an app tab
    const embedded = window.parent !== window;
    const r = await api("/api/session", { method: "POST", body: JSON.stringify({ key, question: q, launch: launch && !embedded }) });
    if (embedded && launch) { window.parent.postMessage({ type: "mira:session", key, label: labelOf(byKey(key)), prompt: r.prompt }, "*"); toast("Session opened in Mira"); }
    else if (!launch) { await copy(r.prompt); toast("Prompt copied"); }
    else if (r.launched) { toast("Session opened in the terminal"); delete S.act[key]; setTimeout(() => S.sel === key && loadActivity(key), 400); }
    else { await copy(r.command); toast("Command copied, paste it in a terminal"); }
  } catch (e) { toast("Failed: " + e.message); }
  b.disabled = false;
}

// ------------------------------------------------------------ context shared with the renderers
const ctx = {
  S, $, esc, icon, STATUS_TXT, stWord, EMBED, blank, kindIcon, COL, CARD, view, pos, moveNode, save3, nodeStatus, edgeStatus, elStatus, focusSet, flowSteps, matches, metricOf,
  openTodos, isExpanded, toggleExpand, select, hover, moveTip, closePanel, rerender, labelOf, byKey, cardH, labelW, snap, pushHist, stepHist, saveLayout, toast,
  groupsNow, groupOf, isPill, small, openRoom,
};

// ------------------------------------------------------------ controls
$("#side-toggle").innerHTML = icon("panel-left", 16);
$("#search-ic").innerHTML = icon("search", 14);
$("#pclose").innerHTML = icon("x", 16);
const ZI = { in: "plus", out: "minus", fit: "maximize", reset: "rotate-ccw", links: "filter" };
const paintLinksBtn = (b) => { b.classList.toggle("on", S.noImports); b.title = S.noImports ? "Show the import links" : "Hide the import links"; };
document.querySelectorAll("#zoomctl [data-z]").forEach((b) => {
  b.innerHTML = icon(ZI[b.dataset.z], 15);
  if (b.dataset.z === "links") {
    paintLinksBtn(b);
    b.onclick = () => { S.noImports = !S.noImports; store("pm.noimp", S.noImports ? "1" : "0"); paintLinksBtn(b); toast(S.noImports ? "Import links hidden" : "Import links shown"); rerender(false); };
    return;
  }
  b.onclick = () => (b.dataset.z === "reset" ? resetLayout() : R && R.zoom(b.dataset.z));
});
if (store("pm.side") === "0") document.body.classList.add("noside");
$("#side-toggle").onclick = () => {
  const small = window.matchMedia("(max-width: 900px)").matches;
  if (small) document.body.classList.toggle("sideopen");
  else { document.body.classList.toggle("noside"); store("pm.side", document.body.classList.contains("noside") ? "0" : "1"); }
  setTimeout(() => R && R.resize && R.resize(), 240);
};
document.querySelectorAll("#mode button").forEach((b) => b.onclick = () => { if (S.mode !== b.dataset.mode) { S.mode = b.dataset.mode; store("pm.mode", S.mode); rerender(true); } });
document.querySelectorAll("#depth button").forEach((b) => b.onclick = () => {
  if (S.depth === b.dataset.depth) return;
  S.depth = b.dataset.depth; store("pm.depth", S.depth);
  if (S.depth === "essential") { S.expanded.clear(); store("pm.exp", "[]"); }
  rerender(true);
});
$("#recheck").onclick = () => runChecks(true);
$("#pclose").onclick = closePanel;
$("#search").oninput = (e) => { S.search = e.target.value.trim(); paint(); };
$("#search").onkeydown = (e) => {
  if (e.key === "Enter") { const n = view().nodes.map((x) => x.n).find(matches); if (n) select(`node:${n.id}`, true, true); }
  if (e.key === "Escape") { e.target.value = ""; S.search = ""; e.target.blur(); paint(); }
};
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea")) return;
  if (e.key === "Escape") { if (S.flow) setFlow(null); else if (!$("#panel").hidden) closePanel(); else if (roomOn()) roomUp(); else closePanel(); }
  if (e.key === "Backspace" && roomOn()) { e.preventDefault(); roomUp(); }
  if (e.key === "/") { e.preventDefault(); $("#search").focus(); }
  if (e.key === "r" || e.key === "R") runChecks(true);
  if (e.key === "f" || e.key === "F") R && R.zoom("fit");
});
window.addEventListener("resize", () => R && R.resize && R.resize());

Diagram.init(ctx);
loadMap(true);
setInterval(() => loadMap(false), 2500);     // the map follows changes to map.json
setInterval(() => runChecks(false), 60000);  // status refreshed every minute
