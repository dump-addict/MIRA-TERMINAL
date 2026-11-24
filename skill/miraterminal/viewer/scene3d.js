/* 3D diorama view: each group is a rounded island, each block an object standing on its base,
   links are pipes with rounded corners where packets flow when they work.
   Objects come from objects3d.js (one per kind); the badge above carries the brand. */
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { EffectComposer } from "./vendor/postprocessing/EffectComposer.js";
import { RenderPass } from "./vendor/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "./vendor/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "./vendor/postprocessing/OutputPass.js";
import { build, badge, M, mesh, rbox, roundRect, setPalette, setContext } from "./objects3d.js";
import "./models3d.js";
import { routeAll } from "./route.js";

let C, S, el, renderer, scene, camera, controls, raycaster, labLayer, bar;
let awake = false, raf = 0, built = false, last = 0;
const nodes = new Map();  // id -> { root, model, tick, mats, ring, lab, sc, w, height, badge }
const links = new Map();  // key -> { e, tube, hit, mat, parts, curve, sides }
const zones = [];
const decor = [];
let runner = null, camGoal = null, drag = null, hoverObj = null;
let sky, floor, hemi, sun, rim, motes, composer, bloom, envTex;
const keys = new Set();

// ------------------------------------------------------------ themes
const AMB = {
  dark: null,
  light: {
    label: "Light", icon: "sun", cls: "amb-light", soft: true, metal: 0.2, exposure: 1.0,
    skyTop: "#b3aee3", skyBot: "#ece8f8", fog: "#ddd8f1", floor: "#d4cdee",
    hemi: ["#ffffff", "#a99ed2", 1.0], sun: ["#fff2e2", 2.7], rim: ["#c9d3ff", 0.6],
    tile: "#fbf8f3", islandTint: 0.55, islandTop: "#ffffff", ground: "#9fd486", soil: "#c08a68", soilLine: "#a8735a",
    pipe: "#f1eef6", pipeMix: 0.45, trees: true, base: true, glow: 0.6, motes: "#ffffff",
    pal: { GOLD: "#f6c453", SILVER: "#d6dce8", DARK: "#4a5068", LIGHT: "#fbf8f3" },
  },
  // dark: graphite platforms, matte objects well lit in their group's colour, subtle light (edge trim, cables)
  dark: {
    label: "Dark", icon: "moon", cls: "amb-dark", soft: true, neon: true, metal: 0.35, glow: 0.8, exposure: 1.0,
    skyTop: "#0a0c12", skyBot: "#1a2030", fog: "#121621", floor: "#11141c",
    hemi: ["#e8eef8", "#15171b", 1.0], sun: ["#ffffff", 2.0], rim: ["#cfd8ff", 0.45],
    tile: "#1d2026", islandTint: 0, islandTop: "#15171b", ground: "#0b0c0e", soil: "#0b0c0e", soilLine: "#14161a",
    pipe: "#3a3f48", pipeMix: 0, trees: false, base: false, motes: "#ffffff", bloom: [0.3, 0.3, 1.0],
    pal: { GOLD: "#e2b552", SILVER: "#aab2be", DARK: "#3a3f4a", LIGHT: "#e8ecf1" },
  },
};
function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
let amb = AMB[get("pm.amb3")] ? get("pm.amb3") : "dark";
const accent = () => (S.map && S.map.accent) || "#2ee6ff";  // accent colour of the dark theme (the map's "accent" field)
let tool = ["pan", "orbit", "zoom"].includes(get("pm.tool")) ? get("pm.tool") : "pan";

export function init(ctx) {
  C = ctx; S = ctx.S; el = C.$("#d3");
  setContext(ctx);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  el.appendChild(renderer.domElement);
  labLayer = document.createElement("div"); labLayer.id = "l3"; el.appendChild(labLayer);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(26, 1, 0.5, 2000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.09;
  controls.maxPolarAngle = 1.36; controls.minDistance = 8; controls.maxDistance = 320;
  controls.screenSpacePanning = false; controls.zoomToCursor = true; controls.zoomSpeed = 1.1;
  controls.addEventListener("start", () => { camGoal = null; el.classList.add("grabbing"); });
  controls.addEventListener("end", () => el.classList.remove("grabbing"));

  // gradient sky, floor, lights
  sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
    vertexShader: "varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: "uniform vec3 top; uniform vec3 bot; varying vec3 vp; void main(){ float h = smoothstep(-0.05, 0.6, vp.y); gl_FragColor = vec4(mix(bot, top, h), 1.); }",
  }));
  scene.add(sky);
  floor = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.MeshStandardMaterial({ roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.2; floor.receiveShadow = true; scene.add(floor);
  hemi = new THREE.HemisphereLight(); scene.add(hemi);
  sun = new THREE.DirectionalLight(); sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  rim = new THREE.DirectionalLight(); scene.add(rim);
  scene.fog = new THREE.Fog("#000", 200, 600);

  // reflections for shiny materials: a dark room with a few light strips
  const pm = new THREE.PMREMGenerator(renderer), room = new THREE.Scene();
  room.background = new THREE.Color("#050506");
  [[0, 9, 0, 14, 0.3, 4, "#ffffff", 1.4], [-9, 4, 3, 0.3, 4, 10, "#9fefff", 1.2], [9, 3, -4, 0.3, 3, 8, "#ffffff", 0.8], [0, 2, 10, 12, 2, 0.3, "#5fdcff", 0.6]].forEach(([x, y, z, w, h, d, c, k]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) })); m.position.set(x, y, z); room.add(m);
  });
  envTex = pm.fromScene(room, 0.04).texture;
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.8, 0.5, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  buildBar();
  applyAmbiance();
  setTool(tool);

  new ResizeObserver(() => resize()).observe(el);
  raycaster = new THREE.Raycaster();
  const dom = renderer.domElement;
  let down = null;
  dom.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY };
    if (e.button !== 0) return;
    const hit = pick(e);
    if (hit && hit.type === "node") {
      const p = groundPoint(e), o = nodes.get(hit.id);
      if (p) { drag = { id: hit.id, off: o.root.position.clone().sub(p), moved: false }; controls.enabled = false; dom.setPointerCapture(e.pointerId); }
    }
  });
  dom.addEventListener("pointermove", (e) => {
    C.moveTip(e);
    if (drag) {
      const p = groundPoint(e); if (!p) return;
      if (!drag.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) return;
      drag.moved = true; el.classList.add("moving"); C.hover(null);
      const o = nodes.get(drag.id), np = p.add(drag.off);
      moveTree(drag.id, np.clone().sub(o.root.position));
      rebuildLinks(true);
      return;
    }
    if (e.buttons) return;
    const hit = pick(e);
    const key = hit ? (hit.type === "node" ? `node:${hit.id}` : hit.edge.selKey) : null;
    el.classList.toggle("over", !!hit);
    if (key !== hoverObj) { hoverObj = key; C.hover(key, e, hit && hit.edge); }
  });
  dom.addEventListener("pointerup", (e) => {
    const click = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4;
    if (drag) {
      controls.enabled = true; el.classList.remove("moving");
      if (drag.moved) { saveTree(drag.id); rebuildLinks(); buildDecor(); }
      else C.select(`node:${drag.id}`);
      drag = null; down = null; return;
    }
    if (click && e.button === 0) {
      const hit = pick(e);
      if (hit && hit.type === "edge") C.select(hit.edge.selKey);
      else if (!hit) { C.closePanel(); C.blank(); }
    }
    down = null;
  });
  dom.addEventListener("pointerleave", () => { if (hoverObj) { hoverObj = null; C.hover(null); } });
  dom.addEventListener("contextmenu", (e) => e.preventDefault());

  // keyboard: arrow keys or WASD to move, Shift + arrows to rotate, + and - to zoom
  const MOVE = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "Equal", "Minus", "NumpadAdd", "NumpadSubtract"];
  window.addEventListener("keydown", (e) => {
    if (!awake || e.target.matches("input, textarea") || e.metaKey || e.ctrlKey) return;
    keys.shift = e.shiftKey;
    if (MOVE.includes(e.code)) { keys.add(e.code); camGoal = null; e.preventDefault(); }
    if (e.key === "1") setTool("pan"); if (e.key === "2") setTool("orbit"); if (e.key === "3") setTool("zoom");
  });
  window.addEventListener("keyup", (e) => { keys.delete(e.code); keys.shift = e.shiftKey; });
  window.addEventListener("blur", () => keys.clear());
}

