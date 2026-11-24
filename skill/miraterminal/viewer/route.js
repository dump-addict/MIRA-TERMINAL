/* Cable routing in the style of a wiring diagram: straight segments on a grid that go around the blocks,
   turn as little as possible and never overlap (two parallel cables take two neighbouring lanes).
   A* search over (cell, direction): a turn costs, a cell already taken in the same direction costs a lot, a crossing a little.
   opt.spread (in cells): parallel cables keep at least this gap (neighbouring lanes are penalised) instead of sticking together;
   the attachment points on one side of a block are spread along that side, never merged. */

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

class Heap {
  constructor() { this.a = []; }
  push(v, k) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top[1];
  }
  get size() { return this.a.length; }
}

/* boxes: { id: { x, z, hw, hd } } (centre and half-sizes), links: [{ key, s, t }]
   returns { key: [[x, z], ...] }: waypoints, from the edge of the source block to the edge of the target block */
export function routeAll(boxes, links, opt = {}) {
  const NEARD = opt.near ?? 0.8, h = opt.pitch || 0.4, pad = opt.pad ?? 0.3, BEND = opt.bend ?? 4, SAME = opt.same ?? 40, CROSS = opt.cross ?? 2, NEAR = 0.3, ZONE = opt.zone ?? 0.6;
  const NEARBEND = opt.nearBend ?? 0, SPREAD = opt.spread || 0, HUG = SPREAD ? 0 : opt.hug ?? 0.35, REPEL = opt.repel ?? 6, PORTGAP = opt.portGap ?? Math.max(2, SPREAD);
  const ids = Object.keys(boxes); if (!ids.length) return {};
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  ids.forEach((id) => { const b = boxes[id]; x0 = Math.min(x0, b.x - b.hw); x1 = Math.max(x1, b.x + b.hw); z0 = Math.min(z0, b.z - b.hd); z1 = Math.max(z1, b.z + b.hd); });
  const M = opt.margin ?? 4; x0 -= M; z0 -= M; x1 += M; z1 += M;
  const W = Math.ceil((x1 - x0) / h) + 1, H = Math.ceil((z1 - z0) / h) + 1, N = W * H;
  const cx = (x) => Math.round((x - x0) / h), cz = (z) => Math.round((z - z0) / h);
  const wx = (i) => x0 + i * h, wz = (j) => z0 + j * h;
  // owner[c] = index of the block occupying the cell (+1), 0 if free
  const owner = new Int32Array(N), near = new Uint8Array(N);
  ids.forEach((id, k) => {
    const b = boxes[id];
    for (let i = Math.max(0, cx(b.x - b.hw - pad)); i <= Math.min(W - 1, cx(b.x + b.hw + pad)); i++)
      for (let j = Math.max(0, cz(b.z - b.hd - pad)); j <= Math.min(H - 1, cz(b.z + b.hd + pad)); j++) owner[j * W + i] = k + 1;
    // a margin around blocks costs a little: cables run down the middle of the aisles
    for (let i = Math.max(0, cx(b.x - b.hw - pad - NEARD)); i <= Math.min(W - 1, cx(b.x + b.hw + pad + NEARD)); i++)
      for (let j = Math.max(0, cz(b.z - b.hd - pad - NEARD)); j <= Math.min(H - 1, cz(b.z + b.hd + pad + NEARD)); j++) near[j * W + i] = 1;
  });
  const useH = new Uint8Array(N), useV = new Uint8Array(N);  // cell taken by a horizontal / vertical cable
  // zones (group plates): crossing another group's costs a little, cables run in the aisles
  const zoneOf = new Int16Array(N).fill(-1), zones = opt.zones || [];
  zones.forEach((zn, k) => {
    for (let i = Math.max(0, cx(zn.x0)); i <= Math.min(W - 1, cx(zn.x1)); i++)
      for (let j = Math.max(0, cz(zn.z0)); j <= Math.min(H - 1, cz(zn.z1)); j++) zoneOf[j * W + i] = k;
  });
  const zoneIdx = {}; zones.forEach((zn, k) => zn.ids.forEach((id) => { zoneIdx[id] = k; }));
  
  // ports already taken: cell -> 1; two cables never leave from the same point, nor from two points too close together
  const portUsed = new Uint8Array(N);
  const portNear = (c, horizSide) => {
    let k = 0;
    for (let s = 1; s <= PORTGAP; s++) {
      const a = horizSide ? c - s * W : c - s, b = horizSide ? c + s * W : c + s;
      if ((a >= 0 && portUsed[a]) || (b < N && portUsed[b])) k += PORTGAP + 1 - s;
    }
    return k;
  };
  // ports: cells just outside one side of the block, exit direction
  function ports(id, other, fix) {
    const b = boxes[id], o = boxes[other], out = [];
    if (fix) {
      // 2nd pass: a single attachment, on the side and at the height decided in the 1st pass (nearest cell)
      const [dx, dz] = DIRS[fix.side];
      const i = dx ? (dx > 0 ? cx(b.x + b.hw + pad) + 1 : cx(b.x - b.hw - pad) - 1) : cx(fix.v);
      const j = dz ? (dz > 0 ? cz(b.z + b.hd + pad) + 1 : cz(b.z - b.hd - pad) - 1) : cz(fix.v);
      if (i >= 0 && j >= 0 && i < W && j < H && !owner[j * W + i]) return [{ c: j * W + i, d: fix.side, cost: 0 }];
    }
    const sides = [
      [1, 0, cx(b.x + b.hw + pad) + 1, null], [-1, 0, cx(b.x - b.hw - pad) - 1, null],
      [0, 1, null, cz(b.z + b.hd + pad) + 1], [0, -1, null, cz(b.z - b.hd - pad) - 1],
    ];
    for (const [dx, dz, fi, fj] of sides) {
      const facing = dx ? Math.sign(o.x - b.x) === dx && Math.abs(o.x - b.x) > b.hw : Math.sign(o.z - b.z) === dz && Math.abs(o.z - b.z) > b.hd;
      // prefer leaving by the right or left (the direction of flow), by the front or back only if it is more direct
      const sideCost = (facing ? 0 : 6) + (dz ? 2 : 0);
      const span = dx ? b.hd : b.hw, n = Math.max(1, Math.floor((span * 0.8) / h));
      for (let s = -n; s <= n; s++) {
        const i = fi ?? cx(b.x) + s, j = fj ?? cz(b.z) + s;
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const c = j * W + i;
        if (owner[c] || portUsed[c]) continue;
        // a vertical side (left, right): ports follow each other in height; otherwise in width
        const crowd = portNear(c, !!dx);
        out.push({ c, d: DIRS.findIndex(([a, e]) => a === dx && e === dz), cost: sideCost + Math.abs(s) * (SPREAD ? 0.12 : 0.35) + crowd * 12 });
      }
    }
    return out;
  }

  const order = links.map((l) => ({ ...l, len: Math.hypot(boxes[l.s].x - boxes[l.t].x, boxes[l.s].z - boxes[l.t].z) })).sort((a, b) => a.len - b.len);
  const g = new Float32Array(N * 4), from = new Int32Array(N * 4);
  const pass = (fixed) => {
  const res = {};
  useH.fill(0); useV.fill(0); portUsed.fill(0);
  for (const l of order) {
    if (!boxes[l.s] || !boxes[l.t] || l.s === l.t) continue;
    const goal = new Map(ports(l.t, l.s, fixed && fixed.get(`${l.key}|1`)).map((p) => [p.c, p]));
    const tb = boxes[l.t], ti = cx(tb.x), tj = cz(tb.z), zs = zoneIdx[l.s] ?? -2, zt = zoneIdx[l.t] ?? -2;
    g.fill(Infinity); from.fill(-1);
    const heap = new Heap();
    for (const p of ports(l.s, l.t, fixed && fixed.get(`${l.key}|0`))) {
      const st = p.c * 4 + p.d; if (p.cost < g[st]) { g[st] = p.cost; from[st] = -2; heap.push(st, p.cost); }
    }
    let end = -1, guard = 0;
    while (heap.size && guard++ < Math.max(400000, N * 12)) {
      const st = heap.pop(), c = st >> 2, d = st & 3, gc = g[st];
      const gp = goal.get(c);
      // arrive through the port's side, heading into the block
      if (gp && (gp.d + 2) % 4 === d) { end = st; break; }
      const i = c % W, j = (c / W) | 0;
      for (let nd = 0; nd < 4; nd++) {
        if (nd === (d + 2) % 4) continue;
        const ni = i + DIRS[nd][0], nj = j + DIRS[nd][1];
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const nc = nj * W + ni, ow = owner[nc];
        if (ow) continue;
        const horiz = nd % 2 === 0;
        // a turn close to a block costs more: cables turn out in the aisle and reach their block straight, without a small step
        let cost = 1 + (nd !== d ? BEND + (near[nc] ? NEARBEND : 0) : 0) + (near[nc] ? NEAR : 0);
        const zc = zoneOf[nc]; if (zc >= 0 && zc !== zs && zc !== zt) cost += ZONE;
        if (horiz ? useH[nc] : useV[nc]) cost += SAME;
        else if (horiz ? useV[nc] : useH[nc]) cost += CROSS;
        else if (SPREAD) {
          // neighbouring lanes taken in the same direction: parallel cables stay apart
          const a = horiz ? useH : useV, st = horiz ? W : 1;
          for (let s = 1; s <= SPREAD; s++) {
            const o1 = nc - s * st, o2 = nc + s * st, w = (SPREAD + 1 - s) / SPREAD;
            if (o1 >= 0 && a[o1]) cost += REPEL * w;
            if (o2 < N && a[o2]) cost += REPEL * w;
          }
        } else {
          // running alongside an existing cable (neighbouring lane, same direction): cables gather into bundles
          const a = horiz ? useH : useV, o1 = horiz ? nc - W : nc - 1, o2 = horiz ? nc + W : nc + 1;
          if ((o1 >= 0 && a[o1]) || (o2 < N && a[o2])) cost -= HUG;
        }
        const ns = nc * 4 + nd, ng = gc + cost;
        if (ng < g[ns]) { g[ns] = ng; from[ns] = st; heap.push(ns, ng + (Math.abs(ni - ti) + Math.abs(nj - tj)) * 0.9); }
      }
    }
    if (end < 0) continue;
    // walk the path back, mark the cells taken
    const cells = [];
    for (let st = end; st >= 0; st = from[st]) cells.push(st);
    cells.reverse();
    portUsed[cells[0] >> 2] = 1; portUsed[cells[cells.length - 1] >> 2] = 1;
    cells.forEach((st, k) => {
      const c = st >> 2, mark = (d) => { if (d % 2 === 0) useH[c] = 1; else useV[c] = 1; };
      mark(st & 3); if (cells[k + 1] !== undefined) mark(cells[k + 1] & 3);
    });
    // waypoints at the turns, plus the two attachment points on the block edges
    const pts = [];
    const first = cells[0], last = cells[cells.length - 1];
    // exit: side in the starting direction; arrival: side opposite the entry direction
    const edgePt = (st, sb, back) => {
      const c = st >> 2, i = c % W, j = (c / W) | 0, b = boxes[sb], [dx, dz] = DIRS[back ? ((st & 3) + 2) % 4 : st & 3];
      return dx ? [b.x + dx * b.hw, wz(j)] : [wx(i), b.z + dz * b.hd];
    };
    pts.push(edgePt(first, l.s, false));
    for (let k = 0; k < cells.length; k++) {
      const st = cells[k], c = st >> 2, d = st & 3, nx = cells[k + 1];
      if (k === 0 || k === cells.length - 1 || (nx !== undefined && (nx & 3) !== d)) pts.push([wx(c % W), wz((c / W) | 0)]);
    }
    pts.push(edgePt(last, l.t, true));
    res[l.key] = pts;
  }
  return res;
  };
  // 1st pass: free paths, from which we take the side and order of each attachment, then their even positions;
  // 2nd pass: route again with those attachments fixed, so the gaps between cables and the steps account for
  // the real arrival position (otherwise two cables end up stuck together right before the block)
  const first = pass(null);
  const want = planPorts(first, boxes, links, opt);
  // the attachments land on the routing grid: the second pass can then end exactly on them, and no small notch is needed
  // right before the block to catch up a few pixels (two attachments on one side never share a grid line)
  const bySide = new Map();
  want.forEach((w, k) => {
    const id = k.endsWith('|0') ? links.find((l) => `${l.key}|0` === k)?.s : links.find((l) => `${l.key}|1` === k)?.t;
    const sk = `${id}|${w.side}`; if (!bySide.has(sk)) bySide.set(sk, []); bySide.get(sk).push(w);
  });
  bySide.forEach((list) => {
    const vert = list[0].side % 2 === 0, snap = (v) => (vert ? wz(cz(v)) : wx(cx(v)));
    list.sort((a, b) => a.v - b.v);
    let prev = -Infinity;
    list.forEach((w) => { let v = snap(w.v); if (v <= prev + 0.01) v = prev + h; w.v = v; prev = v; });
  });
  const second = pass(want);
  links.forEach((l) => { if (!second[l.key] && first[l.key]) second[l.key] = first[l.key]; });
  applyPorts(second, links, want);
  straighten(second, boxes, pad, opt.minGap ?? 12);
  return second;
}

