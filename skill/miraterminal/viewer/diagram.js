/* 2D diagram: HTML cards placed in a pannable world, links as Bézier curves (SVG), one zone per group. */
import { routeAll, moveEnd } from "./route.js";
let C, S;
let routes = {};   // key -> waypoints (links that go around the cards)
const T = { x: 0, y: 0, k: 1 };
const cards = new Map();   // id -> div
const edges = new Map();   // key -> { path, hit, lab, e }
let rerouteT = 0, svg, world, stage, zonesEl, labsEl, runner, raf = 0, awake = false;

// kind names: vocabulary of the C4 model (person, container, component, external system) and arc42 (building block,
// deployment), common architecture terms (gateway, worker, queue, data store, oracle); sentence case, two words at most
export const KIND_TXT = {
  user: "User", app: "Web app", wallet: "Wallet", server: "Server", api: "API service", gateway: "Gateway", engine: "Core engine",
  math: "Calculation", worker: "Worker", queue: "Queue", cache: "Cache", relay: "Transaction relayer", clock: "Scheduled job", alert: "Monitoring",
  contract: "Smart contract", oracle: "Oracle", swap: "DEX", token: "Token", feed: "Data feed", stream: "Data stream",
  external: "External system", chain: "Blockchain", database: "Data store", cloud: "Hosting", cdn: "CDN", research: "Research",
  test: "Test harness", key: "Secrets", chart: "Analytics", deploy: "Deployment", security: "Security", auth: "Identity provider",
  code: "Module", group: "Group",
  mobile: "Mobile app", desktop: "Desktop app", extension: "Extension", game: "Game client", admin: "Admin panel", ai: "AI model", payment: "Payments", email: "Email and messages", notify: "Notifications", storage: "File storage", sheet: "Spreadsheet", search: "Search", cms: "CMS", media: "Media", webhook: "Webhook", device: "Device", docs: "Documentation",
  cli: "Command line", site: "Website", team: "Team", agent: "AI agent", vector: "Vector database", pipeline: "Data pipeline", warehouse: "Data warehouse", events: "Event bus", logs: "Logs", container: "Container", lb: "Load balancer", network: "Network", dns: "Domain", infra: "Infrastructure as code", ci: "CI", repo: "Code repository", package: "Package", automation: "Automation", chat: "Chat", realtime: "Realtime server", video: "Video and calls", maps: "Maps and location", calendar: "Calendar", flags: "Feature flags", firmware: "Firmware", backup: "Backup", bridge: "Cross-chain bridge", indexer: "Indexer", other: "Not in the library yet",
  mcp: "Tool server", scraper: "Scraper", training: "Training", gpu: "GPU compute", evals: "Evals", speech: "Speech", dataset: "Dataset", ui: "Design system", i18n: "Translations", function: "Serverless function", crm: "CRM", shop: "Store", ledger: "Ledger", kyc: "Identity check", org: "Organization", governance: "Governance", xr: "Mixed reality",
  sandbox: "Code sandbox", proxy: "Proxy", coordination: "Coordination", workflow: "Workflow engine", parser: "Document parser", connector: "Connector", renderer: "Renderer", browser: "Headless browser", federation: "Federation", p2p: "Peer network", os: "Operating system", telephony: "Phone and SIP", shipping: "Shipping", erp: "ERP", gameserver: "Game server"
};

const picked = new Set();   // selected cards (Shift+click, marquee, Cmd+A): move together