// ------------------------------------------------------------ 3D toolbar
function buildBar() {
  bar = document.createElement("div"); bar.id = "nav3";
  const tools = [["pan", "hand", "Pan", "Pan: drag, arrow keys or WASD (1)"], ["orbit", "rotate-3d", "Orbit", "Orbit: drag, or Shift + arrow keys (2)"], ["zoom", "zoom-in", "Zoom", "Zoom: drag up or down, scroll, pinch (3)"]];
  bar.innerHTML = `<div class="seg" id="tool3">${tools.map(([k, ic, l, t]) => `<button data-tool="${k}" title="${t}">${C.icon(ic, 14)}<span>${l}</span></button>`).join("")}</div>
    <div class="seg" id="amb3">${Object.entries(AMB).map(([k, a]) => `<button data-amb="${k}" title="${a.label} theme">${C.icon(a.icon, 14)}<span>${a.label}</span></button>`).join("")}</div>
    <div class="seg"><button id="workshop3" title="Pick the shape of each object">${C.icon("box", 14)}<span>Workshop</span></button></div>`;
  el.appendChild(bar);
  bar.querySelectorAll("[data-tool]").forEach((b) => b.onclick = () => setTool(b.dataset.tool));
  bar.querySelector("#workshop3").onclick = () => window.open("/viewer/workshop.html", "_blank");
  // a choice made in the workshop (another window) applies as soon as you return to the map
  window.addEventListener("storage", (e) => { if (e.key === "pm.models" && awake) { applyAmbiance(); render(false); } });
  bar.querySelectorAll("[data-amb]").forEach((b) => b.onclick = () => { if (amb !== b.dataset.amb) { amb = b.dataset.amb; put("pm.amb3", amb); applyAmbiance(); if (awake) render(false); } });
}
export function setTool(t) {
  tool = t; put("pm.tool", t);
  const L = { pan: THREE.MOUSE.PAN, orbit: THREE.MOUSE.ROTATE, zoom: THREE.MOUSE.DOLLY }[t];
  controls.mouseButtons = { LEFT: L, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: t === "orbit" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE };
  controls.touches = { ONE: t === "orbit" ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  el.dataset.tool = t;
  bar.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === t));
}
// object variants: choices made in the workshop (browser), otherwise the map's "models" field
function chosenModels() {
  let local = {}; try { local = JSON.parse(get("pm.models") || "{}") || {}; } catch (e) { local = {}; }
  return { ...((S.map && S.map.models) || {}), ...local };
}
function applyAmbiance() {
  const A = AMB[amb];
  setPalette({ soft: A.soft, metal: A.metal, glow: A.glow, models: chosenModels(), ...A.pal });
  scene.environment = A.neon ? envTex : null;
  if (A.bloom) [bloom.strength, bloom.radius, bloom.threshold] = A.bloom;
  floor.position.y = A.base ? -1.95 : -0.3;
  renderer.toneMappingExposure = A.exposure;
  sky.material.uniforms.top.value.set(A.skyTop); sky.material.uniforms.bot.value.set(A.skyBot);
  floor.material.color.set(A.floor);
  scene.fog.color.set(A.fog);
  hemi.color.set(A.hemi[0]); hemi.groundColor.set(A.hemi[1]); hemi.intensity = A.hemi[2];
  sun.color.set(A.sun[0]); sun.intensity = A.sun[1];
  rim.color.set(A.rim[0]); rim.intensity = A.rim[1];
  Object.values(AMB).forEach((a) => el.classList.toggle(a.cls, a === A));
  bar.querySelectorAll("[data-amb]").forEach((b) => b.classList.toggle("on", b.dataset.amb === amb));
}

