/* Object variants (B, C) offered in the workshop, alongside the original object (A, in objects3d.js).
   Each variant draws into group g, placed on top of the base (y = 0), within roughly 1.9 x 2 x 1.9,
   and optionally returns a tick(t) function for animation. */
import * as THREE from "three";
import { VARIANTS, P, M, mesh, shade, screenTexture } from "./objects3d.js";

const D = () => P.DARK, L = () => P.LIGHT, S = () => P.SILVER, G = () => P.GOLD;
function add(kind, letter, label, fn) { (VARIANTS[kind] ||= {})[letter] = { label, fn }; }
export const LABELS_A = {
  server: "Drawers", user: "Pawn", app: "Computer", wallet: "Wallet", contract: "Blocks", chain: "Stack",
  oracle: "Orb", feed: "Dish", external: "Globe", database: "Cylinders", cloud: "Cloud", key: "Key",
  security: "Shield", swap: "Coins", chart: "Bars",
};

// small helpers
const box = (g, mats, w, h, d, col, x, y, z, o) => { const m = mesh(new THREE.BoxGeometry(w, h, d), M(mats, col, o), x, y, z); g.add(m); return m; };
const cyl = (g, mats, rt, rb, h, col, x, y, z, o, seg = 28) => { const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), M(mats, col, o), x, y, z); g.add(m); return m; };
const ball = (g, mats, r, col, x, y, z, o) => { const m = mesh(new THREE.SphereGeometry(r, 16, 12), M(mats, col, o), x, y, z); g.add(m); return m; };
const lit = (mats, col, k = 1) => M(mats, col, { e: col, ei: k });
const texCache = new Map();
function tex(key, w, h, draw) {
  const k = key + (P.soft ? "s" : "d");
  if (texCache.has(k)) return texCache.get(k);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(k, t); return t;
}
function plane(g, mats, w, h, map, x, y, z, ry = 0) {
  const m = new THREE.MeshBasicMaterial({ map, transparent: true }); m.userData.baseOpacity = 1; mats.push(m);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.y = ry; g.add(p); return p;
}
const FONT = (w, s) => `${w} ${s}px -apple-system, "Inter", system-ui, sans-serif`;
function blink(leds, k = 1) { return (t) => leds.forEach((m, i) => { m.emissiveIntensity = (0.25 + 0.75 * (Math.sin(t * (2.5 + i * 0.7) + i * 1.9) > 0.2 ? 1 : 0.15)) * k * P.glow; }); }

// ------------------------------------------------------------ server
add("server", "B", "Rack", (g, mats, c) => {
  box(g, mats, 1.15, 2.0, 1.0, D(), 0, 1.0, 0, { r: 0.55 });
  box(g, mats, 0.96, 1.78, 0.04, "#1b1e24", 0, 1.0, 0.49, { keep: true, r: 0.6 });
  box(g, mats, 1.2, 0.07, 1.05, c, 0, 2.02, 0, { r: 0.5 });
  const leds = [];
  for (let i = 0; i < 7; i++) {
    const y = 0.28 + i * 0.235;
    box(g, mats, 0.88, 0.18, 0.03, "#30353f", 0, y, 0.52, { keep: true, r: 0.5 });
    box(g, mats, 0.36, 0.025, 0.01, "#4b525e", 0.18, y + 0.03, 0.54, { keep: true });
    box(g, mats, 0.36, 0.025, 0.01, "#4b525e", 0.18, y - 0.03, 0.54, { keep: true });
    const a = lit(mats, "#4ade80"), b = lit(mats, c);
    g.add(mesh(new THREE.SphereGeometry(0.028, 10, 8), a, -0.34, y, 0.54), mesh(new THREE.SphereGeometry(0.028, 10, 8), b, -0.25, y, 0.54));
    leds.push(a, b);
  }
  for (const x of [-0.45, 0.45]) for (const z of [-0.38, 0.38]) cyl(g, mats, 0.05, 0.05, 0.06, "#1b1e24", x, -0.0, z, { keep: true }, 10);
  return blink(leds);
});
add("server", "C", "Tower", (g, mats, c) => {
  box(g, mats, 0.66, 1.5, 1.3, D(), 0, 0.77, 0, { r: 0.5 });
  box(g, mats, 0.58, 1.4, 0.03, "#262a32", 0, 0.77, 0.66, { keep: true });
  for (let i = 0; i < 2; i++) box(g, mats, 0.46, 0.12, 0.02, "#3c424d", 0, 1.2 - i * 0.17, 0.69, { keep: true });
  for (let i = 0; i < 6; i++) box(g, mats, 0.4, 0.025, 0.01, "#3c424d", 0, 0.3 + i * 0.07, 0.685, { keep: true });
  const pw = lit(mats, c, 1.2);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 8, 24), pw); ring.position.set(0, 0.92, 0.69); g.add(ring);
  // side window and lit fan
  box(g, mats, 0.02, 1.1, 1.05, "#bfe3ff", 0.335, 0.8, 0, { op: 0.22, r: 0.05 });
  const fan = new THREE.Group(); fan.position.set(0.3, 0.95, 0.15); fan.rotation.z = Math.PI / 2; g.add(fan);
  fan.add(new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 8, 32), pw));
  const bl = M(mats, "#4b525e", { keep: true });
  for (let i = 0; i < 5; i++) { const b = mesh(new THREE.BoxGeometry(0.06, 0.02, 0.22), bl); b.rotation.y = (i / 5) * Math.PI * 2; b.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.12, 0, -Math.sin((i / 5) * Math.PI * 2) * 0.12); fan.add(b); }
  return (t) => { fan.rotation.y = t * 4; };
});
VARIANTS.api = VARIANTS.server;