export function init(ctx) {
  C = ctx; S = ctx.S;
  stage = C.$("#d2"); world = C.$("#world"); svg = C.$("#edges"); zonesEl = C.$("#zones"); labsEl = C.$("#elabels");
  const box = document.createElement("div"); box.id = "marquee"; box.hidden = true; stage.appendChild(box);
  const toWorld = (cx, cy) => { const r = stage.getBoundingClientRect(); return { x: (cx - r.left - T.x) / T.k, y: (cy - r.top - T.y) / T.k }; };
  // background: drag = pan the view; Shift + drag = selection marquee; a section title = move the section
  let pan = null, mq = null, sec = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".card") || e.target.classList.contains("edge-hit")) return;
    const zh = e.target.closest(".zh");
    if (zh) {
      const ids = [...cards.keys()].filter((id) => C.groupOf(id) === zh.dataset.g);
      sec = startMove(ids, ids[0], e); stage.setPointerCapture(e.pointerId); zh.parentElement.classList.add("grab"); return;
    }
    if (e.shiftKey) {
      mq = { x: e.clientX, y: e.clientY, base: new Set(picked) };
      stage.setPointerCapture(e.pointerId); return;
    }
    pan = { x: e.clientX, y: e.clientY, tx: T.x, ty: T.y, moved: false };
    stage.setPointerCapture(e.pointerId); stage.classList.add("panning");
  });
  stage.addEventListener("pointermove", (e) => {
    if (sec) { dragMove(sec, e); return; }
    if (mq) {
      const r = stage.getBoundingClientRect(), x0 = Math.min(mq.x, e.clientX), y0 = Math.min(mq.y, e.clientY), x1 = Math.max(mq.x, e.clientX), y1 = Math.max(mq.y, e.clientY);
      Object.assign(box.style, { left: `${x0 - r.left}px`, top: `${y0 - r.top}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` }); box.hidden = false;
      const a = toWorld(x0, y0), b = toWorld(x1, y1);
      picked.clear(); mq.base.forEach((id) => picked.add(id));
      cards.forEach((_, id) => { const q = rectOf(id); if (q.x < b.x && q.x + q.w > a.x && q.y < b.y && q.y + q.h > a.y) picked.add(id); });
      paintPicked(); return;
    }
    if (!pan) return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
    T.x = pan.tx + dx; T.y = pan.ty + dy; fitted = false; touchedAt = Date.now(); apply();
  });
  const end = () => {
    if (sec) { dragEnd(sec); zonesEl.querySelectorAll(".grab").forEach((z) => z.classList.remove("grab")); sec = null; return; }
    if (mq) { box.hidden = true; mq = null; return; }
    if (pan && !pan.moved) { C.closePanel(); clearPicked(); C.blank(); }
    pan = null; stage.classList.remove("panning");
  };
  stage.addEventListener("pointerup", end); stage.addEventListener("pointercancel", end);
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.012));
    else { T.x -= e.deltaX; T.y -= e.deltaY; apply(); }
  }, { passive: false });

  // keyboard (2D view): Cmd+Z / Cmd+Shift+Z, Cmd+A, Cmd+C, arrows to nudge the selection (Shift: 10 px), Escape
  let nudgeT = 0;
  window.addEventListener("keydown", (e) => {
    if (!awake || e.target.matches("input, textarea")) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === "z") { e.preventDefault(); C.stepHist(!e.shiftKey); return; }
    if (mod && k === "y") { e.preventDefault(); C.stepHist(false); return; }
    if (mod && k === "a") { e.preventDefault(); cards.forEach((_, id) => picked.add(id)); paintPicked(); return; }
    if (mod && k === "c") { const t = copyText(); if (t) { e.preventDefault(); navigator.clipboard.writeText(t).then(() => C.toast(`${selIds().length} block${selIds().length > 1 ? "s" : ""} copied`)); } return; }
    if (e.key === "Escape") { clearPicked(); return; }
    const AR = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (AR && !mod) {
      const ids = selIds(); if (!ids.length) return;
      e.preventDefault();
      if (performance.now() - nudgeT > 800) C.pushHist();
      nudgeT = performance.now();
      const st = e.shiftKey ? 10 : 1;
      ordered(ids).forEach((id) => { const p = C.pos(id); C.moveNode(id, p.x + AR[0] * st, p.y + AR[1] * st, false); });
      place(); C.saveLayout();
    }
  });
}

// current selection: the picked cards, otherwise the card open in the panel
function selIds() {
  if (picked.size) return [...picked].filter((id) => cards.has(id));
  return S.sel && S.sel.startsWith("node:") && cards.has(S.sel.slice(5)) ? [S.sel.slice(5)] : [];
}
// parents before children: moving a parent already carries its saved children
function ordered(ids) { const set = new Set(ids); return C.view().nodes.map(({ n }) => n.id).filter((id) => set.has(id)); }
function paintPicked() { cards.forEach((d, id) => d.classList.toggle("picked", picked.has(id))); }
function clearPicked() { if (picked.size) { picked.clear(); paintPicked(); } }
function copyText() {
  const ids = selIds(); if (!ids.length) return "";
  return ids.map((id) => {
    const n = S.byId[id], files = (n.files || []).map((f) => `  - ${typeof f === "string" ? f : `${f.path}${f.role ? `: ${f.role}` : ""}`}`).join("\n");
    return `${n.label} (${id})\n${n.summary || ""}${files ? `\n${files}` : ""}`;
  }).join("\n\n");
}