// ------------------------------------------------------------ positions
// one column per group (direction of flow), one base every STEP3; positions moved in 3D are kept separately
// a crowded group spreads over two columns to keep the diorama compact
const CELL = 4.3, GAPX = 3.4, GAPZ = 3.4, TILE = 2.7, TILES = 2.0;
let AUTO3 = {};
function layout3() {
  AUTO3 = {};
  const v = C.view(), per = {};
  S.groups.forEach((g) => { per[g.id] = v.nodes.filter(({ n }) => n.group === g.id).map(({ n }) => n); });
  const ncol = (g) => (per[g.id].length > 3 ? 2 : 1);
  const cols = [...new Set(S.groups.map((g) => g.col))].sort((a, b) => a - b), xs = {};
  let x = 0;
  cols.forEach((c) => { xs[c] = x; x += Math.max(1, ...S.groups.filter((g) => g.col === c && per[g.id].length).map(ncol)) * CELL + GAPX; });
  const rows = [...new Set(S.groups.map((g) => g.row))].sort((a, b) => a - b);
  let top = 0;
  rows.forEach((r) => {
    let bottom = top;
    S.groups.filter((g) => g.row === r).forEach((g) => {
      const k = ncol(g), list = per[g.id];
      list.forEach((n, i) => { AUTO3[n.id] = { x: xs[g.col] + (i % k) * CELL, z: top + Math.floor(i / k) * CELL }; });
      if (list.length) bottom = Math.max(bottom, top + Math.ceil(list.length / k) * CELL);
    });
    top = bottom + GAPZ;
  });
}
function toWorld(id) {
  const sv = S.saved3 && S.saved3[id];
  if (sv) return new THREE.Vector3(sv.x, 0, sv.z);
  for (let p = S.byId[id]?.parent; p; p = S.byId[p]?.parent) {
    if (S.saved3 && S.saved3[p] && AUTO3[p] && AUTO3[id]) return new THREE.Vector3(S.saved3[p].x + AUTO3[id].x - AUTO3[p].x, 0, S.saved3[p].z + AUTO3[id].z - AUTO3[p].z);
  }
  const a = AUTO3[id] || { x: 0, z: 0 };
  return new THREE.Vector3(a.x, 0, a.z);
}
function descendantsVisible(id) { return [...nodes.keys()].filter((k) => { for (let p = S.byId[k]?.parent; p; p = S.byId[p]?.parent) if (p === id) return true; return false; }); }
function moveTree(id, d) { [id, ...descendantsVisible(id)].forEach((k) => nodes.get(k).root.position.add(d)); }
function saveTree(id) {
  [id, ...descendantsVisible(id)].forEach((k) => { if (k === id || (S.saved3 && S.saved3[k])) { const p = nodes.get(k).root.position; C.save3(k, p.x, p.z); } });
  C.save3(null);
}
const plane0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundPoint(e) { setRay(e); const p = new THREE.Vector3(); return raycaster.ray.intersectPlane(plane0, p) ? p : null; }
function setRay(e) {
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
}
function pick(e) {
  setRay(e);
  const objs = [];
  nodes.forEach((o) => objs.push(o.root));
  links.forEach((o) => objs.push(o.hit));
  for (const h of raycaster.intersectObjects(objs, true)) {
    let ob = h.object;
    while (ob && !ob.userData.pick) ob = ob.parent;
    if (!ob) continue;
    if (ob.userData.pick === "node") return { type: "node", id: ob.userData.id };
    if (ob.userData.pick === "edge") return { type: "edge", edge: links.get(ob.userData.key).e };
  }
  return null;
}

// ------------------------------------------------------------ construction
function clear() {
  nodes.forEach((o) => { scene.remove(o.root); o.lab.remove(); });
  links.forEach((o) => { scene.remove(o.tube, o.hit, ...o.parts); o.tube.geometry.dispose(); o.hit.geometry.dispose(); });
  zones.forEach((z) => { scene.remove(z.obj); z.lab.remove(); });
  if (base) { scene.remove(base); base = null; baseRect = null; }
  nodes.clear(); links.clear(); zones.length = 0;
  clearDecor();
  if (runner) scene.remove(runner);
  if (motes) { scene.remove(motes); motes = null; }
}
const mix = (a, b, f) => new THREE.Color(a).lerp(new THREE.Color(b), f);

function makeNode(n) {
  const A = AMB[amb], mats = [], root = new THREE.Group();
  root.userData = { pick: "node", id: n.id };
  const small = n.size === "s", w = small ? TILES : TILE, sc = small ? 0.72 : 1;
  const color = S.gcolor[n.group] || "#9aa0aa";
  let topY, ring;
  const ringMat = new THREE.MeshBasicMaterial({ color: C.COL.ok, transparent: true }); ringMat.userData.baseOpacity = 1; mats.push(ringMat);
  if (A.neon) {
    // thick black platform, light strip at the foot, recessed top, LEDs and vents on the side
    topY = 0.46;
    root.add(mesh(rbox(w, 0.4, w, 0.14), M(mats, A.tile, { r: 0.55, m: 0.3, keep: true }), 0, 0.24, 0));
    root.add(mesh(rbox(w - 0.34, 0.06, w - 0.34, 0.1), M(mats, "#15171b", { r: 0.6, m: 0.2, keep: true }), 0, 0.43, 0));
    const band = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), transparent: true }); band.userData.baseOpacity = 1; mats.push(band);
    { const b = new THREE.Mesh(rbox(w + 0.03, 0.05, w + 0.03, 0.15), band); b.position.y = 0.05; root.add(b); }
    const edge = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }); edge.userData.baseOpacity = 0.35; mats.push(edge);
    const pts = roundRect(w - 0.3, w - 0.3, 0.1).getPoints(40).map((p) => new THREE.Vector3(p.x, 0.465, -p.y));
    root.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), edge));
    const vent = M(mats, "#2a2e36", { r: 0.5 });
    for (let i = 0; i < 3; i++) root.add(mesh(new THREE.BoxGeometry(0.34, 0.03, 0.02), vent, w * 0.28, 0.2 + i * 0.07, w / 2 + 0.005));
    ring = new THREE.Mesh(rbox(0.3, 0.06, 0.04, 0.02), ringMat); ring.position.set(-w * 0.3, 0.27, w / 2 + 0.01); root.add(ring);
    const led = new THREE.MeshBasicMaterial({ color: "#d9dee6", transparent: true }); led.userData.baseOpacity = 1; mats.push(led);
    for (const x of [0, 0.1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), led); l.position.set(-w * 0.3 + 0.24 + x, 0.27, w / 2 + 0.01); root.add(l); }
  } else {
    // base in two slabs: the bottom in the group's colour, the top light
    topY = 0.35;
    root.add(mesh(rbox(w, 0.2, w, 0.14), M(mats, mix(color, "#ffffff", 0.15), { r: 0.6 }), 0, 0.1, 0));
    root.add(mesh(rbox(w - 0.16, 0.16, w - 0.16, 0.12), M(mats, A.tile, { r: 0.7 }), 0, 0.27, 0));
    ring = new THREE.Mesh(rbox(w * 0.34, 0.07, 0.06, 0.03), ringMat); ring.position.set(0, 0.11, w / 2 + 0.005); root.add(ring);
    for (const x of [-1, 1]) root.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), M(mats, "#ffffff"), x * w * 0.3, 0.11, w / 2 + 0.01));
  }
  const kind = n.kind || ((S.kids[n.id] || []).length ? "group" : "box");
  const { g, tick } = build(kind, color, mats);
  g.userData.id = n.id;
  g.position.y = topY; g.scale.setScalar(sc); root.add(g);
  const height = small ? 1.6 : 2.3;
  const bd = badge(n, mats);
  if (bd) { bd.position.y = topY + height * sc + 0.55; bd.scale.setScalar(small ? 0.95 : 1.15); root.add(bd); }
  root.position.copy(toWorld(n.id));
  scene.add(root);
  const lab = document.createElement("div");
  lab.className = "l3";
  lab.onpointerenter = (e) => C.hover(`node:${n.id}`, e);
  lab.onpointermove = (e) => C.moveTip(e);
  lab.onpointerleave = () => C.hover(null);
  lab.onclick = () => C.select(`node:${n.id}`, true);
  labLayer.appendChild(lab);
  nodes.set(n.id, { root, model: g, tick, mats, ring, lab, sc, w, height, badge: bd, topY });
}