// ------------------------------------------------------------ user
add("user", "B", "Figure", (g, mats, c) => {
  for (const x of [-0.14, 0.14]) cyl(g, mats, 0.11, 0.12, 0.42, D(), x, 0.21, 0, {}, 14);
  cyl(g, mats, 0.36, 0.3, 0.72, c, 0, 0.78, 0, { r: 0.6 });
  ball(g, mats, 0.36, c, 0, 1.12, 0, { r: 0.6 }).scale.set(1, 0.35, 0.85);
  const head = ball(g, mats, 0.27, L(), 0, 1.5, 0, { r: 0.5 });
  const arms = [-1, 1].map((s) => {
    const p = new THREE.Group(); p.position.set(s * 0.42, 1.1, 0); g.add(p);
    p.add(mesh(new THREE.CapsuleGeometry(0.09, 0.42, 4, 10), M(mats, c, { r: 0.6 }), 0, -0.28, 0));
    p.rotation.z = s * 0.15; return p;
  });
  return (t) => { arms[1].rotation.z = 0.15 + Math.max(0, Math.sin(t * 1.4)) * 2.2; head.rotation.y = Math.sin(t * 0.7) * 0.4; };
});
add("user", "C", "Profile", (g, mats, c) => {
  const m = new THREE.Group(); m.position.y = 1.15; g.add(m);
  m.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.1, 48).rotateX(Math.PI / 2), M(mats, L(), { r: 0.6 })));
  m.add(mesh(new THREE.TorusGeometry(0.75, 0.05, 10, 48), M(mats, c, { r: 0.5 })));
  const sil = M(mats, c, { r: 0.6 });
  const hd = mesh(new THREE.SphereGeometry(0.22, 24, 16), sil, 0, 0.2, 0.05); hd.scale.z = 0.35; m.add(hd);
  const sh = mesh(new THREE.SphereGeometry(0.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), sil, 0, -0.42, 0.05); sh.scale.set(1, 0.75, 0.25); m.add(sh);
  cyl(g, mats, 0.05, 0.05, 0.42, S(), 0, 0.22, 0, { m: 0.6 }, 12);
  cyl(g, mats, 0.32, 0.38, 0.08, D(), 0, 0.04, 0);
  return (t) => { m.rotation.y = Math.sin(t * 0.6) * 0.5; };
});

// ------------------------------------------------------------ application
add("app", "B", "Window", (g, mats, c) => {
  const w = new THREE.Group(); w.position.y = 1.15; g.add(w);
  w.add(mesh(new THREE.BoxGeometry(2.0, 1.3, 0.08), M(mats, L(), { r: 0.5 })));
  w.add(mesh(new THREE.BoxGeometry(1.98, 0.17, 0.085), M(mats, "#cfd5de", { r: 0.5 }), 0, 0.565, 0));
  ["#f26b6b", "#f5b544", "#4ade80"].forEach((col, i) => w.add(mesh(new THREE.SphereGeometry(0.032, 10, 8), M(mats, col), -0.86 + i * 0.1, 0.565, 0.05)));
  w.add(mesh(new THREE.BoxGeometry(0.9, 0.08, 0.01), M(mats, "#ffffff"), 0.15, 0.565, 0.05));
  plane(w, mats, 1.88, 1.06, screenTexture(c), 0, -0.07, 0.045);
  cyl(g, mats, 0.05, 0.05, 0.5, S(), 0, 0.25, -0.02, { m: 0.6 }, 12);
  box(g, mats, 0.7, 0.05, 0.42, D(), 0, 0.025, 0);
  return (t) => { w.rotation.y = Math.sin(t * 0.5) * 0.12; };
});
function phoneTex(c) {
  return tex("phone" + c, 160, 320, (x, w, h) => {
    x.fillStyle = P.soft ? "#2d3247" : "#101217"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#ffffff"; x.font = FONT(800, 30); x.fillText("12.4", 16, 64);
    x.fillStyle = c; x.font = FONT(700, 16); x.fillText("+2.1%", 16, 90);
    x.strokeStyle = c; x.lineWidth = 4; x.lineJoin = "round"; x.beginPath();
    [[12, 200], [36, 180], [58, 188], [82, 150], [106, 162], [130, 120], [148, 128]].forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke();
    x.fillStyle = "#4ade80"; x.fillRect(14, 246, 62, 46); x.fillStyle = "#f26b6b"; x.fillRect(84, 246, 62, 46);
  });
}
add("app", "C", "Phone", (g, mats, c) => {
  const p = new THREE.Group(); p.position.set(0, 1.0, 0); p.rotation.x = -0.18; g.add(p);
  p.add(mesh(new THREE.BoxGeometry(0.8, 1.55, 0.1), M(mats, D(), { r: 0.4 })));
  plane(p, mats, 0.7, 1.4, phoneTex(c), 0, 0, 0.052);
  box(g, mats, 0.7, 0.1, 0.5, L(), 0, 0.05, 0.1, { r: 0.6 });
  return (t) => { p.position.y = 1.0 + Math.sin(t * 1.2) * 0.04; };
});