// moving a set of cards: start from the initial positions, the grabbed card acts as the magnet
function startMove(ids, lead, e) {
  return { ids: ordered(ids), lead, x: e.clientX, y: e.clientY, base: new Map(ids.map((id) => [id, { ...C.pos(id) }])), moved: false };
}
function dragMove(m, e) {
  const dx = (e.clientX - m.x) / T.k, dy = (e.clientY - m.y) / T.k;
  if (!m.moved && Math.abs(dx) + Math.abs(dy) < 4) return false;
  if (!m.moved) { m.moved = true; C.pushHist(); C.hover(null); m.ids.forEach((id) => cards.get(id)?.classList.add("dragging")); }
  setAll(m, dx, dy); place(m.ids.length === 1 ? m.ids[0] : true);
  clearTimeout(rerouteT); rerouteT = setTimeout(() => { if (m.moved) place(); }, 110);
  return true;
}
function setAll(m, dx, dy) { m.ids.forEach((id) => { const b = m.base.get(id); C.moveNode(id, b.x + dx, b.y + dy, false); }); }
function dragEnd(m) {
  clearTimeout(rerouteT);
  if (!m.moved) return false;
  const b = m.base.get(m.lead), p = C.pos(m.lead), s = C.snap(m.lead, p.x, p.y, new Set(m.ids));
  setAll(m, s.x - b.x, s.y - b.y);
  m.ids.forEach((id) => cards.get(id)?.classList.remove("dragging"));
  place(); C.saveLayout();
  return true;
}

function rectOf(id) {
  const n = S.byId[id], p = C.pos(id);
  const w = C.small(n) ? C.CARD.sw : C.CARD.w, h = C.cardH(n);
  return { x: p.x, y: p.y, w, h, cx: p.x + w / 2, cy: p.y + h / 2 };
}

function cardHTML(n) {
  // a neighbour at the edge of a block's page folds nothing: a double-click goes into it
  const st = C.nodeStatus(n.id), kids = C.isPill(n.id) ? 0 : (S.kids[n.id] || []).length;
  // a block with parts says so on its face: its parts shown here (+ / -), or Open to go into it (as a double-click does)
  const open = C.isExpanded(n.id), id = C.esc(n.id);
  const exp = kids ? `<span class="chip exp" data-exp="${id}" title="${open ? "Hide its parts" : "Show its parts here"}">${C.icon(open ? "minus" : "plus", 12)}${C.small(n) ? kids : open ? "Hide parts" : `${kids} part${kids > 1 ? "s" : ""}`}</span>` : "";
  const go = kids ? `<span class="chip exp" data-open="${id}" title="Go into this block: its parts fill the page (double-click it does the same)">${C.icon("maximize", 12)}Open</span>` : "";
  if (C.small(n)) {
    return `<div class="ch"><span class="ico">${C.icon(C.kindIcon(n.kind), 13)}</span><span class="kl">${C.esc(n.label)}</span>${exp}${C.stWord(st)}</div>`;
  }
  const m = C.metricOf(n), todos = C.openTodos(n);
  return `<div class="ch"><span class="ico">${C.icon(C.kindIcon(n.kind), 14)}</span><span class="kl">${C.esc(n.tag || KIND_TXT[n.kind] || (n.tech || [])[0] || KIND_TXT.other)}</span>${go}</div>
    <div class="ct">${C.esc(n.label)}</div>
    ${m ? `<div class="cm"><b>${C.esc(m.value)}</b><span>${C.esc(m.label)}</span></div>` : `<div class="cs">${C.esc(n.summary || "")}</div>`}
    <div class="cf">${st !== "unknown" ? `<span class="chip ${st}">${C.STATUS_TXT[st]}</span>` : ""}${todos ? `<span class="chip">${todos} to do</span>` : ""}${exp}</div>`;
}