// pipes: right-angle paths with rounded corners, at base height
const PIPE_Y = 0.12, PIPE_R = 0.075;
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
function ends() {
  // spreads the arrivals along a base's side so the pipes do not overlap
  const per = new Map();
  links.forEach((o, k) => {
    const a = nodes.get(o.e.source).root.position, b = nodes.get(o.e.target).root.position;
    const same = Math.abs(a.x - b.x) < 1.2;
    const sa = same ? 1 : Math.sign(b.x - a.x) || 1, sb = same ? 1 : -sa;
    for (const [id, side, other, src] of [[o.e.source, sa, b, true], [o.e.target, sb, a, false]]) {
      const key = `${id}:${side}`;
      if (!per.has(key)) per.set(key, []);
      per.get(key).push({ k, other: other.z, src });
    }
    o.sides = { sa, sb, same };
  });
  const off = {};
  per.forEach((arr) => {
    arr.sort((x, y) => x.other - y.other);
    arr.forEach((it, i) => { off[`${it.k}:${it.src ? "s" : "t"}`] = (i - (arr.length - 1) / 2) * Math.min(0.42, 1.8 / arr.length); });
  });
  return off;
}
function roundedPath(raw, r) {
  const pts = raw.filter((p, i) => !i || p.distanceTo(raw[i - 1]) > 1e-3);
  const path = new THREE.CurvePath();
  let prev = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], d1 = p.clone().sub(prev), d2 = pts[i + 1].clone().sub(p);
    const l1 = d1.length(), l2 = d2.length();
    if (l1 < 1e-3 || l2 < 1e-3) continue;
    const rr = Math.min(r, l1 * 0.5, l2 * 0.5);
    const s = p.clone().sub(d1.normalize().multiplyScalar(rr)), e = p.clone().add(d2.normalize().multiplyScalar(rr));
    if (prev.distanceTo(s) > 1e-3) path.add(new THREE.LineCurve3(prev.clone(), s));
    path.add(new THREE.QuadraticBezierCurve3(s, p.clone(), e));
    prev = e;
  }
  path.add(new THREE.LineCurve3(prev.clone(), pts[pts.length - 1].clone()));
  return path;
}
function curveFor(o, off) {
  const A = nodes.get(o.e.source), B = nodes.get(o.e.target);
  const a = A.root.position, b = B.root.position, { sa, sb, same } = o.sides;
  const oa = off[`${o.e.key}:s`] || 0, ob = off[`${o.e.key}:t`] || 0;
  const pa = new THREE.Vector3(a.x + sa * A.w / 2, PIPE_Y, a.z + oa), pb = new THREE.Vector3(b.x + sb * B.w / 2, PIPE_Y, b.z + ob);
  const mid = same ? Math.max(pa.x, pb.x) + 1.1 + (hash(o.e.key) % 3) * 0.3 : (pa.x + pb.x) / 2 + ((hash(o.e.key) % 5) - 2) * 0.3;
  return roundedPath([pa, new THREE.Vector3(mid, PIPE_Y, pa.z), new THREE.Vector3(mid, PIPE_Y, pb.z), pb], 0.8);
}
function makeLink(e) {
  const mat = new THREE.MeshStandardMaterial({ color: AMB[amb].pipe, roughness: 0.55, metalness: 0.1 });
  const tube = new THREE.Mesh(new THREE.BufferGeometry(), mat); tube.castShadow = true; tube.receiveShadow = true;
  const hit = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ visible: false }));
  hit.userData = { pick: "edge", key: e.key };
  const parts = [0, 1, 2].map(() => { const p = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshStandardMaterial({ color: C.COL.ok, emissive: C.COL.ok, emissiveIntensity: 0.4, roughness: 0.4 })); p.visible = false; p.castShadow = true; scene.add(p); return p; });
  scene.add(tube, hit);
  links.set(e.key, { e, tube, hit, mat, parts, curve: null });
}
// fast: simple route while a block is being dragged; otherwise a grid route that goes around blocks and separates cables
function rebuildLinks(fast) {
  const off = ends();
  let routes = {};
  if (!fast) {
    const boxes = {};
    nodes.forEach((o, id) => { const p = o.root.position; boxes[id] = { x: p.x, z: p.z, hw: o.w / 2, hd: o.w / 2 }; });
    const zr = zoneRects().map(({ g, x0, x1, z0, z1 }) => ({ x0, x1, z0, z1, ids: [...nodes.keys()].filter((id) => S.byId[id].group === g.id) }));
    // the group name written on the floor in front of each plate is an obstacle: no cable runs over it
    zr.forEach((z, i) => { const g = S.groups.find((x) => z.ids.includes && S.byId[z.ids[0]]?.group === x.id); const tw = 0.6 + (g ? g.label.length : 8) * 0.43; boxes[`__lab${i}`] = { x: z.x0 + 0.2 + tw / 2, z: z.z1 + 0.3, hw: tw / 2, hd: 0.45 }; });
    // spaced lanes (pitch 0.5): two parallel cables stay clearly apart; crossing another group's plate is expensive
    routes = routeAll(boxes, [...links.values()].map((o) => ({ key: o.e.key, s: o.e.source, t: o.e.target })), { pitch: 0.5, pad: 0.2, bend: 6, zone: 6, hug: 0.2, zones: zr });
  }
  links.forEach((o, k) => {
    const r = routes[k];
    o.curve = r ? roundedPath(r.map(([x, z]) => new THREE.Vector3(x, PIPE_Y, z)), 0.45) : curveFor(o, off);
    const len = o.curve.getLength();
    o.tube.geometry.dispose(); o.tube.geometry = new THREE.TubeGeometry(o.curve, Math.max(24, Math.round(len * 6)), PIPE_R, 10);
    o.hit.geometry.dispose(); o.hit.geometry = new THREE.TubeGeometry(o.curve, Math.max(12, Math.round(len * 2)), 0.4, 6);
  });
  buildZones();
}