// ------------------------------------------------------------ wallet
add("wallet", "B", "Hardware key", (g, mats, c) => {
  const k = new THREE.Group(); k.position.y = 1.0; g.add(k);
  k.add(mesh(new THREE.BoxGeometry(0.5, 1.5, 0.16), M(mats, D(), { r: 0.4 })));
  const scr = tex("ledger" + c, 64, 160, (x, w, h) => { x.fillStyle = "#0b0c0f"; x.fillRect(0, 0, w, h); x.fillStyle = c; x.font = FONT(800, 22); x.save(); x.translate(40, 80); x.rotate(-Math.PI / 2); x.textAlign = "center"; x.fillText("OK", 0, 0); x.restore(); });
  plane(k, mats, 0.22, 0.55, scr, 0, 0.32, 0.082);
  for (const y of [0.72, -0.72]) k.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14).rotateX(Math.PI / 2), M(mats, S(), { m: 0.7 }), 0.18, y * 0.9, 0.08));
  const cover = new THREE.Group(); cover.position.set(0, -0.55, 0); k.add(cover);
  cover.add(mesh(new THREE.BoxGeometry(0.56, 0.8, 0.2), M(mats, S(), { m: 0.85, r: 0.3 }), 0, -0.05, 0));
  box(g, mats, 0.8, 0.14, 0.5, c, 0, 0.07, 0, { r: 0.6 });
  return (t) => { k.rotation.y = Math.sin(t * 0.6) * 0.6; cover.rotation.z = Math.max(0, Math.sin(t * 0.8)) * 0.5; };
});
add("wallet", "C", "Safe", (g, mats, c) => {
  box(g, mats, 1.4, 1.4, 1.15, D(), 0, 0.72, 0, { r: 0.55 });
  box(g, mats, 1.2, 1.2, 0.06, "#4a505c", 0, 0.72, 0.6, { keep: true, r: 0.5, m: 0.3 });
  box(g, mats, 1.44, 0.07, 1.19, c, 0, 1.44, 0, { r: 0.5 });
  const dial = new THREE.Group(); dial.position.set(-0.12, 0.82, 0.66); g.add(dial);
  dial.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 32).rotateX(Math.PI / 2), M(mats, S(), { m: 0.85, r: 0.3 })));
  dial.add(mesh(new THREE.BoxGeometry(0.03, 0.12, 0.02), M(mats, D()), 0, 0.14, 0.04));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; dial.add(mesh(new THREE.BoxGeometry(0.015, 0.04, 0.01), M(mats, "#ffffff"), Math.sin(a) * 0.27, Math.cos(a) * 0.27, 0)); }
  const hd = new THREE.Group(); hd.position.set(0.32, 0.6, 0.66); g.add(hd);
  for (let i = 0; i < 3; i++) { const s = mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), M(mats, S(), { m: 0.85 }), 0, 0, 0.02); s.rotation.z = (i / 3) * Math.PI; hd.add(s); }
  for (const y of [0.3, 1.15]) box(g, mats, 0.06, 0.18, 0.08, S(), -0.6, y, 0.63, { m: 0.8 });
  return (t) => { dial.rotation.z = Math.sin(t * 0.9) * 2.4; };
});

// ------------------------------------------------------------ contract
add("contract", "B", "Scroll", (g, mats, c) => {
  const p = new THREE.Group(); p.position.y = 1.0; g.add(p);
  p.add(mesh(new THREE.BoxGeometry(1.25, 1.4, 0.03), M(mats, "#f1e7cf", { r: 0.8 })));
  const roll = M(mats, "#dccba3", { r: 0.7 });
  for (const y of [0.74, -0.74]) {
    p.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 20).rotateZ(Math.PI / 2), roll, 0, y, 0));
    for (const x of [-0.74, 0.74]) p.add(mesh(new THREE.SphereGeometry(0.08, 12, 8), M(mats, D()), x, y, 0));
  }
  const ink = M(mats, "#8c7b58", { r: 0.8 });
  [0.42, 0.28, 0.14, 0, -0.14].forEach((y, i) => p.add(mesh(new THREE.BoxGeometry(i === 0 ? 0.6 : 0.9 - (i % 2) * 0.2, 0.035, 0.01), ink, i === 0 ? 0 : -0.05, y, 0.02)));
  p.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24).rotateX(Math.PI / 2), M(mats, c, { r: 0.5 }), 0.33, -0.4, 0.04));
  cyl(g, mats, 0.05, 0.05, 0.25, S(), 0, 0.12, 0, {}, 10);
  return (t) => { p.rotation.y = Math.sin(t * 0.6) * 0.3; };
});
add("contract", "C", "Signed document", (g, mats, c) => {
  const p = new THREE.Group(); p.position.set(0, 0.95, 0); p.rotation.x = -0.12; g.add(p);
  p.add(mesh(new THREE.BoxGeometry(1.25, 1.65, 0.06), M(mats, D(), { r: 0.5 })));
  p.add(mesh(new THREE.BoxGeometry(1.08, 1.42, 0.02), M(mats, L(), { r: 0.8 }), 0, -0.04, 0.04));
  p.add(mesh(new THREE.BoxGeometry(0.42, 0.12, 0.08), M(mats, S(), { m: 0.8 }), 0, 0.78, 0.05));
  const ink = M(mats, "#9aa1ad");
  for (let i = 0; i < 5; i++) p.add(mesh(new THREE.BoxGeometry(0.8 - (i % 2) * 0.25, 0.035, 0.01), ink, -0.05 - (i % 2) * 0.12, 0.45 - i * 0.14, 0.055));
  const pts = []; for (let i = 0; i <= 24; i++) { const u = i / 24; pts.push(new THREE.Vector3(-0.38 + u * 0.6, -0.42 + Math.sin(u * 11) * 0.06 + u * 0.05, 0.06)); }
  p.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.014, 6), M(mats, D())));
  const seal = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 24).rotateX(Math.PI / 2), M(mats, c, { r: 0.5 }), 0.36, -0.46, 0.06); p.add(seal);
  box(g, mats, 0.9, 0.08, 0.5, D(), 0, 0.04, 0.05);
  return (t) => { seal.scale.setScalar(1 + Math.max(0, Math.sin(t * 2)) * 0.1); };
});

