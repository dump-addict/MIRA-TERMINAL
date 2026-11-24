/* 3D object library: one object per block kind, independent of the business domain.
   A server stays a server, whether at Amazon or elsewhere: it is the brand badge placed above it that changes.
   "Diorama" style: rounded shapes, matte materials, bold colours. For a new domain, add a `case` in build(). */
import * as THREE from "three";
import { KIND_BASE } from "./icons.js";

let C = null;
export function setContext(ctx) { C = ctx; }

// material palette, changed by the theme (light: matte clay; dark: graphite)
export const P = { soft: true, metal: 0.25, glow: 0.6, models: {} };
// object variants offered in the workshop: VARIANTS[kind][letter] = { label, fn(g, mats, color) -> tick }, filled in by models3d.js
// letter A is the original object (the switch in build); P.models[kind] picks the variant
export const VARIANTS = {};
let GOLD = "#f6c453", SILVER = "#cfd6e2", DARK = "#4a5068", LIGHT = "#fbf8f3";
export function setPalette(o) { Object.assign(P, o); ({ GOLD, SILVER, DARK, LIGHT } = P); }

const slate = new THREE.Color();
export function M(mats, color, o = {}) {
  const col = new THREE.Color(color);
  // in clay style, very dark greys become the theme's soft slate
  if (P.soft && !o.e && !o.keep && col.getHSL({}).l < 0.2) col.lerp(slate.set(DARK), 0.75);
  const m = new THREE.MeshStandardMaterial({ color: col, roughness: P.soft ? Math.max(o.r ?? 0.55, 0.5) : Math.min(o.r ?? 0.55, 0.42), metalness: P.soft ? Math.min(o.m ?? 0.05, P.metal) : Math.max(Math.min(o.m ?? 0.05, P.metal), 0.25), emissive: o.e || "#000000", emissiveIntensity: (o.ei ?? 1) * P.glow, flatShading: !!o.flat, transparent: true, opacity: o.op ?? 1, side: o.side || THREE.FrontSide });
  m.userData.baseOpacity = o.op ?? 1;
  mats.push(m); return m;
}