export function render(fit) {
  awake = true;
  const v = C.view();
  const ids = new Set(v.nodes.map(({ n }) => n.id));
  // cards
  cards.forEach((d, id) => { if (!ids.has(id)) { d.remove(); cards.delete(id); } });
  v.nodes.forEach(({ n }) => {
    let d = cards.get(n.id);
    if (!d) { d = document.createElement("div"); d.dataset.id = n.id; bindCard(d, n.id); C.$("#cards").appendChild(d); cards.set(n.id, d); }
    d.className = `card ${C.small(n) ? "s" : ""}${picked.has(n.id) ? " picked" : ""}`;
    d.style.height = C.cardH(n) + "px";
    d.innerHTML = cardHTML(n);
  });
  // links
  svg.innerHTML = ""; labsEl.innerHTML = ""; edges.clear();
  const NS = "http://www.w3.org/2000/svg";
  runner = document.createElementNS(NS, "circle"); runner.setAttribute("r", 4.5); runner.setAttribute("class", "runner"); runner.style.display = "none";
  v.edges.forEach((e) => {
    const path = document.createElementNS(NS, "path"); path.setAttribute("class", "edge");
    const hit = document.createElementNS(NS, "path"); hit.setAttribute("class", "edge-hit");
    hit.addEventListener("pointerenter", (ev) => C.hover(e.selKey, ev, e));
    hit.addEventListener("pointermove", (ev) => C.moveTip(ev));
    hit.addEventListener("pointerleave", () => C.hover(null));
    hit.addEventListener("click", (ev) => { ev.stopPropagation(); C.select(e.selKey); });
    svg.appendChild(path); svg.appendChild(hit);
    const lab = document.createElement("div"); lab.className = "elabel"; lab.textContent = e.label; labsEl.appendChild(lab);
    edges.set(e.key, { path, hit, lab, e });
  });
  svg.appendChild(runner);
  place();
  paint(true);
  if (fit) requestAnimationFrame(() => zoom("fit", true));
  loop();
}

function bindCard(d, id) {
  let drag = null;
  d.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest("[data-exp]")) { e.stopPropagation(); return; }
    e.stopPropagation();
    // Shift or Cmd + click: adds or removes the card from the selection
    if (e.shiftKey || e.metaKey || e.ctrlKey) { picked.has(id) ? picked.delete(id) : picked.add(id); paintPicked(); return; }
    const group = picked.has(id) && picked.size > 1 ? [...picked].filter((x) => cards.has(x)) : [id];
    drag = startMove(group, id, e);
    d.setPointerCapture(e.pointerId);
  });
  d.addEventListener("pointermove", (e) => { if (drag) dragMove(drag, e); });
  const up = () => {
    if (!drag) return;
    if (!dragEnd(drag)) { clearPicked(); C.select(`node:${id}`); }
    drag = null;
  };
  d.addEventListener("pointerup", up); d.addEventListener("pointercancel", up);
  d.addEventListener("click", (e) => {
    const ex = e.target.closest("[data-exp]"), go = e.target.closest("[data-open]");
    if (ex) { e.stopPropagation(); C.toggleExpand(ex.dataset.exp); }
    if (go) { e.stopPropagation(); C.openRoom(go.dataset.open); }
  });
  // double-click, or its Open button: go into the block (its parts fill the page, its neighbours at the edges)
  d.addEventListener("dblclick", (e) => { if (e.target.closest("[data-exp], [data-open]")) return; e.stopPropagation(); C.openRoom(id); });
  d.addEventListener("pointerenter", (e) => { if (!drag) C.hover(`node:${id}`, e); });
  d.addEventListener("pointermove", (e) => C.moveTip(e));
  d.addEventListener("pointerleave", () => { if (!drag) C.hover(null); });
}

/* curved link (while a card is being dragged): exit side, arrival side, then the attachment given by spreadCurves */
function curveSides(e) {
  const a = rectOf(e.source), b = rectOf(e.target);
  if (b.x >= a.x + a.w + 8 || b.x + b.w <= a.x - 8) {
    const right = b.x >= a.x + a.w + 8;
    return { a, b, sa: right ? "r" : "l", sb: right ? "l" : "r" };
  }
  const down = b.cy > a.cy;
  // neighbours in the same column: go around on the right so the link stays visible
  if (Math.abs(a.cx - b.cx) < 40 && Math.abs((down ? b.y - a.y - a.h : a.y - b.y - b.h)) < 90) return { a, b, sa: "r", sb: "r", loop: true };
  return { a, b, sa: down ? "b" : "t", sb: down ? "t" : "b" };
}
const sidePt = (r, side, u) => side === "r" ? { x: r.x + r.w, y: r.y + u } : side === "l" ? { x: r.x, y: r.y + u } : side === "b" ? { x: r.x + u, y: r.y + r.h } : { x: r.x + u, y: r.y };
/* spreads the links on one side of a card while dragging: the curves and already-routed cables sharing that side
   get evenly spaced attachments together, in the order of their other end; returns the curves and the shifted routes */