// islands: one per group, top in the group's tint, side in soil (light) or graphite (dark)
function zoneRects() {
  const out = [];
  S.groups.forEach((g) => {
    const items = [...nodes.entries()].filter(([id]) => S.byId[id].group === g.id).map(([, o]) => o);
    if (!items.length) return;
    const x0 = Math.min(...items.map((o) => o.root.position.x - o.w / 2)) - 0.7, x1 = Math.max(...items.map((o) => o.root.position.x + o.w / 2)) + 0.7;
    const z0 = Math.min(...items.map((o) => o.root.position.z - o.w / 2)) - 0.7, z1 = Math.max(...items.map((o) => o.root.position.z + o.w / 2)) + 1.1;
    out.push({ g, x0, x1, z0, z1 });
  });
  return out;
}
let base = null, baseRect = null;
function buildBase(rects) {
  // a single large diorama base under all groups: light top, soil side with brick joints
  const A = AMB[amb];
  if (base) { scene.remove(base); base = null; }
  baseRect = null;
  if (!rects.length) return;
  const m = 2.0;
  const x0 = Math.min(...rects.map((r) => r.x0)) - m, x1 = Math.max(...rects.map((r) => r.x1)) + m;
  const z0 = Math.min(...rects.map((r) => r.z0)) - m, z1 = Math.max(...rects.map((r) => r.z1)) + m;
  baseRect = { x0, x1, z0, z1 };
  if (!A.base) return;
  const w = x1 - x0, d = z1 - z0, mats = [];
  base = new THREE.Group(); base.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  base.add(mesh(rbox(w, 0.4, d, 0.45), M(mats, A.ground, { r: 0.9 }), 0, -0.4, 0));
  base.add(mesh(rbox(w - 0.2, 1.4, d - 0.2, 0.35), M(mats, A.soil, { r: 0.95 }), 0, -1.25, 0));
  const lm = M(mats, A.soilLine, { r: 1 });
  for (const y of [-0.95, -1.45]) base.add(mesh(new THREE.BoxGeometry(w - 0.16, 0.04, d - 0.16), lm, 0, y, 0));
  for (const [y, o] of [[-0.72, 0], [-1.2, 0.9], [-1.7, 0]]) {
    for (let x = -w / 2 + 1.4 + o; x < w / 2 - 0.8; x += 1.8) base.add(mesh(new THREE.BoxGeometry(0.04, 0.4, 0.04), lm, x, y, d / 2 - 0.1));
    for (let z = -d / 2 + 1.4 + o; z < d / 2 - 0.8; z += 1.8) base.add(mesh(new THREE.BoxGeometry(0.04, 0.4, 0.04), lm, w / 2 - 0.1, y, z));
  }
  scene.add(base);
}
function buildZones() {
  const A = AMB[amb];
  zones.forEach((z) => { scene.remove(z.obj); z.lab.remove(); }); zones.length = 0;
  const rects = zoneRects();
  buildBase(rects);
  rects.forEach(({ g, x0, x1, z0, z1 }) => {
    const obj = new THREE.Group(), w = x1 - x0, d = z1 - z0, mats = [];
    obj.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    // group plate, slightly raised, in the group's tint
    const top = A.neon ? mix(A.islandTop, g.color, 0.07) : A.soft ? mix(g.color, A.islandTop, A.islandTint) : mix(A.islandTop, g.color, A.islandTint);
    obj.add(mesh(rbox(w, 0.22, d, 0.32), M(mats, top, { r: 0.85, keep: A.neon }), 0, -0.11, 0));
    if (A.neon) {
      { const b = new THREE.Mesh(rbox(w + 0.04, 0.04, d + 0.04, 0.34), new THREE.MeshBasicMaterial({ color: new THREE.Color(g.color).multiplyScalar(0.4) })); b.position.y = -0.27; obj.add(b); }
      const sp = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, d - 0.4), new THREE.MeshBasicMaterial({ map: speckle(w, d), transparent: true, depthWrite: false }));
      sp.rotation.x = -Math.PI / 2; sp.position.y = 0.003; obj.add(sp);
      const t = floorText(g.label, g.color); t.position.set(-w / 2 + 0.2, -0.29, d / 2 + 0.25); obj.add(t);
    }
    scene.add(obj);
    const lab = document.createElement("div"); lab.className = "z3"; lab.innerHTML = `<span class="sw" style="background:${C.esc(g.color)}"></span>${C.esc(g.label)}`;
    labLayer.appendChild(lab);
    zones.push({ obj, lab, gid: g.id, anchor: new THREE.Vector3(x0 + 0.5, -0.25, z1), rect: { x0, x1, z0, z1 } });
  });
}