// boxes with rounded corners (cached): any BoxGeometry passed to mesh() gets rounded
const rcache = new Map();
export function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  r = Math.max(0.0001, Math.min(r, w / 2, h / 2));
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
export function rbox(w, h, d, r) {
  const k = [w, h, d, r].map((v) => v.toFixed(3)).join(",");
  if (rcache.has(k)) return rcache.get(k);
  const b = Math.min(r, h / 2 - 0.001, w / 2 - 0.001, d / 2 - 0.001);
  const geo = new THREE.ExtrudeGeometry(roundRect(w - 2 * b, d - 2 * b, Math.min(r * 1.2, (Math.min(w, d) - 2 * b) / 2)), { depth: Math.max(0.001, h - 2 * b), bevelEnabled: b > 0.002, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2); geo.center(); geo.computeVertexNormals();
  rcache.set(k, geo); return geo;
}
export function mesh(geo, mat, x = 0, y = 0, z = 0) {
  if (geo.type === "BoxGeometry") {
    const { width: w, height: h, depth: d } = geo.parameters;
    const r = Math.min(w, h, d) * 0.14;
    if (r > 0.008) { geo.dispose(); geo = rbox(w, h, d, r); }
  }
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
export const shade = (hex, f) => { const c = new THREE.Color(hex); c.multiplyScalar(f); return c; };

const screenTex = {};
export function screenTexture(color) {
  const key = color + (P.soft ? "s" : "d");
  if (screenTex[key]) return screenTex[key];
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 160;
  const g = cv.getContext("2d");
  g.fillStyle = P.soft ? "#2d3247" : "#0d0f13"; g.fillRect(0, 0, 256, 160);
  g.fillStyle = P.soft ? "#3a4058" : "#1c1f26"; g.fillRect(0, 0, 256, 18);
  g.fillStyle = color; g.fillRect(10, 6, 30, 6);
  g.strokeStyle = color; g.lineWidth = 4; g.lineJoin = "round"; g.beginPath();
  [[12, 110], [40, 96], [62, 104], [90, 70], [118, 80], [146, 52], [170, 60], [196, 36], [214, 44]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? "#4a5068" : color; g.globalAlpha = i % 2 ? 1 : 0.8; g.fillRect(228, 30 + i * 28, 20, 20); }
  g.globalAlpha = 1; g.fillStyle = P.soft ? "#3a4058" : "#232730"; g.fillRect(12, 128, 200, 18);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return (screenTex[key] = t);
}

// ------------------------------------------------------------ brand badge (logo or name) above the object
const logoCache = new Map();
function brandOf(n) {
  const b = n.brand; if (!b) return null;
  return typeof b === "string" ? { name: b } : b;
}
function badgeTexture(b) {
  const key = JSON.stringify(b) + P.soft;
  if (logoCache.has(key)) return logoCache.get(key);
  const cv = document.createElement("canvas"); cv.width = cv.height = 256;
  const g = cv.getContext("2d");
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const bg = b.bg || "#ffffff", fg = b.color || "#1f2330";
  const base = () => { g.clearRect(0, 0, 256, 256); g.fillStyle = bg; g.fillRect(0, 0, 256, 256); };
  const text = () => {
    base();
    const name = b.short || b.name || "?";
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
    let fs = 120; g.font = `800 ${fs}px -apple-system, "Inter", system-ui, sans-serif`;
    while (g.measureText(name).width > 210 && fs > 34) { fs -= 6; g.font = `800 ${fs}px -apple-system, "Inter", system-ui, sans-serif`; }
    g.fillText(name, 128, 134); tex.needsUpdate = true;
  };
  text();
  if (b.logo) {
    const img = new Image(); img.width = img.height = 256;
    img.onload = () => {
      base();
      if (b.full) { try { g.clearRect(0, 0, 256, 256); g.drawImage(img, 0, 0, 256, 256); tex.needsUpdate = true; } catch (e) { text(); } return; }  // app icon: it fills the badge
      const r = Math.min(176 / (img.naturalWidth || 256), 176 / (img.naturalHeight || 256));
      const w = (img.naturalWidth || 256) * r, h = (img.naturalHeight || 256) * r;
      try { g.drawImage(img, 128 - w / 2, 128 - h / 2, w, h); tex.needsUpdate = true; } catch (e) { text(); }
    };
    img.src = "/logos/" + encodeURIComponent(b.logo);
  }
  logoCache.set(key, tex); return tex;
}
// returns a group to place above the object; it turns gently to stay readable
export function badge(n, mats) {
  const b = brandOf(n); if (!b) return null;
  const grp = new THREE.Group();
  grp.add(mesh(rbox(0.86, 0.86, 0.12, 0.2), M(mats, P.soft ? "#ffffff" : "#2a2e36", { r: 0.5 })));
  const fm = new THREE.MeshBasicMaterial({ map: badgeTexture(b), transparent: true }); fm.userData.baseOpacity = 1; mats.push(fm);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), fm);
  face.position.z = 0.065; grp.add(face);
  const back = face.clone(); back.rotation.y = Math.PI; back.position.z = -0.065; grp.add(back);
  grp.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8), M(mats, P.soft ? "#ffffff" : SILVER), 0, -0.6, 0));
  return grp;
}