/* Straightens small steps (two close turns, under 24 px): the segment before takes the height of the segment after,
   so a cable arrives straight onto its attachment instead of dropping a notch right before the block. Only done if
   the moved segment touches no block and runs alongside no other cable closer than minGap. The two ends never move. */
function straighten(res, boxes, pad, minGap) {
  const keys = Object.keys(res), JOG = 24;
  const segsOf = (skip) => {
    const out = [];
    keys.forEach((k) => { if (k === skip) return; const p = res[k]; for (let i = 1; i < p.length; i++) out.push([p[i - 1], p[i]]); });
    return out;
  };
  const hitsBox = (a, b) => Object.values(boxes).some((x) => {
    const m = pad - 4, x0 = x.x - x.hw - m, x1 = x.x + x.hw + m, z0 = x.z - x.hd - m, z1 = x.z + x.hd + m;
    return Math.max(a[0], b[0]) > x0 && Math.min(a[0], b[0]) < x1 && Math.max(a[1], b[1]) > z0 && Math.min(a[1], b[1]) < z1;
  });
  const tooClose = (a, b, others) => {
    const h = Math.abs(a[1] - b[1]) < 0.01, c = h ? a[1] : a[0], lo = Math.min(h ? a[0] : a[1], h ? b[0] : b[1]), hi = Math.max(h ? a[0] : a[1], h ? b[0] : b[1]);
    return others.some(([p, q]) => {
      const ph = Math.abs(p[1] - q[1]) < 0.01; if (ph !== h) return false;
      const oc = ph ? p[1] : p[0], olo = Math.min(ph ? p[0] : p[1], ph ? q[0] : q[1]), ohi = Math.max(ph ? p[0] : p[1], ph ? q[0] : q[1]);
      return Math.abs(oc - c) < minGap && Math.min(hi, ohi) - Math.max(lo, olo) > 1;
    });
  };
  for (let round = 0; round < 3; round++) {
    let changed = false;
    keys.forEach((k) => {
      let p = res[k];
      for (let i = 1; i + 2 < p.length; i++) {
        const lat = Math.abs(p[i][0] - p[i + 1][0]) < 0.01 ? 1 : 0;   // the step p[i] -> p[i+1] runs along this axis (1 = vertical)
        const step = p[i + 1][lat] - p[i][lat];
        if (Math.abs(step) >= JOG || Math.abs(step) < 0.5) continue;
        // two ways: move the segment before (if its start is not an end) or the one after
        const tries = [];
        if (i - 1 > 0) tries.push({ mv: i - 1, to: p[i + 1][lat], drop: [i, i + 1] });
        if (i + 2 < p.length - 1) tries.push({ mv: i + 2, to: p[i][lat], drop: [i, i + 1] });
        const others = segsOf(k);
        for (const t of tries) {
          const q = p.map((v) => [v[0], v[1]]);
          q[t.mv][lat] = t.to;
          const nq = q.filter((_, j) => !t.drop.includes(j));
          // the neighbouring perpendicular segment must neither reverse nor become tiny
          const j = nq.indexOf(nq.find((v) => v === q[t.mv])), nb = t.mv < i ? nq[j - 1] : nq[j + 1];
          const before = (t.mv < i ? p[t.mv - 1] : p[t.mv + 1])[lat] - p[t.mv][lat], after = nb[lat] - t.to;
          if (Math.sign(before) !== Math.sign(after) || Math.abs(after) < 8) continue;
          // only the new part of the moved segment is checked (the rest already existed, up to the block edge)
          const segA = t.mv < i ? [q[t.mv], q[i + 1]] : [q[i], q[t.mv]];
          const segB = t.mv < i ? [nb, q[t.mv]] : [q[t.mv], nb];
          if (hitsBox(...segA) || tooClose(...segA, others) || tooClose(...segB, others)) continue;
          res[k] = p = simplify(nq); changed = true; break;
        }
      }
    });
    if (!changed) break;
  }
}