function spreadCurves(list, fixed) {
  const sides = new Map(), out = new Map(), moved = new Map();
  const add = (id, side, r, item) => {
    const k = `${id}|${side}`;
    if (!sides.has(k)) sides.set(k, { r, vert: side === "r" || side === "l", list: [], curves: 0 });
    const g = sides.get(k); g.list.push(item); if (item.g) g.curves++;
  };
  list.forEach((o) => {
    const g = curveSides(o.e); out.set(o.e.key, g);
    const vs = (s) => s === "r" || s === "l";
    add(o.e.source, g.sa, g.a, { g, end: "a", at: vs(g.sa) ? g.b.cy : g.b.cx });
    add(o.e.target, g.sb, g.b, { g, end: "b", at: vs(g.sb) ? g.a.cy : g.a.cx });
  });
  // ends of routed cables: side recovered from the attachment point
  fixed.forEach((o) => {
    const pts = routes[o.e.key];
    [[0, o.e.source], [1, o.e.target]].forEach(([end, id]) => {
      const r = rectOf(id), p = pts[end ? pts.length - 1 : 0];
      const side = Math.abs(p[0] - (r.x + r.w)) < 0.5 ? "r" : Math.abs(p[0] - r.x) < 0.5 ? "l" : Math.abs(p[1] - (r.y + r.h)) < 0.5 ? "b" : "t";
      add(id, side, r, { key: o.e.key, end, at: side === "r" || side === "l" ? p[1] : p[0] });
    });
  });
  sides.forEach(({ r, vert, list, curves }) => {
    if (!curves) return;   // side without a curve: cables keep their exact route
    list.sort((p, q) => p.at - q.at);
    const L = vert ? r.h : r.w, n = list.length, step = Math.min(L / (n + 1), 56), o0 = vert ? r.y : r.x;
    list.forEach((p, i) => {
      const u = L / 2 + (i - (n - 1) / 2) * step;
      if (p.g) p.g[p.end === "a" ? "ua" : "ub"] = u;
      else moved.set(p.key, moveEnd(moved.get(p.key) || routes[p.key], p.end, o0 + u));
    });
  });
  return { curves: out, moved };
}
function geom(g) {
  const { a, b, sa, sb } = g, p1 = sidePt(a, sa, g.ua), p2 = sidePt(b, sb, g.ub);
  let c1, c2;
  if (g.loop) { c1 = { x: p1.x + 40, y: p1.y }; c2 = { x: p2.x + 40, y: p2.y }; }
  else if (sa === "r" || sa === "l") {
    const dx = Math.max(36, Math.abs(p2.x - p1.x) * 0.45) * (sa === "r" ? 1 : -1);
    c1 = { x: p1.x + dx, y: p1.y }; c2 = { x: p2.x - dx, y: p2.y };
  } else {
    const dy = Math.max(24, Math.abs(p2.y - p1.y) * 0.45) * (sa === "b" ? 1 : -1);
    c1 = { x: p1.x, y: p1.y + dy }; c2 = { x: p2.x, y: p2.y - dy };
  }
  const mid = { x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8, y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8 };
  return { d: `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`, mid };
}

/* routed link: straight segments, rounded corners; the midpoint is used to place the label */
function routedGeom(pts) {
  const R = 12;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1];
    const l1 = Math.hypot(bx - ax, by - ay), l2 = Math.hypot(cx - bx, cy - by), r = Math.min(R, l1 / 2, l2 / 2);
    if (r < 0.5) { d += ` L${bx},${by}`; continue; }
    d += ` L${bx - (bx - ax) / l1 * r},${by - (by - ay) / l1 * r} Q${bx},${by} ${bx + (cx - bx) / l2 * r},${by + (cy - by) / l2 * r}`;
  }
  const last = pts[pts.length - 1]; d += ` L${last[0]},${last[1]}`;
  // midpoint of the path (by length)
  let tot = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); tot += l; }
  let half = tot / 2, mid = { x: pts[0][0], y: pts[0][1] };
  for (let i = 0; i < seg.length; i++) {
    if (half <= seg[i]) { const u = seg[i] ? half / seg[i] : 0; mid = { x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u }; break; }
    half -= seg[i];
  }
  return { d, mid };
}

/* places a link's label: on a straight segment (centred on the line) or just beside it (offset off the line),
   never on a card, a section title, another label or another cable; a horizontal segment is preferred */