export function build(kind, color, mats, variant) {
  kind = KIND_BASE[kind] || kind;
  const g = new THREE.Group(); let tick = null;
  const c = color, cd = shade(color, 0.55);
  const v = variant || P.models[kind];
  if (v && v !== "A" && VARIANTS[kind] && VARIANTS[kind][v]) return { g, tick: VARIANTS[kind][v].fn(g, mats, color) || null };
  switch (kind) {
    case "server": case "api": {
      const leds = [];
      for (let i = 0; i < 3; i++) {
        const y = 0.24 + i * 0.47;
        g.add(mesh(new THREE.BoxGeometry(1.5, 0.42, 1.1), M(mats, DARK, { r: 0.4, m: 0.3 }), 0, y, 0));
        if (i < 2) g.add(mesh(new THREE.BoxGeometry(1.42, 0.05, 1.02), M(mats, c, { e: c, ei: 1 }), 0, y + 0.235, 0));
        g.add(mesh(new THREE.BoxGeometry(1.36, 0.3, 0.02), M(mats, "#353a44"), 0, y, 0.56));
        for (let s = 0; s < 3; s++) g.add(mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), M(mats, "#1b1e24"), 0.25, y - 0.08 + s * 0.08, 0.575));
        const led = M(mats, "#4ade80", { e: "#4ade80", ei: 1 });
        g.add(mesh(new THREE.SphereGeometry(0.05, 12, 8), led, -0.5, y, 0.58));
        const led2 = M(mats, c, { e: c, ei: 1 });
        g.add(mesh(new THREE.SphereGeometry(0.04, 12, 8), led2, -0.36, y, 0.58));
        leds.push(led, led2);
      }
      tick = (t) => leds.forEach((m, i) => { m.emissiveIntensity = 0.3 + 0.7 * (Math.sin(t * (3 + i) + i * 1.7) > 0 ? 1 : 0.2); });
      break;
    }
    case "app": {
      g.add(mesh(new THREE.BoxGeometry(1.9, 0.07, 1.25), M(mats, LIGHT, { m: 0.4, r: 0.35 }), 0, 0.04, 0.15));
      g.add(mesh(new THREE.BoxGeometry(1.5, 0.01, 0.55), M(mats, "#b9bdc6"), 0, 0.08, 0.3));
      const hinge = new THREE.Group(); hinge.position.set(0, 0.08, -0.45); hinge.rotation.x = -0.22; g.add(hinge);
      hinge.add(mesh(new THREE.BoxGeometry(1.9, 1.2, 0.06), M(mats, LIGHT, { m: 0.4, r: 0.35 }), 0, 0.6, 0));
      const scr = new THREE.MeshBasicMaterial({ map: screenTexture(color), transparent: true }); scr.userData.baseOpacity = 1; mats.push(scr);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 1.04), scr); face.position.set(0, 0.6, 0.032); hinge.add(face);
      tick = (t) => { hinge.rotation.x = -0.22 + Math.sin(t * 0.8) * 0.02; };
      break;
    }
    case "wallet": {
      // wallet closed by a flap, a card sticking out behind, a coin coming out the top without passing through the leather
      g.add(mesh(rbox(1.7, 1.0, 0.5, 0.12), M(mats, cd, { r: 0.8 }), 0, 0.55, 0));
      g.add(mesh(rbox(1.0, 0.5, 0.04, 0.02), M(mats, LIGHT, { r: 0.6 }), -0.25, 1.1, -0.12));
      g.add(mesh(rbox(1.74, 0.46, 0.56, 0.1), M(mats, c, { r: 0.7 }), 0, 0.86, 0.02));
      g.add(mesh(rbox(0.26, 0.18, 0.08, 0.04), M(mats, GOLD, { m: 0.8, r: 0.25 }), 0.55, 0.7, 0.3));
      const coinG = new THREE.Group(); coinG.position.set(0.42, 1.4, -0.1); g.add(coinG);
      const coin = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 32), M(mats, GOLD, { m: 0.85, r: 0.25 }));
      coin.rotation.x = Math.PI / 2; coinG.add(coin);
      tick = (t) => { coinG.position.y = 1.4 + Math.sin(t * 1.4) * 0.07; coinG.rotation.y = Math.sin(t * 0.9) * 0.6; };
      break;
    }
    case "user": {
      const body = mesh(new THREE.CapsuleGeometry(0.34, 0.55, 6, 16), M(mats, c), 0, 0.62, 0); g.add(body);
      const head = mesh(new THREE.SphereGeometry(0.3, 24, 16), M(mats, LIGHT), 0, 1.38, 0); g.add(head);
      tick = (t) => { g.rotation.y = Math.sin(t * 0.7) * 0.4; head.position.y = 1.38 + Math.sin(t * 2) * 0.03; };
      break;
    }
    case "engine": {
      g.add(mesh(new THREE.BoxGeometry(1.3, 0.16, 1.3), M(mats, DARK, { m: 0.3 }), 0, 0.1, 0));
      for (let i = 0; i < 5; i++) for (const [x, z, w, d] of [[-0.75, -0.5 + i * 0.25, 0.2, 0.06], [0.75, -0.5 + i * 0.25, 0.2, 0.06], [-0.5 + i * 0.25, -0.75, 0.06, 0.2], [-0.5 + i * 0.25, 0.75, 0.06, 0.2]])
        g.add(mesh(new THREE.BoxGeometry(w, 0.04, d), M(mats, SILVER, { m: 0.9, r: 0.3 }), x, 0.06, z));
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.06, 0.7), M(mats, c, { e: c, ei: 0.35 }), 0, 0.21, 0));
      const gear = new THREE.Group(); gear.position.y = 0.95; g.add(gear);
      const gm = M(mats, SILVER, { m: 0.7, r: 0.35 });
      gear.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 24), gm));
      for (let i = 0; i < 10; i++) { const tth = mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), gm); const a = (i / 10) * Math.PI * 2; tth.position.set(Math.cos(a) * 0.48, 0, Math.sin(a) * 0.48); tth.rotation.y = -a; gear.add(tth); }
      gear.rotation.x = Math.PI / 2.4;
      tick = (t) => { gear.rotation.y = t * 0.9; };
      break;
    }
    case "math": {
      g.add(mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.25, 24), M(mats, DARK), 0, 0.13, 0));
      const core = new THREE.Group(); core.position.y = 1.0; g.add(core);
      core.add(mesh(new THREE.IcosahedronGeometry(0.5, 0), M(mats, c, { flat: true, r: 0.35 })));
      const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), new THREE.MeshBasicMaterial({ color: LIGHT, wireframe: true, transparent: true, opacity: 0.35 }));
      wire.material.userData.baseOpacity = 0.35; mats.push(wire.material); core.add(wire);
      const orb = [GOLD, "#7dd3fc", "#f9a8d4"].map((col) => { const s = mesh(new THREE.SphereGeometry(0.09, 12, 8), M(mats, col, { e: col, ei: 0.5 })); g.add(s); return s; });
      tick = (t) => {
        core.rotation.y = t * 0.6; core.rotation.x = t * 0.3; core.position.y = 1.0 + Math.sin(t * 1.4) * 0.06;
        orb.forEach((s, i) => { const a = t * (1.2 + i * 0.3) + i * 2.1; s.position.set(Math.cos(a) * 0.95, 1.0 + Math.sin(a * 1.3) * 0.25, Math.sin(a) * 0.95); });
      };
      break;
    }
    case "relay": {
      g.add(mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.2, 20), M(mats, DARK), 0, 0.1, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.4, 12), M(mats, SILVER, { m: 0.8 }), 0, 0.9, 0));
      g.add(mesh(new THREE.SphereGeometry(0.13, 16, 12), M(mats, c, { e: c, ei: 0.8 }), 0, 1.65, 0));
      const rings = [0, 1, 2].map(() => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, side: THREE.DoubleSide }); m.userData.baseOpacity = 0.6; m.userData.anim = true; mats.push(m); const r = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.02, 8, 48), m); r.position.y = 1.65; r.rotation.x = Math.PI / 2; g.add(r); return r; });
      tick = (t) => rings.forEach((r, i) => { const u = ((t * 0.6 + i / 3) % 1); r.scale.setScalar(0.3 + u * 2.2); r.material.opacity = r.material.userData.baseOpacity * (1 - u) * (r.material.userData.dimF ?? 1); });
      break;
    }
    case "clock": {
      const face = new THREE.Group(); face.position.y = 0.98; g.add(face);
      face.add(mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.18, 40), M(mats, LIGHT), 0, 0, 0).rotateX(Math.PI / 2));
      face.add(mesh(new THREE.TorusGeometry(0.78, 0.06, 10, 48), M(mats, c, { m: 0.4 })));
      const hm = M(mats, DARK);
      const h1 = new THREE.Group(), h2 = new THREE.Group(); h1.position.z = h2.position.z = 0.1; face.add(h1, h2);
      h1.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.03), hm, 0, 0.2, 0)); h2.add(mesh(new THREE.BoxGeometry(0.04, 0.6, 0.03), hm, 0, 0.3, 0));
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), M(mats, DARK), -0.4, 0.12, 0), mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), M(mats, DARK), 0.4, 0.12, 0));
      tick = (t) => { h2.rotation.z = -t * 1.6; h1.rotation.z = -t * 0.13; };
      break;
    }
    case "alert": {
      g.add(mesh(new THREE.BoxGeometry(1.2, 0.08, 0.12), M(mats, DARK), 0, 1.75, 0));
      const pivot = new THREE.Group(); pivot.position.y = 1.72; g.add(pivot);
      const prof = [[0, -1.2], [0.62, -1.2], [0.6, -1.08], [0.5, -0.8], [0.42, -0.45], [0.38, -0.2], [0.2, -0.05], [0, -0.02]].map(([x, y]) => new THREE.Vector2(x, y));
      pivot.add(mesh(new THREE.LatheGeometry(prof, 32), M(mats, GOLD, { m: 0.85, r: 0.3, side: THREE.DoubleSide })));
      pivot.add(mesh(new THREE.SphereGeometry(0.12, 16, 12), M(mats, "#a17a2a", { m: 0.7 }), 0, -1.22, 0));
      tick = (t) => { const st = C && g.userData.id ? C.nodeStatus(g.userData.id) : "ok"; pivot.rotation.z = Math.sin(t * (st === "warn" || st === "fail" ? 6 : 1.8)) * (st === "warn" || st === "fail" ? 0.35 : 0.08); };
      break;
    }
    case "contract": case "chain": {
      const cubes = [];
      const pos = kind === "chain" ? [[0, 0.33, 0], [0.12, 0.97, 0.05], [-0.06, 1.6, -0.04]] : [[-0.62, 0.34, 0], [0.05, 0.34, 0.15], [0.7, 0.34, -0.05]];
      pos.forEach(([x, y, z], i) => { const b = mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), M(mats, i === 1 ? c : shade(color, 0.75 + i * 0.12), { r: 0.45 }), x, y, z); g.add(b); cubes.push(b); });
      if (kind === "contract") for (let i = 0; i < 2; i++) { const l = mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 20), M(mats, SILVER, { m: 0.9 }), -0.29 + i * 0.66, 0.42, 0.06); l.rotation.y = Math.PI / 2; g.add(l); }
      tick = (t) => cubes.forEach((b, i) => { b.rotation.y = Math.sin(t * 0.8 + i) * 0.25; if (kind === "contract") b.position.y = 0.34 + Math.max(0, Math.sin(t * 2 + i * 1.3)) * 0.12; else b.rotation.y = t * 0.3 * (i % 2 ? -1 : 1); });
      break;
    }
    case "oracle": {
      g.add(mesh(new THREE.CylinderGeometry(0.32, 0.5, 0.35, 24), M(mats, DARK, { m: 0.3 }), 0, 0.18, 0));
      g.add(mesh(new THREE.SphereGeometry(0.62, 32, 24), M(mats, "#cfe7ff", { r: 0.05, m: 0.1, op: 0.32 }), 0, 0.98, 0));
      const inner = mesh(new THREE.SphereGeometry(0.22, 20, 14), M(mats, c, { e: c, ei: 0.9 }), 0, 0.98, 0); g.add(inner);
      tick = (t) => { inner.scale.setScalar(0.85 + Math.sin(t * 2.5) * 0.18); };
      break;
    }
    case "swap": {
      const a = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.09, 32), M(mats, GOLD, { m: 0.85, r: 0.25 }));
      const b = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.09, 32), M(mats, SILVER, { m: 0.85, r: 0.25 }));
      [a, b].forEach((m) => { m.rotation.x = Math.PI / 2; g.add(m); });
      g.add(mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.16, 24), M(mats, DARK), 0, 0.08, 0));
      tick = (t) => { [a, b].forEach((m, i) => { const ang = t * 1.3 + i * Math.PI; m.position.set(Math.cos(ang) * 0.5, 0.95 + Math.sin(ang) * 0.35, Math.sin(ang) * 0.15); m.rotation.z = t * 2; }); };
      break;
    }
    case "token": {
      for (let i = 0; i < 4; i++) g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.11, 32), M(mats, GOLD, { m: 0.85, r: 0.25 }), (i % 2) * 0.04, 0.06 + i * 0.115, 0));
      const top = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.09, 32), M(mats, c, { m: 0.6, r: 0.3 }), 0, 1.15, 0); top.rotation.x = Math.PI / 2; g.add(top);
      tick = (t) => { top.rotation.z = t * 2.2; top.position.y = 1.15 + Math.sin(t * 1.5) * 0.08; };
      break;
    }
    case "feed": {
      g.add(mesh(new THREE.CylinderGeometry(0.3, 0.45, 0.22, 20), M(mats, DARK), 0, 0.11, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 10), M(mats, SILVER, { m: 0.8 }), 0, 0.55, 0));
      const head = new THREE.Group(); head.position.y = 0.95; g.add(head);
      const dish = mesh(new THREE.SphereGeometry(0.75, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2.8), M(mats, LIGHT, { side: THREE.DoubleSide, r: 0.4 })); dish.rotation.x = Math.PI; head.add(dish);
      const tip = mesh(new THREE.SphereGeometry(0.09, 12, 8), M(mats, c, { e: c, ei: 1 }), 0, -0.05, 0); head.add(tip);
      head.rotation.x = -0.6 + Math.PI;
      tick = (t) => { head.rotation.y = t * 0.5; tip.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 4)) * 0.8; };
      break;
    }
    case "external": {
      g.add(mesh(new THREE.CylinderGeometry(0.22, 0.4, 0.2, 20), M(mats, DARK), 0, 0.1, 0));
      const globe = new THREE.Group(); globe.position.y = 0.98; g.add(globe);
      globe.add(mesh(new THREE.SphereGeometry(0.64, 32, 24), M(mats, c, { r: 0.6 })));
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.67, 16, 10), new THREE.MeshBasicMaterial({ color: LIGHT, wireframe: true, transparent: true, opacity: 0.28 }));
      w.material.userData.baseOpacity = 0.28; mats.push(w.material); globe.add(w);
      globe.rotation.z = 0.4;
      tick = (t) => { globe.rotation.y = t * 0.4; };
      break;
    }
    case "database": case "chart": {
      if (kind === "database") {
        for (let i = 0; i < 3; i++) {
          g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.34, 32), M(mats, i === 2 ? c : shade(color, 0.7 + i * 0.1), { r: 0.45 }), 0, 0.2 + i * 0.4, 0));
          g.add(mesh(new THREE.TorusGeometry(0.62, 0.025, 6, 40), M(mats, LIGHT), 0, 0.38 + i * 0.4, 0).rotateX(Math.PI / 2));
        }
      } else {
        g.add(mesh(new THREE.BoxGeometry(1.5, 0.06, 0.8), M(mats, DARK), 0, 0.03, 0));
        const bars = [0, 1, 2, 3].map((i) => { const b = mesh(new THREE.BoxGeometry(0.26, 1, 0.26), M(mats, i % 2 ? c : LIGHT), -0.5 + i * 0.34, 0.5, 0); g.add(b); return b; });
        tick = (t) => bars.forEach((b, i) => { const h = 0.4 + (Math.sin(t * 1.2 + i * 1.1) + 1) * 0.5; b.scale.y = h; b.position.y = 0.06 + h / 2; });
      }
      break;
    }
    case "cloud": {
      const cl = new THREE.Group(); g.add(cl);
      const m = M(mats, "#eef1f6", { r: 0.9 });
      [[0, 0, 0, 0.5], [0.5, -0.08, 0, 0.38], [-0.5, -0.1, 0, 0.36], [0.22, 0.25, 0.05, 0.36], [-0.2, 0.2, -0.05, 0.33]].forEach(([x, y, z, r]) => cl.add(mesh(new THREE.SphereGeometry(r, 20, 14), m, x, y, z)));
      g.add(mesh(new THREE.ConeGeometry(0.25, 0.32, 3), M(mats, c), 0, 0.2, 0));
      tick = (t) => { cl.position.y = 1.15 + Math.sin(t * 1.2) * 0.12; };
      break;
    }
    case "research": case "test": {
      if (kind === "research") {
        const prof = [[0, 0], [0.55, 0], [0.62, 0.1], [0.55, 0.45], [0.2, 0.95], [0.18, 1.35], [0.24, 1.42], [0, 1.42]].map(([x, y]) => new THREE.Vector2(x, y));
        g.add(mesh(new THREE.LatheGeometry(prof, 32), M(mats, "#d8ecff", { op: 0.3, r: 0.05, side: THREE.DoubleSide })));
        const liq = [[0, 0.03], [0.52, 0.03], [0.58, 0.12], [0.5, 0.45], [0, 0.45]].map(([x, y]) => new THREE.Vector2(x, y));
        g.add(mesh(new THREE.LatheGeometry(liq, 32), M(mats, c, { e: c, ei: 0.4 })));
        const bubbles = [0, 1, 2, 3].map(() => { const b = mesh(new THREE.SphereGeometry(0.06, 10, 8), M(mats, LIGHT, { op: 0.8 })); g.add(b); return b; });
        tick = (t) => bubbles.forEach((b, i) => { const u = (t * 0.5 + i / 4) % 1; b.position.set(Math.sin(i * 2.3) * 0.12, 0.4 + u * 1.3, Math.cos(i * 1.7) * 0.1); b.scale.setScalar(1 - u * 0.5); });
      } else {
        g.add(mesh(new THREE.BoxGeometry(1.4, 0.2, 0.5), M(mats, DARK), 0, 0.1, 0));
        [0.35, 0.6, 0.85].forEach((h, i) => {
          const x = -0.42 + i * 0.42;
          g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.1, 16), M(mats, "#d8ecff", { op: 0.3, r: 0.05 }), x, 0.75, 0));
          g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, h, 16), M(mats, [c, GOLD, "#7dd3fc"][i], { e: [c, GOLD, "#7dd3fc"][i], ei: 0.3 }), x, 0.22 + h / 2, 0));
        });
      }
      break;
    }
    case "key": {
      const k = new THREE.Group(); k.position.y = 0.95; g.add(k);
      const m = M(mats, GOLD, { m: 0.85, r: 0.25 });
      k.add(mesh(new THREE.TorusGeometry(0.3, 0.1, 12, 28), m, -0.45, 0, 0));
      k.add(mesh(new THREE.BoxGeometry(0.9, 0.14, 0.1), m, 0.25, 0, 0));
      k.add(mesh(new THREE.BoxGeometry(0.1, 0.25, 0.1), m, 0.55, -0.15, 0), mesh(new THREE.BoxGeometry(0.1, 0.18, 0.1), m, 0.35, -0.12, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.16, 20), M(mats, DARK), 0, 0.08, 0));
      tick = (t) => { k.rotation.y = t * 0.8; };
      break;
    }
    case "deploy": {
      const r = new THREE.Group(); g.add(r);
      r.add(mesh(new THREE.CylinderGeometry(0.28, 0.3, 1.0, 20), M(mats, LIGHT), 0, 0.85, 0));
      r.add(mesh(new THREE.ConeGeometry(0.28, 0.45, 20), M(mats, c), 0, 1.57, 0));
      for (let i = 0; i < 3; i++) { const f = mesh(new THREE.BoxGeometry(0.05, 0.35, 0.3), M(mats, c), 0, 0.45, 0); const a = (i / 3) * Math.PI * 2; f.position.x = Math.cos(a) * 0.3; f.position.z = Math.sin(a) * 0.3; f.rotation.y = -a; r.add(f); }
      const flame = mesh(new THREE.ConeGeometry(0.18, 0.4, 16), M(mats, "#fb923c", { e: "#fb923c", ei: 1 }), 0, 0.17, 0); flame.rotation.x = Math.PI; r.add(flame);
      tick = (t) => { r.position.y = Math.sin(t * 1.5) * 0.08; flame.scale.y = 0.8 + Math.random() * 0.4; };
      break;
    }
    case "security": {
      const sh = new THREE.Shape(); sh.moveTo(0, 0.9); sh.lineTo(0.62, 0.68); sh.lineTo(0.6, 0.1); sh.quadraticCurveTo(0.5, -0.5, 0, -0.75); sh.quadraticCurveTo(-0.5, -0.5, -0.6, 0.1); sh.lineTo(-0.62, 0.68); sh.lineTo(0, 0.9);
      const s = mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }), M(mats, c, { r: 0.4 }), 0, 1.0, -0.08); g.add(s);
      tick = (t) => { s.rotation.y = Math.sin(t * 0.8) * 0.4; };
      break;
    }
    default: {
      g.add(mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), M(mats, c, { r: 0.45 }), 0, 0.58, 0));
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.08, 0.02), M(mats, LIGHT), 0, 0.8, 0.56), mesh(new THREE.BoxGeometry(0.5, 0.08, 0.02), M(mats, LIGHT), -0.1, 0.62, 0.56));
    }
  }
  return { g, tick };
}