// ------------------------------------------------------------ chain
function link(g, mats, x, y, z, vertical) {
  const m = M(mats, S(), { m: 0.85, r: 0.3 });
  const a = mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 20), m, x, y, z), b = mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 20), m, x, y, z);
  if (vertical) { a.scale.y = 1.4; b.scale.y = 1.4; a.position.y += 0.08; b.position.y -= 0.08; b.rotation.y = Math.PI / 2; }
  else { a.scale.x = 1.4; b.scale.x = 1.4; a.position.x -= 0.08; b.position.x += 0.08; b.rotation.x = Math.PI / 2; }
  g.add(a, b);
}
add("chain", "B", "Blocks in a row", (g, mats, c) => {
  const cubes = [-0.72, 0, 0.72].map((x, i) => box(g, mats, 0.52, 0.52, 0.52, i === 2 ? c : shade(c, 0.6 + i * 0.15), x, 0.4, 0, { r: 0.45 }));
  link(g, mats, -0.36, 0.4, 0, false); link(g, mats, 0.36, 0.4, 0, false);
  return (t) => cubes.forEach((b, i) => { b.position.y = 0.4 + Math.max(0, Math.sin(t * 2 - i * 0.9)) * 0.18; });
});
add("chain", "C", "Chained stack", (g, mats, c) => {
  const cubes = [0.3, 0.98, 1.66].map((y, i) => box(g, mats, 0.56, 0.48, 0.56, i === 2 ? c : shade(c, 0.6 + i * 0.15), 0, y, 0, { r: 0.45 }));
  link(g, mats, 0, 0.64, 0, true); link(g, mats, 0, 1.32, 0, true);
  return (t) => { cubes[2].rotation.y = Math.sin(t * 0.9) * 0.5; };
});

// ------------------------------------------------------------ oracle
add("oracle", "B", "Lighthouse", (g, mats, c) => {
  cyl(g, mats, 0.27, 0.45, 1.4, L(), 0, 0.7, 0, { r: 0.6 });
  const rad = (y) => 0.45 - 0.18 * (y / 1.4) + 0.025;
  for (const y of [0.4, 0.95]) cyl(g, mats, rad(y + 0.1), rad(y - 0.1), 0.2, c, 0, y, 0, { r: 0.6 });
  cyl(g, mats, 0.4, 0.4, 0.06, D(), 0, 1.43, 0);
  cyl(g, mats, 0.2, 0.2, 0.3, "#fff4c4", 0, 1.61, 0, { e: "#fff4c4", ei: 0.9 });
  g.add(mesh(new THREE.ConeGeometry(0.3, 0.26, 24), M(mats, c), 0, 1.89, 0));
  const beam = new THREE.Group(); beam.position.y = 1.61; g.add(beam);
  const bm = new THREE.MeshBasicMaterial({ color: "#fff4c4", transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }); bm.userData.baseOpacity = 0.16; mats.push(bm);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 2.0, 20, 1, true), bm); cone.rotation.z = Math.PI / 2; cone.position.x = 1.05; beam.add(cone);
  return (t) => { beam.rotation.y = t * 1.2; };
});
add("oracle", "C", "Transmitter tower", (g, mats, c) => {
  const m = M(mats, S(), { m: 0.7 });
  const top = new THREE.Vector3(0, 1.75, 0);
  [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].forEach(([x, z]) => {
    const a = new THREE.Vector3(x, 0, z), d = top.clone().sub(a), leg = mesh(new THREE.CylinderGeometry(0.035, 0.045, d.length(), 8), m);
    leg.position.copy(a).add(d.clone().multiplyScalar(0.5)); leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(leg);
  });
  [0.45, 0.9, 1.3].forEach((y) => { const s = 0.5 * (1 - y / 1.75); g.add(mesh(new THREE.TorusGeometry(s * 1.41, 0.02, 6, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4), m, 0, y, 0)); });
  const bulb = lit(mats, c, 1.2); g.add(mesh(new THREE.SphereGeometry(0.11, 16, 12), bulb, 0, 1.82, 0));
  const rings = [0, 1].map(() => { const rm = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.5, side: THREE.DoubleSide }); rm.userData.baseOpacity = 0.5; rm.userData.anim = true; mats.push(rm); const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.015, 6, 40), rm); r.position.y = 1.82; r.rotation.x = Math.PI / 2; g.add(r); return r; });
  return (t) => { bulb.emissiveIntensity = (0.4 + Math.abs(Math.sin(t * 2.5)) * 0.8) * P.glow; rings.forEach((r, i) => { const u = (t * 0.5 + i / 2) % 1; r.scale.setScalar(0.4 + u * 2.4); r.material.opacity = 0.5 * (1 - u) * (r.material.userData.dimF ?? 1); }); };
});