const LH = 20, LM = 8;
function labelSpot(pts, w, boxes, placed, segs) {
  if (!w) return { x: pts[0][0], y: pts[0][1] };
  const over = (r, q) => Math.max(0, Math.min(r.x1, q.x1) - Math.max(r.x0, q.x0)) * Math.max(0, Math.min(r.y1, q.y1) - Math.max(r.y0, q.y0));
  let tot = 0; for (let i = 1; i < pts.length; i++) tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let best = null, run = 0;
  const score = (x, y, base, along) => {
    const r = { x0: x - w / 2 - 4, x1: x + w / 2 + 4, y0: y - LH / 2 - 3, y1: y + LH / 2 + 3 };
    let sc = base;
    boxes.forEach((b) => { sc += over(r, { x0: b.x - 4, x1: b.x + b.w + 4, y0: b.y - 4, y1: b.y + b.h + 4 }) * 50; });
    placed.forEach((q) => { sc += over(r, q) * 20; });
    // do not hide neighbouring cables
    segs.forEach((g) => { if (g.pts !== pts && g.x1 >= r.x0 && g.x0 <= r.x1 && g.y1 >= r.y0 && g.y0 <= r.y1) sc += 250; });
    sc += Math.abs(along - tot / 2) * 0.04;
    if (!best || sc < best.sc) best = { sc, x, y, r };
  };
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], horiz = Math.abs(by - ay) < 0.5, L = Math.hypot(bx - ax, by - ay);
    // length of segment covered by the label: its width if placed on a horizontal line, its height otherwise
    const need = (horiz ? w : LH) + 2 * LM;
    const lo = Math.min(need / 2, L / 2), n = Math.max(1, Math.floor((L - 2 * lo) / 8));
    for (let k = 0; k <= n; k++) {
      const u = (lo + (L - 2 * lo) * (n ? k / n : 0.5)) / (L || 1);
      const x = ax + (bx - ax) * u, y = ay + (by - ay) * u, along = run + L * u, short = L < need ? 400 : 0;
      if (horiz) {
        score(x, y, short, along);
        score(x, y - LH / 2 - 4, 40 + (L < w ? 120 : 0), along); score(x, y + LH / 2 + 4, 40 + (L < w ? 120 : 0), along);
      } else {
        score(x, y, 90 + short, along);
        score(x - w / 2 - 6, y, 35, along); score(x + w / 2 + 6, y, 35, along);
      }
    }
    run += L;
  }
  placed.push(best.r);
  return { x: best.x, y: best.y };
}

function computeRoutes(zoneRects) {
  const boxes = {};
  cards.forEach((_, id) => { const r = rectOf(id); boxes[id] = { x: r.cx, z: r.cy, hw: r.w / 2, hd: r.h / 2 }; });
  // group titles: cables pass beside them, never over them
  zonesEl.querySelectorAll(".zh").forEach((h, k) => {
    const z = zoneRects[k]; if (!z) return;
    const w = h.offsetWidth + 8, x = z.x0 + 14 + w / 2, y = z.z0 + 18;
    boxes[`__zh${k}`] = { x, z: y, hw: w / 2, hd: 9 };
  });
  // cables to the neighbours at the edges of a block's page stay simple curves: they only show on hover
  const links = [...edges.values()].filter((o) => !o.e.away).map((o) => ({ key: o.e.key, s: o.e.source, t: o.e.target })).filter((l) => boxes[l.s] && boxes[l.t]);
  // 8 px grid, at least 16 px between two parallel cables, 14 px between a cable and a block
  routes = routeAll(boxes, links, { pitch: 8, pad: 14, bend: 8, nearBend: 14, margin: 160, near: 16, spread: 2, repel: 7, same: 400, cross: 3, portGap: 2, zones: zoneRects });
}