/* removes duplicate and collinear points: only the two ends and the turns remain */
function simplify(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q[0] - p[0]) < 0.01 && Math.abs(q[1] - p[1]) < 0.01) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      if ((Math.abs(a[0] - q[0]) < 0.01 && Math.abs(q[0] - p[0]) < 0.01) || (Math.abs(a[1] - q[1]) < 0.01 && Math.abs(q[1] - p[1]) < 0.01)) out.pop();
    }
    out.push([p[0], p[1]]);
  }
  return out;
}

/* Exact attachments: on each side of a block, cables are spread evenly along the side (a single cable = dead centre),
   in the order they arrive so they never cross. Cables heading in different directions (up, straight,
   down) are separated by a larger gap: a "space-evenly" per bundle. The first segment stays straight. */
function planPorts(res, boxes, links, opt) {
  const INSET = opt.portInset ?? 0, MAXP = opt.portMax ?? 56, GROUPGAP = opt.groupGap ?? 1.6;
  const sides = new Map();
  for (const l of links) {
    const pts = res[l.key]; if (!pts) continue;
    res[l.key] = simplify(pts);
  }
  // attachment side of an end: 0 right, 1 bottom, 2 left, 3 top; lateral = coordinate along the side
  const sideOf = (b, p) => {
    if (Math.abs(p[0] - (b.x + b.hw)) < 0.5) return 0;
    if (Math.abs(p[0] - (b.x - b.hw)) < 0.5) return 2;
    if (Math.abs(p[1] - (b.z + b.hd)) < 0.5) return 1;
    return 3;
  };
  for (const l of links) {
    const pts = res[l.key]; if (!pts || pts.length < 2) continue;
    for (const end of [0, 1]) {
      const id = end ? l.t : l.s, b = boxes[id], i = end ? pts.length - 1 : 0, nb = end ? i - 1 : 1;
      const side = sideOf(b, pts[i]), lat = side % 2 === 0 ? 1 : 0;
      // direction of the cable after its first turn: -1, 0 (straight to the end), +1
      const far = pts[end ? nb - 1 : nb + 1];
      const turn = far ? Math.sign(far[lat] - pts[nb][lat]) : 0, reach = Math.abs(pts[nb][1 - lat] - pts[i][1 - lat]);
      const k = `${id}|${side}`;
      if (!sides.has(k)) sides.set(k, { b, side, lat, list: [] });
      sides.get(k).list.push({ key: l.key, end, at: pts[i][lat], turn, reach });
    }
  }
  const want = new Map();   // "key|end" -> new lateral coordinate
  sides.forEach(({ b, side, lat, list }) => {
    // those turning towards the start of the side first (the earliest turner at the very edge), the straight ones in the middle,
    // those turning towards the end next (the earliest turner at the very edge): no crossing as they leave the block
    list.sort((p, q) => p.turn - q.turn || (p.turn < 0 ? p.reach - q.reach : p.turn > 0 ? q.reach - p.reach : p.at - q.at));
    const c = lat ? b.z : b.x, half = lat ? b.hd : b.hw, span = Math.max(0, 2 * half - 2 * INSET);
    // units: 1 at each edge, 1 between two cables of the same bundle, GROUPGAP between two bundles
    const gaps = list.map((p, i) => (i === 0 ? 0 : p.turn === list[i - 1].turn ? 1 : GROUPGAP));
    const units = 2 + gaps.reduce((a, g) => a + g, 0);
    const unit = Math.min(span / units, MAXP);
    let pos = c - (unit * (units - 2)) / 2;
    list.forEach((p, i) => { pos += gaps[i] * unit; want.set(`${p.key}|${p.end}`, { v: pos, side }); });
  });
  return want;
}