// grain on top of the slabs and text engraved on the floor (dark theme)
const texCache = new Map();
function speckle(w, d) {
  const k = `${Math.round(w)}x${Math.round(d)}`;
  if (texCache.has(k)) return texCache.get(k);
  const cv = document.createElement("canvas"); cv.width = Math.min(1024, Math.round(w * 64)); cv.height = Math.min(1024, Math.round(d * 64));
  const g = cv.getContext("2d"), r = rng(hash(k));
  for (let i = 0; i < cv.width * cv.height / 90; i++) { g.fillStyle = `rgba(200,210,225,${0.05 + r() * 0.18})`; g.fillRect(r() * cv.width, r() * cv.height, 1.5, 1.5); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; texCache.set(k, t); return t;
}
function floorText(text, color) {
  const cv = document.createElement("canvas"), g = cv.getContext("2d"), fs = 64;
  g.font = `600 ${fs}px "Geist Variable", ui-sans-serif, system-ui, -apple-system, sans-serif`;
  const label = text, tw = g.measureText(label).width + 80;
  cv.width = Math.ceil(tw); cv.height = 96;
  g.font = `600 ${fs}px "Geist Variable", ui-sans-serif, system-ui, -apple-system, sans-serif`; g.textBaseline = "middle";
  g.fillStyle = color; g.fillRect(4, 30, 36, 36);
  g.fillStyle = "rgba(205,212,224,.55)"; g.fillText(label, 60, 50);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const h = 0.95, m = new THREE.Mesh(new THREE.PlaneGeometry(h * cv.width / cv.height, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.geometry.translate((h * cv.width / cv.height) / 2, 0, 0);
  m.rotation.x = -Math.PI / 2; m.position.y = 0;
  return m;
}

// scenery: pines, rocks, bushes on the margins of the islands (light theme)
function clearDecor() { decor.forEach((d) => scene.remove(d)); decor.length = 0; }
function rng(seed) { let s = (seed % 2147483646) + 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function pine(mats, r) {
  const t = new THREE.Group(), h = 0.8 + r() * 0.7;
  const gm = M(mats, ["#6fbf73", "#5aae6a", "#7cc97e"][Math.floor(r() * 3)], { r: 0.75 });
  t.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.4, 8), M(mats, "#9a6b4f"), 0, 0.2, 0));
  for (let i = 0; i < 4; i++) { const s = 1 - i * 0.2; t.add(mesh(new THREE.ConeGeometry(0.42 * s * h, 0.55 * h, 9), gm, 0, 0.45 + i * 0.3 * h, 0)); }
  return t;
}
function rock(mats, r) {
  const m = mesh(new THREE.DodecahedronGeometry(0.18 + r() * 0.16, 0), M(mats, ["#b9b3cc", "#a9a3bd"][Math.floor(r() * 2)], { r: 0.9, flat: true }), 0, 0.08, 0);
  m.scale.y = 0.6; m.rotation.y = r() * 3; return m;
}
function bush(mats, r) {
  const b = new THREE.Group(), m = M(mats, "#86cf7f", { r: 0.8 });
  [[0, 0.16, 0, 0.2], [0.16, 0.12, 0.05, 0.14], [-0.14, 0.11, -0.04, 0.13]].forEach(([x, y, z, s]) => b.add(mesh(new THREE.SphereGeometry(s, 12, 8), m, x, y, z)));
  if (r() > 0.5) b.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), M(mats, "#ffffff"), 0.05, 0.34, 0.1), mesh(new THREE.SphereGeometry(0.035, 8, 6), M(mats, "#f6c453"), -0.1, 0.28, 0.12));
  return b;
}
function buildDecor() {
  clearDecor();
  if (!AMB[amb].trees) return;
  const pipePts = [];
  links.forEach((o) => { if (o.curve) for (let i = 0; i <= 40; i++) pipePts.push(o.curve.getPoint(i / 40)); });
  const items = [...nodes.values()];
  const placed = [];
  if (!baseRect) return;
  {
    const r = rng(hash(S.project || "map") + 7), { x0, x1, z0, z1 } = baseRect;
    const want = Math.round(((x1 - x0) * (z1 - z0)) / 22);
    let n = 0;
    for (let tries = 0; tries < want * 30 && n < want; tries++) {
      const x = x0 + 0.5 + r() * (x1 - x0 - 1), zz = z0 + 0.5 + r() * (z1 - z0 - 1);
      if (zones.some((z) => x > z.rect.x0 - 0.3 && x < z.rect.x1 + 0.3 && zz > z.rect.z0 - 0.3 && zz < z.rect.z1 + 0.3)) continue;
      if (items.some((o) => Math.abs(o.root.position.x - x) < o.w / 2 + 0.5 && Math.abs(o.root.position.z - zz) < o.w / 2 + 0.5)) continue;
      if (pipePts.some((p) => Math.hypot(p.x - x, p.z - zz) < 0.7)) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - zz) < 0.8)) continue;
      const mats = [], u = r();
      const ob = u < 0.5 ? pine(mats, r) : u < 0.78 ? bush(mats, r) : rock(mats, r);
      ob.userData.mats = mats;
      ob.position.set(x, -0.2, zz); ob.scale.setScalar(0.8 + r() * 0.5); scene.add(ob); decor.push(ob); placed.push({ x, z: zz }); n++;
    }
  }
}
function buildMotes(b) {
  if (b.isEmpty()) return;
  const A = AMB[amb], N = A.neon ? 160 : 140, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()).addScalar(16);
  const r = rng(42);
  for (let i = 0; i < N; i++) { pos[i * 3] = c.x + (r() - 0.5) * s.x; pos[i * 3 + 1] = 0.6 + r() * 9; pos[i * 3 + 2] = c.z + (r() - 0.5) * s.z; seed[i] = r() * 10; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const cv = document.createElement("canvas"); cv.width = cv.height = 32;
  const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.beginPath(); g.arc(16, 16, 12, 0, Math.PI * 2); g.fill();
  motes = new THREE.Points(geo, new THREE.PointsMaterial({ color: A.motes, size: A.neon ? 0.07 : 0.13, map: new THREE.CanvasTexture(cv), transparent: true, opacity: A.neon ? 0.35 : 0.8, depthWrite: false }));
  motes.userData = { base: pos.slice(), seed };
  scene.add(motes);
}