function place(fast) {
  cards.forEach((d, id) => { const p = C.pos(id); d.style.transform = `translate(${p.x}px,${p.y}px)`; });
  // group zones around their cards
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const zones = [], zoneRects = [];
  C.groupsNow().forEach((g) => {
    const gid = [...cards.keys()].filter((id) => C.groupOf(id) === g.id), rs = gid.map(rectOf);
    if (!rs.length) return;
    const x0 = Math.min(...rs.map((r) => r.x)) - 14, y0 = Math.min(...rs.map((r) => r.y)) - 38;
    const x1 = Math.max(...rs.map((r) => r.x + r.w)) + 14, y1 = Math.max(...rs.map((r) => r.y + r.h)) + 14;
    zoneRects.push({ x0, z0: y0, x1, z1: y1, ids: gid });
    zones.push(`<div class="zone" style="left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px"><div class="zh" data-g="${C.esc(g.id)}" title="Drag to move the section"><i style="background:${C.esc(g.color)}"></i>${C.esc(g.label)}</div></div>`);
    minX = Math.min(minX, x0); minY = Math.min(minY, y0); maxX = Math.max(maxX, x1); maxY = Math.max(maxY, y1);
  });
  zonesEl.innerHTML = zones.join("");
  if (!isFinite(minX)) { minX = minY = 0; maxX = maxY = 100; }
  const pad = 400;
  svg.setAttribute("viewBox", `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`);
  Object.assign(svg.style, { left: `${minX - pad}px`, top: `${minY - pad}px`, width: `${maxX - minX + 2 * pad}px`, height: `${maxY - minY + 2 * pad}px` });
  svg.setAttribute("width", maxX - minX + 2 * pad); svg.setAttribute("height", maxY - minY + 2 * pad);
  // full link routing on every change; while a card is being dragged, its links stay simple curves
  if (!fast) computeRoutes(zoneRects);
  const placed = [], boxes = [...cards.keys()].map(rectOf), segs = [];
  zonesEl.querySelectorAll(".zh").forEach((h, k) => { const z = zoneRects[k]; if (z) boxes.push({ x: z.x0 + 10, y: z.z0 + 6, w: h.offsetWidth + 10, h: 22 }); });
  Object.values(routes).forEach((pts) => { for (let i = 1; i < pts.length; i++) segs.push({ pts, x0: Math.min(pts[i - 1][0], pts[i][0]), x1: Math.max(pts[i - 1][0], pts[i][0]), y0: Math.min(pts[i - 1][1], pts[i][1]), y1: Math.max(pts[i - 1][1], pts[i][1]) }); });
  const isMoving = (o) => fast === true || (fast && (o.e.source === fast || o.e.target === fast)) || !(routes[o.e.key] && routes[o.e.key].length > 1);
  const all = [...edges.values()], sp = spreadCurves(all.filter(isMoving), all.filter((o) => !isMoving(o)));
  const curves = sp.curves;
  all.sort((a, b) => C.labelW(b.e.label) - C.labelW(a.e.label)).forEach((o) => {
    const moving = isMoving(o), pts = !moving && (sp.moved.get(o.e.key) || routes[o.e.key]);
    const g = moving ? geom(curves.get(o.e.key)) : routedGeom(pts);
    o.path.setAttribute("d", g.d); o.hit.setAttribute("d", g.d);
    const at = pts && pts.length > 1 ? labelSpot(pts, C.labelW(o.e.label), boxes, placed, segs) : g.mid;
    o.lab.style.left = at.x + "px"; o.lab.style.top = at.y + "px";
  });
  // the framing accounts for cables that go around the map at the top or bottom
  const fb = { minX, minY, maxX, maxY };
  Object.values(routes).forEach((pts) => pts.forEach(([x, y]) => { fb.minX = Math.min(fb.minX, x - 12); fb.maxX = Math.max(fb.maxX, x + 12); fb.minY = Math.min(fb.minY, y - 12); fb.maxY = Math.max(fb.maxY, y + 12); }));
  S.__bounds = fb;
}

export function paint() {
  if (!awake) return;
  const f = C.focusSet();
  const steps = C.flowSteps();
  cards.forEach((d, id) => {
    const n = S.byId[id], st = C.nodeStatus(id);
    const dim = (f && !f.has(`n:${id}`)) || (S.search && !C.matches(n));
    d.classList.toggle("dim", !!dim);
    d.classList.toggle("sel", S.sel === `node:${id}`);
    d.classList.toggle("match", !!(S.search && C.matches(n)));
    d.classList.toggle("warn", st === "warn"); d.classList.toggle("fail", st === "fail");
    const html = cardHTML(n);
    if (d.__html !== html) { d.innerHTML = html; d.__html = html; }
  });
  const hk = S.hover || S.sel;
  edges.forEach((o, k) => {
    const st = C.edgeStatus(o.e), dim = f && !f.has(`e:${k}`);
    // colour read from the tokens on every paint: the theme chosen in Customize applies immediately
    o.path.style.stroke = `var(--mira-${{ ok: "ok", warn: "warn", fail: "bad", off: "off" }[st] || "edge"})`;
    o.path.classList.toggle("dim", !!dim || !!S.search);
    o.path.classList.toggle("quiet", !f && !S.search && edges.size > 12);
    const away = !!o.e.away && !(f && f.has(`e:${k}`));
    o.path.classList.toggle("away", away); o.hit.style.pointerEvents = away ? "none" : "";
    o.path.classList.toggle("flow", st === "ok" && !dim);
    o.path.classList.toggle("hot", !!(f && f.has(`e:${k}`) && (S.flow || hk)));
    const fs = steps.filter((s) => s.edge === k);
    if (S.flow && fs.length) {
      o.lab.textContent = fs.map((s) => s.i + 1).join(", ") + (o.e.label ? `  ${o.e.label}` : "");
      o.lab.classList.toggle("step", fs.some((s) => s.i === S.flowStep));
      o.lab.classList.toggle("on", S.flowStep < 0 || fs.some((s) => s.i === S.flowStep));
    } else {
      o.lab.textContent = o.e.label; o.lab.classList.remove("step");
      o.lab.classList.toggle("on", !!(f && f.has(`e:${k}`) && !S.flow && hk) || (T.k > 1.35 && !o.e.away));
    }
  });
}