function applyPorts(res, links, want) {
  for (const l of links) {
    let pts = res[l.key]; if (!pts) continue;
    pts = res[l.key] = simplify(pts); if (pts.length < 2) continue;
    const ns = want.get(`${l.key}|0`)?.v ?? pts[0][Math.abs(pts[0][0] - pts[1][0]) < 0.01 ? 0 : 1];
    const nt = want.get(`${l.key}|1`)?.v ?? pts[pts.length - 1][Math.abs(pts[pts.length - 1][0] - pts[pts.length - 2][0]) < 0.01 ? 0 : 1];
    const latS = Math.abs(pts[0][0] - pts[1][0]) < 0.01 ? 0 : 1;     // vertical segment: lateral = x
    const n = pts.length;
    const latT = Math.abs(pts[n - 1][0] - pts[n - 2][0]) < 0.01 ? 0 : 1;
    if (n === 2) {
      // straight cable: if the two ends no longer have the same height, a step in the middle
      pts[0][latS] = ns; pts[1][latT] = nt;
      if (Math.abs(ns - nt) > 0.5) {
        // large step: two right-angle turns; small step: a gentle slope, never a notch of a few pixels
        const d = Math.abs(ns - nt), ax = 1 - latS, m = (pts[0][ax] + pts[1][ax]) / 2, sg = Math.sign(pts[1][ax] - pts[0][ax]);
        const half = d >= 24 ? 0 : Math.min(Math.abs(pts[1][ax] - pts[0][ax]) / 4, 24) * sg, p1 = [0, 0], p2 = [0, 0];
        p1[ax] = m - half; p1[latS] = ns; p2[ax] = m + half; p2[latS] = nt;
        pts = [pts[0], p1, p2, pts[1]];
      }
      res[l.key] = pts; continue;
    }
    pts = jogEnd(pts, ns, latS);
    pts = jogEnd(pts.slice().reverse(), nt, latT).reverse();
    res[l.key] = simplify(pts);
  }
}