// ------------------------------------------------------------ data feed
function tickerTex(c) {
  return tex("ticker" + c, 512, 256, (x, w, h) => {
    x.fillStyle = P.soft ? "#2d3247" : "#0d0f13"; x.fillRect(0, 0, w, h);
    const rows = [["BTC", "97,420", 1], ["ETH", "3,412", 1], ["HYPE", "41.2", 0], ["SOL", "188", 1]];
    rows.forEach(([n, v, up], i) => {
      const y = 46 + i * 58; x.font = FONT(800, 34); x.fillStyle = "#e6eaf0"; x.fillText(n, 24, y);
      x.fillStyle = up ? "#4ade80" : "#f26b6b"; x.fillText(v, 170, y); x.fillText(up ? "▲" : "▼", 330, y);
      x.fillStyle = c; x.fillRect(390, y - 22, 20 + ((i * 37) % 80), 18);
    });
  });
}
add("feed", "B", "Ticker board", (g, mats, c) => {
  const b = new THREE.Group(); b.position.y = 1.15; g.add(b);
  b.add(mesh(new THREE.BoxGeometry(1.85, 1.0, 0.1), M(mats, D(), { r: 0.5 })));
  const t = tickerTex(c).clone(); t.needsUpdate = true; t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 0.9);
  plane(b, mats, 1.72, 0.86, t, 0, 0, 0.055);
  for (const x of [-0.6, 0.6]) cyl(g, mats, 0.05, 0.05, 0.65, S(), x, 0.33, 0, { m: 0.6 }, 10);
  box(g, mats, 1.5, 0.06, 0.4, D(), 0, 0.03, 0);
  return (tt) => { t.offset.y = (tt * 0.08) % 1; };
});
add("feed", "C", "Radar", (g, mats, c) => {
  cyl(g, mats, 0.3, 0.4, 0.3, D(), 0, 0.15, 0);
  cyl(g, mats, 0.06, 0.06, 0.5, S(), 0, 0.5, 0, { m: 0.6 }, 10);
  const r = new THREE.Group(); r.position.set(0, 1.05, 0); r.rotation.x = 1.0; g.add(r);
  r.add(mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 48), M(mats, "#1f2a2a", { keep: true, r: 0.5 })));
  [0.3, 0.55, 0.78].forEach((rad) => r.add(mesh(new THREE.TorusGeometry(rad, 0.012, 6, 48).rotateX(Math.PI / 2), M(mats, c, { e: c, ei: 0.3 }), 0, 0.045, 0)));
  const sw = new THREE.Group(); sw.position.y = 0.05; r.add(sw);
  sw.add(mesh(new THREE.BoxGeometry(0.78, 0.015, 0.03), lit(mats, c, 1.2), 0.39, 0, 0));
  const blip = ball(r, mats, 0.04, c, 0.4, 0.06, 0.3, { e: c, ei: 1.2 });
  return (t) => { sw.rotation.y = -t * 1.8; blip.scale.setScalar(0.6 + Math.abs(Math.sin(t * 1.8)) * 0.8); };
});

// ------------------------------------------------------------ external service
add("external", "B", "Building", (g, mats, c) => {
  box(g, mats, 1.2, 1.9, 1.0, L(), 0, 0.95, 0, { r: 0.6 });
  box(g, mats, 1.24, 0.08, 1.04, c, 0, 1.92, 0);
  const glass = M(mats, "#8fb3d9", { r: 0.2, m: 0.3 });
  for (let f = 0; f < 5; f++) for (let k = 0; k < 3; k++) {
    g.add(mesh(new THREE.BoxGeometry(0.24, 0.2, 0.02), glass, -0.36 + k * 0.36, 0.62 + f * 0.27, 0.505));
    g.add(mesh(new THREE.BoxGeometry(0.02, 0.2, 0.2), glass, 0.605, 0.62 + f * 0.27, -0.3 + k * 0.3));
  }
  box(g, mats, 0.34, 0.4, 0.03, D(), 0, 0.2, 0.505);
  cyl(g, mats, 0.02, 0.02, 0.45, S(), 0.3, 2.18, 0, {}, 8);
  const tip = ball(g, mats, 0.045, "#f26b6b", 0.3, 2.42, 0, { e: "#f26b6b", ei: 1 });
  return (t) => { tip.material.emissiveIntensity = (Math.sin(t * 3) > 0 ? 1 : 0.15) * P.glow; };
});
add("external", "C", "Plug", (g, mats, c) => {
  box(g, mats, 1.1, 1.1, 0.35, L(), 0, 0.85, -0.3, { r: 0.6 });
  box(g, mats, 0.8, 0.8, 0.04, "#dfe3ea", 0, 0.85, -0.11);
  for (const x of [-0.16, 0.16]) cyl(g, mats, 0.06, 0.06, 0.03, "#2a2e36", x, 0.85, -0.09, { keep: true }, 12).rotation.x = Math.PI / 2;
  const plug = new THREE.Group(); g.add(plug);
  plug.add(mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.4, 28).rotateX(Math.PI / 2), M(mats, c, { r: 0.5 })));
  for (const x of [-0.16, 0.16]) plug.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10).rotateX(Math.PI / 2), M(mats, S(), { m: 0.9 }), x, 0, -0.28));
  const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0.2), new THREE.Vector3(0, -0.1, 0.55), new THREE.Vector3(0.2, -0.55, 0.7), new THREE.Vector3(0.5, -0.8, 0.6)]);
  plug.add(new THREE.Mesh(new THREE.TubeGeometry(cable, 30, 0.05, 8), M(mats, D())));
  return (t) => { plug.position.set(0, 0.85, 0.15 + Math.max(0, Math.sin(t * 1.2)) * 0.18); };
});