// the flow's dot slides along the link of the current step
function loop() {
  cancelAnimationFrame(raf);
  const tick = (t) => {
    if (!awake) return;
    const s = S.flow && S.flowStep >= 0 ? C.flowSteps()[S.flowStep] : null;
    const o = s && s.edge && edges.get(s.edge);
    if (o) {
      const L = o.path.getTotalLength(), u = ((t % 1800) / 1800);
      const p = o.path.getPointAtLength((s.rev ? 1 - u : u) * L);
      runner.style.display = ""; runner.setAttribute("cx", p.x); runner.setAttribute("cy", p.y);
    } else if (runner) runner.style.display = "none";
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

function apply(anim) {
  world.style.transition = anim ? "transform .45s cubic-bezier(.2,.7,.2,1)" : "none";
  world.style.transform = `translate(${T.x}px,${T.y}px) scale(${T.k})`;
  stage.style.backgroundPosition = `${T.x}px ${T.y}px`;
  stage.style.backgroundSize = `${22 * T.k}px ${22 * T.k}px`;
  if (!anim) paintLabelsZoom();
}
let lastK = 1;
// the view stays fitted to its pane until the user pans or zooms by hand
let fitted = true;
let touchedAt = 0;   // last time the user moved the view by hand
function paintLabelsZoom() { if ((lastK > 1.35) !== (T.k > 1.35)) { lastK = T.k; paint(); } lastK = T.k; }
function zoomAt(cx, cy, f) {
  const r = stage.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
  const k = Math.min(2.5, Math.max(0.25, T.k * f));
  T.x = x - (x - T.x) * (k / T.k); T.y = y - (y - T.y) * (k / T.k); T.k = k; fitted = false; touchedAt = Date.now(); apply();
}
export function zoom(kind, instant) {
  const r = stage.getBoundingClientRect();
  if (kind === "in") return zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25);
  if (kind === "out") return zoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8);
  const b = S.__bounds; if (!b) return;
  const panel = C.$("#panel").hidden ? 0 : 420;
  const W = r.width - panel, H = r.height, w = b.maxX - b.minX, h = b.maxY - b.minY;
  const k = Math.min(1.15, (W - 60) / w, (H - 60) / h);
  // a narrow pane (map beside a terminal): never shrink below readable, start from the top left instead
  const kk = Math.max(0.6, k);
  T.k = kk;
  T.x = w * kk <= W - 60 ? (W - w * kk) / 2 - b.minX * kk : 24 - b.minX * kk;
  T.y = h * kk <= H - 60 ? (H - h * kk) / 2 - b.minY * kk : 24 - b.minY * kk;
  fitted = true;
  apply(!instant);
}
export function focus(key) {
  if (!key.startsWith("node:")) return;
  const id = key.slice(5); if (!cards.has(id)) return;
  const r = stage.getBoundingClientRect(), q = rectOf(id), W = r.width - (C.$("#panel").hidden ? 0 : 420);
  T.x = W / 2 - q.cx * T.k; T.y = r.height / 2 - q.cy * T.k; apply(true);
}
/* a block being worked on: its card pulses for a while; the camera goes there unless the user moved the view lately */
export const has = (id) => cards.has(id);
const busyT = new Map();
export function busy(id, move) {
  const d = cards.get(id); if (!d) return false;
  d.classList.add("busy");
  clearTimeout(busyT.get(id));
  busyT.set(id, setTimeout(() => d.classList.remove("busy"), 8000));
  if (move && Date.now() - touchedAt > 10000) { focus("node:" + id); fitted = false; }
  return true;
}
export function resize() { if (!awake) return; place(); if (fitted) zoom("fit", true); }
export function sleep() { awake = false; cancelAnimationFrame(raf); }