/* copy of a route whose end (0 start, 1 arrival) slides along its side to coordinate v */
export function moveEnd(pts, end, v) {
  let q = pts.map((p) => [p[0], p[1]]);
  if (q.length < 2) return q;
  if (end) q.reverse();
  const lat = Math.abs(q[0][0] - q[1][0]) < 0.01 ? 0 : 1;
  if (q.length === 2) {
    const ax = 1 - lat, m = (q[0][ax] + q[1][ax]) / 2, a = [0, 0], b = [0, 0];
    a[ax] = m; a[lat] = v; b[ax] = m; b[lat] = q[1][lat]; q = [[q[0][0], q[0][1]], a, b, q[1]]; q[0][lat] = v;
  } else q = jogEnd(q, v, lat);
  if (end) q.reverse();
  return simplify(q);
}

/* moves the first segment to lateral coordinate v; if the next segment would become too short or reverse,
   keep the original turn and add a small step near the block */
function jogEnd(pts, v, lat) {
  const p0 = pts[0], p1 = pts[1], p2 = pts[2], old = p0[lat];
  if (Math.abs(v - old) < 0.01) return pts;
  const before = p2[lat] - p1[lat], after = p2[lat] - v;
  if (Math.sign(before) === Math.sign(after) && Math.abs(after) >= 8) {
    p0[lat] = v; p1[lat] = v; return pts;
  }
  const ax = 1 - lat, stub = Math.min(16, Math.abs(p1[ax] - p0[ax]) / 2), dir = Math.sign(p1[ax] - p0[ax]) || 1;
  const a = [0, 0], b = [0, 0];
  a[ax] = p0[ax] + dir * stub; a[lat] = v; b[ax] = a[ax]; b[lat] = old;
  p0[lat] = v;
  return [p0, a, b, ...pts.slice(1)];
}