export function render(fit) {
  awake = true;
  resize();
  clear();
  layout3();
  const v = C.view();
  v.nodes.forEach(({ n }) => makeNode(n));
  v.edges.forEach(makeLink);
  rebuildLinks();
  buildDecor();
  buildMotes(bounds());
  runner = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.5 }));
  runner.visible = false; scene.add(runner);
  fitShadow();
  paint();
  if (fit || !built) { zoom("fit", true); built = true; }
  cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
}
function fitShadow() {
  const b = bounds(); if (b.isEmpty()) return;
  const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()), R = Math.max(s.x, s.z) * 0.75 + 12;
  sun.position.set(c.x - R * 0.35, R * 1.3, c.z + R * 0.75); sun.target.position.copy(c);
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: R * 4 });
  sun.shadow.camera.updateProjectionMatrix();
  rim.position.set(c.x + R, R * 0.6, c.z - R);
  floor.position.x = c.x; floor.position.z = c.z;
}

export function paint() {
  if (!awake) return;
  const A = AMB[amb], f = C.focusSet();
  nodes.forEach((o, id) => {
    const n = S.byId[id], st = C.nodeStatus(id);
    const dim = (f && !f.has(`n:${id}`)) || (S.search && !C.matches(n));
    o.dim = !!dim;
    o.ring.visible = st !== "unknown";
    o.ring.material.color.set(C.COL[st] || C.COL.unknown);
    o.lab.className = `l3 ${dim ? "dim" : ""} ${S.sel === `node:${id}` ? "sel" : ""} ${st === "warn" || st === "fail" ? st : ""}`;
    o.lab.innerHTML = `<span class="ico">${C.icon(C.kindIcon(n.kind), 12)}</span>${C.esc(n.label)}${C.stWord(st)}`;
  });
  const steps = C.flowSteps();
  links.forEach((o, k) => {
    const st = C.edgeStatus(o.e), dim = f && !f.has(`e:${k}`);
    if (A.neon) {
      // glowing pipe: accent when it works, orange or red otherwise, off if unknown
      // tinted matte cable: accent when it works, orange or red otherwise, grey if unknown; barely glowing
      const lit = st === "ok" ? accent() : st === "warn" || st === "fail" ? C.COL[st] : null;
      o.mat.color.set(lit ? mix(A.pipe, lit, 0.55) : A.pipe);
      o.mat.emissive.set(lit || "#000000"); o.mat.emissiveIntensity = lit ? (dim ? 0.02 : 0.12) : 0;
    } else o.mat.color.copy(st === "unknown" ? new THREE.Color(A.pipe) : mix(A.pipe, C.COL[st], A.pipeMix));
    o.mat.transparent = !!dim; o.mat.opacity = dim ? 0.12 : 1; o.mat.depthWrite = !dim;
    o.flowing = st === "ok" && !dim;
    o.parts.forEach((p) => {
      const pc = A.neon ? accent() : C.COL[st] || C.COL.ok;
      p.material.color.set(pc); p.material.emissive.set(pc); p.material.emissiveIntensity = A.neon ? 0.9 : 0.4;
    });
    o.step = steps.find((s) => s.edge === k && s.i === S.flowStep) || null;
  });
  decor.forEach((d) => d.userData.mats.forEach((m) => { m.opacity = f ? 0.3 : 1; }));
}