// ------------------------------------------------------------ database
add("database", "B", "Filing cabinet", (g, mats, c) => {
  box(g, mats, 1.0, 1.7, 0.9, D(), 0, 0.85, 0, { r: 0.5 });
  const drawers = [];
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Group(); d.position.set(0, 0.32 + i * 0.53, 0.45); g.add(d);
    d.add(mesh(new THREE.BoxGeometry(0.88, 0.46, 0.05), M(mats, "#4a505c", { keep: true, r: 0.5 })));
    d.add(mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), M(mats, S(), { m: 0.85 }), 0, -0.05, 0.05));
    d.add(mesh(new THREE.BoxGeometry(0.26, 0.1, 0.01), M(mats, c), 0, 0.12, 0.03));
    if (i === 2) { d.add(mesh(new THREE.BoxGeometry(0.84, 0.4, 0.7), M(mats, "#3b414c", { keep: true }), 0, 0, -0.38)); for (let k = 0; k < 5; k++) d.add(mesh(new THREE.BoxGeometry(0.72, 0.36, 0.02), M(mats, L()), 0, 0.06, -0.15 - k * 0.12)); }
    drawers.push(d);
  }
  return (t) => { drawers[2].position.z = 0.45 + Math.max(0, Math.sin(t * 0.9)) * 0.4; };
});
add("database", "C", "Disks", (g, mats, c) => {
  box(g, mats, 1.6, 0.16, 1.3, D(), 0, 0.08, 0);
  cyl(g, mats, 0.07, 0.07, 1.0, S(), -0.15, 0.6, 0, { m: 0.8 }, 12);
  const disks = [0.35, 0.65, 0.95].map((y, i) => { const d = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.035, 48), M(mats, i === 2 ? c : S(), { m: 0.85, r: 0.25 }), -0.15, y, 0); g.add(d); return d; });
  const arm = new THREE.Group(); arm.position.set(0.6, 0, 0.45); g.add(arm);
  arm.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.05, 12), M(mats, D()), 0, 0.6, 0));
  [0.4, 0.7, 1.0].forEach((y) => arm.add(mesh(new THREE.BoxGeometry(0.06, 0.02, 0.7), M(mats, L()), 0, y, -0.33)));
  return (t) => { disks.forEach((d) => { d.rotation.y = t * 3; }); arm.rotation.y = -0.3 + Math.sin(t * 1.3) * 0.25; };
});

// ------------------------------------------------------------ hosting
add("cloud", "B", "Data center", (g, mats, c) => {
  box(g, mats, 1.85, 0.95, 1.4, L(), 0, 0.48, 0, { r: 0.6 });
  box(g, mats, 1.89, 0.06, 1.44, c, 0, 0.97, 0);
  for (let i = 0; i < 5; i++) box(g, mats, 0.28, 0.7, 0.02, "#3a404b", -0.68 + i * 0.34, 0.42, 0.705, { keep: true });
  const fans = [-0.45, 0.45].map((x) => {
    cyl(g, mats, 0.32, 0.32, 0.18, "#c9cfd8", x, 1.09, 0);
    const f = new THREE.Group(); f.position.set(x, 1.19, 0); g.add(f);
    for (let k = 0; k < 4; k++) { const b = mesh(new THREE.BoxGeometry(0.42, 0.02, 0.09), M(mats, D())); b.rotation.y = (k / 4) * Math.PI; f.add(b); }
    return f;
  });
  return (t) => fans.forEach((f, i) => { f.rotation.y = t * (3 + i); });
});
add("cloud", "C", "Cloud and rack", (g, mats, c) => {
  box(g, mats, 0.7, 0.95, 0.6, D(), 0, 0.48, 0, { r: 0.5 });
  const leds = [];
  for (let i = 0; i < 4; i++) { box(g, mats, 0.56, 0.14, 0.02, "#30353f", 0, 0.2 + i * 0.2, 0.305, { keep: true }); const l = lit(mats, i % 2 ? c : "#4ade80"); g.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), l, -0.2, 0.2 + i * 0.2, 0.32)); leds.push(l); }
  const cl = new THREE.Group(); g.add(cl);
  const m = M(mats, "#eef1f6", { r: 0.9 });
  [[0, 0, 0, 0.42], [0.42, -0.06, 0, 0.32], [-0.42, -0.08, 0, 0.3], [0.18, 0.2, 0.05, 0.3], [-0.16, 0.17, -0.05, 0.28]].forEach(([x, y, z, r]) => cl.add(mesh(new THREE.SphereGeometry(r, 20, 14), m, x, y, z)));
  const b = blink(leds);
  return (t) => { cl.position.y = 1.65 + Math.sin(t * 1.2) * 0.08; b(t); };
});