// ------------------------------------------------------------ loop
const fwd = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tmpO = new THREE.Vector3(), mv = new THREE.Vector3();
function keyMove(dt) {
  if (!keys.size) return;
  const k = (c) => keys.has(c), dist = camera.position.distanceTo(controls.target);
  const rotL = keys.shift && k("ArrowLeft"), rotR = keys.shift && k("ArrowRight");
  if (rotL || rotR) {
    tmpO.copy(camera.position).sub(controls.target).applyAxisAngle(up, (rotL ? 1 : -1) * dt * 1.4);
    camera.position.copy(controls.target).add(tmpO);
  }
  fwd.copy(controls.target).sub(camera.position).setY(0).normalize();
  side.crossVectors(fwd, up).normalize();
  mv.set(0, 0, 0);
  if (k("ArrowUp") || k("KeyW")) mv.add(fwd);
  if (k("ArrowDown") || k("KeyS")) mv.sub(fwd);
  if ((k("ArrowLeft") && !keys.shift) || k("KeyA")) mv.sub(side);
  if ((k("ArrowRight") && !keys.shift) || k("KeyD")) mv.add(side);
  if (mv.lengthSq()) { mv.normalize().multiplyScalar(dist * 0.8 * dt); camera.position.add(mv); controls.target.add(mv); }
  const zin = k("Equal") || k("NumpadAdd"), zout = k("Minus") || k("NumpadSubtract");
  if (zin || zout) {
    tmpO.copy(camera.position).sub(controls.target).multiplyScalar(zin ? 1 - dt * 1.2 : 1 + dt * 1.2);
    if (tmpO.length() > controls.minDistance && tmpO.length() < controls.maxDistance) camera.position.copy(controls.target).add(tmpO);
  }
}
function clampTarget() {
  const b = bounds(); if (b.isEmpty()) return;
  const t = controls.target, m = 18;
  const cx = Math.min(Math.max(t.x, b.min.x - m), b.max.x + m), cz = Math.min(Math.max(t.z, b.min.z - m), b.max.z + m);
  if (cx !== t.x || cz !== t.z || Math.abs(t.y) > 1e-6) { const d = new THREE.Vector3(cx - t.x, -t.y, cz - t.z); t.add(d); camera.position.add(d); }
}
function frame(ms) {
  if (!awake) return;
  const t = ms / 1000, dt = Math.min(0.05, last ? t - last : 0.016); last = t;
  if (camGoal) {
    camera.position.lerp(camGoal.pos, 0.12); controls.target.lerp(camGoal.target, 0.12);
    if (camera.position.distanceTo(camGoal.pos) < 0.05) camGoal = null;
  }
  keyMove(dt);
  controls.update();
  clampTarget();
  const camAng = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  nodes.forEach((o, id) => {
    o.tick && o.tick(t);
    const want = (S.sel === `node:${id}` || S.hover === `node:${id}` ? 1.12 : 1) * o.sc;
    o.model.scale.setScalar(o.model.scale.x + (want - o.model.scale.x) * 0.2);
    if (o.badge) { o.badge.rotation.y = camAng; o.badge.position.y = o.topY + o.height * o.model.scale.x + 0.55 + Math.sin(t * 1.3 + o.root.position.x) * 0.06; }
    const op = o.dim ? 0.12 : 1;
    o.mats.forEach((m) => { m.userData.dimF = op; if (!m.userData.anim) m.opacity = m.userData.baseOpacity * op; m.depthWrite = !o.dim && m.userData.baseOpacity >= 1; });
    const st = C.nodeStatus(id);
    o.ring.scale.setScalar(st === "warn" || st === "fail" ? 1 + Math.abs(Math.sin(t * 4)) * 0.25 : 1);
  });
  links.forEach((o) => {
    o.parts.forEach((p, i) => {
      p.visible = !!o.flowing && !!o.curve;
      if (p.visible) p.position.copy(o.curve.getPointAt(((t * 0.22) + i / 3) % 1));
    });
  });
  if (motes) {
    const a = motes.geometry.attributes.position, { base, seed } = motes.userData;
    for (let i = 0; i < seed.length; i++) { a.array[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.5 + seed[i]) * 0.5; a.array[i * 3] = base[i * 3] + Math.sin(t * 0.3 + seed[i] * 2) * 0.4; }
    a.needsUpdate = true;
  }
  const cur = [...links.values()].find((o) => o.step);
  if (cur && cur.curve) { runner.visible = true; const u = (t % 1.8) / 1.8; runner.position.copy(cur.curve.getPointAt(cur.step.rev ? 1 - u : u)); runner.position.y += 0.12; } else if (runner) runner.visible = false;
  if (AMB[amb].bloom) composer.render(); else renderer.render(scene, camera);
  placeLabels();
  raf = requestAnimationFrame(frame);
}
const tmp = new THREE.Vector3();
function placeLabels() {
  const w = el.clientWidth, h = el.clientHeight;
  nodes.forEach((o) => {
    tmp.copy(o.root.position); tmp.y += o.topY + o.height * o.model.scale.x + (o.badge ? 1.35 : 0.3);
    const d = camera.position.distanceTo(tmp);
    tmp.project(camera);
    if (tmp.z > 1) { o.lab.style.visibility = "hidden"; return; }
    const k = Math.max(0.7, Math.min(1.1, 60 / d));
    o.lab.style.visibility = "";
    o._lx = (tmp.x + 1) / 2 * w; o._ly = (1 - tmp.y) / 2 * h; o._k = k; o._d = d;
    if (!o._lw) { o._lw = o.lab.offsetWidth; o._lh = o.lab.offsetHeight; }
  });
  // overlapping labels: the nearest stays in place, the others move up just above
  const placed = [];
  [...nodes.values()].filter((o) => o.lab.style.visibility !== "hidden" && o._lx != null).sort((a, b) => a._d - b._d).forEach((o) => {
    const lw = o._lw * o._k, lh = o._lh * o._k;
    let y = o._ly;
    for (let tries = 0; tries < 6; tries++) {
      const hit = placed.find((r) => Math.abs(r.x - o._lx) < (r.w + lw) / 2 + 4 && y > r.y - r.h - 4 && y - lh < r.y + 4);
      if (!hit) break;
      y = hit.y - hit.h - 6;
    }
    placed.push({ x: o._lx, y, w: lw, h: lh });
    o.lab.style.transform = `translate(${o._lx}px,${y}px) translate(-50%,-100%) scale(${o._k})`;
    o.lab.style.zIndex = String(10000 - Math.round(o._d * 10));
  });
  zones.forEach((z) => {
    tmp.copy(z.anchor).project(camera);
    z.lab.style.visibility = tmp.z > 1 ? "hidden" : "";
    z.lab.style.transform = `translate(${(tmp.x + 1) / 2 * w}px,${(1 - tmp.y) / 2 * h}px)`;
  });
}

// ------------------------------------------------------------ camera
function bounds() { const b = new THREE.Box3(); nodes.forEach((o) => b.expandByPoint(o.root.position)); return b; }
const AZ = 0.42, EL = 0.72;  // isometric-style view angle: from the front, slightly to the right, from above
export function zoom(kind, instant) {
  if (kind === "in" || kind === "out") {
    const dir = camera.position.clone().sub(controls.target).multiplyScalar(kind === "in" ? 0.72 : 1.38);
    camGoal = { pos: controls.target.clone().add(dir), target: controls.target.clone() };
    return;
  }
  const b = baseRect ? new THREE.Box3(new THREE.Vector3(baseRect.x0, 0, baseRect.z0), new THREE.Vector3(baseRect.x1, 0, baseRect.z1)) : bounds();
  if (b.isEmpty()) return;
  const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  const aspect = el.clientWidth / Math.max(1, el.clientHeight);
  const W = s.x * Math.cos(AZ) + s.z * Math.sin(AZ), H = (s.z * Math.cos(AZ) + s.x * Math.sin(AZ)) * Math.sin(EL) + 3;
  const dist = Math.max(W / aspect, H) / (2 * Math.tan((camera.fov * Math.PI) / 360)) * (AMB[amb].base ? 1.12 : 0.92);
  const pos = c.clone().add(new THREE.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL)).multiplyScalar(dist));
  scene.fog.near = dist * 1.4; scene.fog.far = dist * 4;
  if (instant) { camera.position.copy(pos); controls.target.copy(c); controls.update(); camGoal = null; }
  else camGoal = { pos, target: c };
}
export function focus(key) {
  if (!key.startsWith("node:")) return;
  const o = nodes.get(key.slice(5)); if (!o) return;
  const p = o.root.position.clone();
  const dir = camera.position.clone().sub(controls.target).normalize().multiplyScalar(26);
  camGoal = { pos: p.clone().add(dir), target: p };
}
export function resize() {
  if (!renderer) return;
  const w = el.clientWidth || 1, h = el.clientHeight || 1;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
}
export function sleep() { awake = false; cancelAnimationFrame(raf); keys.clear(); }