// ------------------------------------------------------------ key, secrets
add("key", "B", "Padlock", (g, mats, c) => {
  box(g, mats, 1.0, 0.85, 0.42, G(), 0, 0.5, 0, { m: 0.8, r: 0.3 });
  const sh = mesh(new THREE.TorusGeometry(0.3, 0.08, 14, 32, Math.PI), M(mats, S(), { m: 0.9, r: 0.25 }), 0, 0.95, 0); g.add(sh);
  for (const x of [-0.3, 0.3]) sh.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 14), M(mats, S(), { m: 0.9 }), x, -0.1, 0));
  cyl(g, mats, 0.08, 0.08, 0.03, D(), 0, 0.56, 0.22, {}, 16).rotation.x = Math.PI / 2;
  box(g, mats, 0.05, 0.14, 0.03, D(), 0, 0.44, 0.22);
  box(g, mats, 0.6, 0.06, 0.03, c, 0, 0.2, 0.215);
  return (t) => { sh.position.y = 0.95 + Math.max(0, Math.sin(t * 1.1)) * 0.14; };
});
add("key", "C", "Access card", (g, mats, c) => {
  box(g, mats, 0.62, 1.15, 0.24, D(), -0.3, 0.6, 0, { r: 0.5 });
  box(g, mats, 0.42, 0.42, 0.02, "#2b3039", -0.3, 0.75, 0.125, { keep: true });
  const led = lit(mats, "#4ade80"); g.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), led, -0.3, 1.05, 0.13));
  const card = new THREE.Group(); g.add(card);
  card.add(mesh(new THREE.BoxGeometry(0.82, 0.52, 0.03), M(mats, c, { r: 0.5 })));
  card.add(mesh(new THREE.BoxGeometry(0.16, 0.12, 0.01), M(mats, G(), { m: 0.8 }), -0.22, 0.04, 0.02));
  card.add(mesh(new THREE.BoxGeometry(0.4, 0.04, 0.01), M(mats, L()), 0.12, -0.14, 0.02));
  return (t) => {
    const u = Math.max(0, Math.sin(t * 1.1));
    card.position.set(0.25 - u * 0.45, 0.78, 0.45 - u * 0.25); card.rotation.y = -0.4 + u * 0.4;
    led.color.set(u > 0.9 ? "#4ade80" : "#f5b544"); led.emissive.copy(led.color);
  };
});

// ------------------------------------------------------------ security
function shieldShape() {
  const sh = new THREE.Shape(); sh.moveTo(0, 0.9); sh.lineTo(0.62, 0.68); sh.lineTo(0.6, 0.1); sh.quadraticCurveTo(0.5, -0.5, 0, -0.75); sh.quadraticCurveTo(-0.5, -0.5, -0.6, 0.1); sh.lineTo(-0.62, 0.68); sh.lineTo(0, 0.9);
  return sh;
}
add("security", "B", "Checked shield", (g, mats, c) => {
  const s = new THREE.Group(); s.position.y = 1.0; g.add(s);
  s.add(mesh(new THREE.ExtrudeGeometry(shieldShape(), { depth: 0.14, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 }), M(mats, L(), { r: 0.5 }), 0, 0, -0.07));
  const inner = mesh(new THREE.ExtrudeGeometry(shieldShape(), { depth: 0.04, bevelEnabled: false }), M(mats, c, { r: 0.5 }), 0, 0.02, 0.12); inner.scale.setScalar(0.8); s.add(inner);
  const ck = M(mats, "#ffffff", { r: 0.5 });
  const a = mesh(new THREE.BoxGeometry(0.1, 0.32, 0.06), ck, -0.12, 0.02, 0.2); a.rotation.z = 0.75; s.add(a);
  const b = mesh(new THREE.BoxGeometry(0.1, 0.6, 0.06), ck, 0.12, 0.12, 0.2); b.rotation.z = -0.6; s.add(b);
  cyl(g, mats, 0.3, 0.38, 0.1, D(), 0, 0.05, 0);
  return (t) => { s.rotation.y = Math.sin(t * 0.8) * 0.4; };
});
add("security", "C", "Vault door", (g, mats, c) => {
  box(g, mats, 1.8, 1.8, 0.22, D(), 0, 0.95, -0.15, { r: 0.5 });
  const door = new THREE.Group(); door.position.set(0, 0.95, 0); g.add(door);
  door.add(mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.16, 48).rotateX(Math.PI / 2), M(mats, S(), { m: 0.85, r: 0.3 })));
  door.add(mesh(new THREE.TorusGeometry(0.62, 0.035, 10, 48), M(mats, c), 0, 0, 0.09));
  const hub = new THREE.Group(); hub.position.z = 0.12; door.add(hub);
  hub.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 24).rotateX(Math.PI / 2), M(mats, D())));
  for (let i = 0; i < 4; i++) { const s = mesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), M(mats, S(), { m: 0.85 }), 0, 0, 0.04); s.rotation.z = (i / 4) * Math.PI; hub.add(s); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; door.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10).rotateX(Math.PI / 2), M(mats, D()), Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0.09)); }
  return (t) => { hub.rotation.z = Math.sin(t * 0.7) * 1.2; };
});

// ------------------------------------------------------------ swap
add("swap", "B", "Arrows", (g, mats, c) => {
  const r = new THREE.Group(); r.position.y = 1.05; g.add(r);
  [[c, 0], [G(), Math.PI]].forEach(([col, rot]) => {
    const a = new THREE.Group(); a.rotation.z = rot; r.add(a);
    const m = M(mats, col, { r: 0.5, m: col === G() ? 0.7 : 0.1 });
    a.add(mesh(new THREE.TorusGeometry(0.55, 0.1, 12, 32, Math.PI * 0.78), m));
    const head = mesh(new THREE.ConeGeometry(0.2, 0.32, 16), m, 0.55 * Math.cos(Math.PI * 0.78) - 0.06, 0.55 * Math.sin(Math.PI * 0.78) - 0.1, 0); head.rotation.z = Math.PI * 0.78 + Math.PI; a.add(head);
  });
  cyl(g, mats, 0.05, 0.05, 0.4, S(), 0, 0.2, -0.05, {}, 10);
  return (t) => { r.rotation.z = -t * 0.9; };
});
add("swap", "C", "Scales", (g, mats, c) => {
  cyl(g, mats, 0.35, 0.42, 0.1, D(), 0, 0.05, 0);
  cyl(g, mats, 0.05, 0.06, 1.5, S(), 0, 0.8, 0, { m: 0.8 }, 12);
  const beam = new THREE.Group(); beam.position.y = 1.55; g.add(beam);
  beam.add(mesh(new THREE.BoxGeometry(1.6, 0.06, 0.08), M(mats, S(), { m: 0.8 })));
  ball(g, mats, 0.08, c, 0, 1.6, 0);
  const pans = [-0.75, 0.75].map((x, i) => {
    const p = new THREE.Group(); p.position.x = x; beam.add(p);
    p.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 4), M(mats, S()), 0, -0.3, 0));
    p.add(mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.06, 24), M(mats, S(), { m: 0.8 }), 0, -0.62, 0));
    for (let k = 0; k < 2 + i; k++) p.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 24), M(mats, i ? G() : c, { m: 0.7, r: 0.3 }), 0, -0.56 + k * 0.055, 0));
    return p;
  });
  return (t) => { beam.rotation.z = Math.sin(t * 1.1) * 0.18; pans.forEach((p) => { p.rotation.z = -beam.rotation.z; }); };
});

// ------------------------------------------------------------ chart
function lineTex(c) {
  return tex("line" + c, 512, 300, (x, w, h) => {
    x.fillStyle = P.soft ? "#2d3247" : "#0d0f13"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "rgba(255,255,255,.08)"; x.lineWidth = 2; for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(0, i * 60); x.lineTo(w, i * 60); x.stroke(); }
    const pts = [[20, 240], [80, 210], [130, 225], [190, 160], [250, 175], [310, 110], [370, 130], [430, 70], [492, 85]];
    x.fillStyle = c + "33"; x.beginPath(); x.moveTo(20, h); pts.forEach(([a, b]) => x.lineTo(a, b)); x.lineTo(492, h); x.fill();
    x.strokeStyle = c; x.lineWidth = 7; x.lineJoin = "round"; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke();
    x.fillStyle = "#ffffff"; x.beginPath(); x.arc(492, 85, 10, 0, Math.PI * 2); x.fill();
  });
}
add("chart", "B", "Line", (g, mats, c) => {
  const b = new THREE.Group(); b.position.y = 1.0; b.rotation.x = -0.1; g.add(b);
  b.add(mesh(new THREE.BoxGeometry(1.8, 1.1, 0.08), M(mats, D(), { r: 0.5 })));
  plane(b, mats, 1.68, 0.98, lineTex(c), 0, 0, 0.045);
  box(g, mats, 0.9, 0.08, 0.5, D(), 0, 0.04, 0.05);
  cyl(g, mats, 0.05, 0.05, 0.5, S(), 0, 0.3, -0.05, {}, 10);
  return null;
});
add("chart", "C", "Pie", (g, mats, c) => {
  const p = new THREE.Group(); p.position.y = 0.3; g.add(p);
  const parts = [[0, 1.3, c, 0.28], [1.3, 1.9, L(), 0.2], [3.2, 1.6, G(), 0.24], [4.8, Math.PI * 2 - 4.8, S(), 0.16]];
  const slices = parts.map(([a, len, col, h], i) => {
    const s = mesh(new THREE.CylinderGeometry(0.8, 0.8, h, 48, 1, false, a, len), M(mats, col, { r: 0.5 }), 0, h / 2, 0); p.add(s);
    s.userData.mid = a + len / 2; s.userData.i = i; return s;
  });
  return (t) => { p.rotation.y = t * 0.4; const k = Math.max(0, Math.sin(t * 1.4)) * 0.18; slices[0].position.x = Math.sin(slices[0].userData.mid) * k; slices[0].position.z = Math.cos(slices[0].userData.mid) * k; };
});
