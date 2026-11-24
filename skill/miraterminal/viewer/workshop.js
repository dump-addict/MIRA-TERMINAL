/* Workshop: each object kind in three versions side by side, on the same base as in the map.
   The choice is kept in the browser (pm.models) and picked up immediately by the map's 3D view. */
import * as THREE from "three";
import { build, setPalette, M, mesh, rbox, VARIANTS } from "./objects3d.js";
import { LABELS_A } from "./models3d.js";

const KINDS = [
  ["user", "User"], ["app", "Web app"], ["wallet", "Wallet"], ["server", "Server"], ["contract", "Smart contract"],
  ["chain", "Blockchain"], ["oracle", "Oracle"], ["feed", "Price feed"], ["external", "External service"], ["database", "Database"],
  ["cloud", "Hosting"], ["key", "Keys and secrets"], ["security", "Security, sign-in"], ["swap", "Swap"], ["chart", "Chart"],
];
const COLORS = ["#7dd3fc", "#a78bfa", "#f9a8d4", "#86efac", "#fcd34d", "#fdba74"];
const AMB = {
  dark: { bg: "#15171b", plate: "#23262d", plateTop: "#2c3038", soft: true, metal: 0.35, glow: 0.8, hemi: ["#e8eef8", "#1a1c20", 1.1], key: 2.0, pal: { GOLD: "#e2b552", SILVER: "#aab2be", DARK: "#3a3f4a", LIGHT: "#e8ecf1" } },
  light: { bg: "#f7f6fb", plate: "#d9d4ec", plateTop: "#fbf8f3", soft: true, metal: 0.2, glow: 0.6, hemi: ["#ffffff", "#a99ed2", 1.0], key: 2.4, pal: { GOLD: "#f6c453", SILVER: "#d6dce8", DARK: "#4a5068", LIGHT: "#fbf8f3" } },
};
const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };
let amb = AMB[get("pm.workshop.amb")] ? get("pm.workshop.amb") : "dark";
let choice = {}; try { choice = JSON.parse(get("pm.models") || "{}") || {}; } catch (e) { choice = {}; }

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const views = [];

function shadowTex() {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const g = cv.getContext("2d"), r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  r.addColorStop(0, "rgba(0,0,0,.45)"); r.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}
const SH = shadowTex();

function makeScene(kind, letter, color) {
  const A = AMB[amb], scene = new THREE.Scene(), mats = [];
  scene.background = new THREE.Color(A.bg);
  const hemi = new THREE.HemisphereLight(A.hemi[0], A.hemi[1], A.hemi[2]);
  const key = new THREE.DirectionalLight("#ffffff", A.key); key.position.set(-4, 8, 6);
  const fill = new THREE.DirectionalLight("#cfd8ff", 0.5); fill.position.set(6, 3, -4);
  scene.add(hemi, key, fill);
  const pivot = new THREE.Group(); scene.add(pivot);
  pivot.add(mesh(rbox(2.7, 0.26, 2.7, 0.14), M(mats, A.plate, { keep: true, r: 0.7 }), 0, 0.13, 0));
  pivot.add(mesh(rbox(2.5, 0.08, 2.5, 0.12), M(mats, A.plateTop, { keep: true, r: 0.8 }), 0, 0.29, 0));
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: SH, transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.335; pivot.add(sh);
  const { g, tick } = build(kind, color, mats, letter);
  g.position.y = 0.33; pivot.add(g);
  const camera = new THREE.PerspectiveCamera(28, 1.4, 0.1, 100);
  camera.position.set(3.0, 3.6, 6.1); camera.lookAt(0, 1.0, 0);
  return { scene, camera, pivot, tick };
}

function cell(kind, letter, label, color) {
  const d = document.createElement("div");
  d.className = "cell"; d.dataset.kind = kind; d.dataset.letter = letter;
  d.innerHTML = `<div class="view"></div><div class="foot"><span class="letter">${letter}</span><span class="name">${label}</span><button class="pick">Pick</button></div>`;
  d.querySelector(".pick").onclick = () => { choice[kind] = letter; put("pm.models", JSON.stringify(choice)); mark(); };
  const view = d.querySelector(".view"), v = { el: view, kind, letter, color, rot: 0, drag: null, ...makeScene(kind, letter, color) };
  view.addEventListener("pointerdown", (e) => { v.drag = e.clientX; view.setPointerCapture(e.pointerId); });
  view.addEventListener("pointermove", (e) => { if (v.drag !== null) { v.rot += (e.clientX - v.drag) * 0.012; v.drag = e.clientX; } });
  view.addEventListener("pointerup", () => { v.drag = null; });
  views.push(v);
  return d;
}

function mark() {
  document.querySelectorAll(".cell").forEach((c) => {
    const on = (choice[c.dataset.kind] || "A") === c.dataset.letter && !!choice[c.dataset.kind];
    c.classList.toggle("on", on); c.querySelector(".pick").textContent = on ? "Picked" : "Pick";
  });
  const n = Object.keys(choice).length;
  document.getElementById("picked").textContent = n ? `${n} of ${KINDS.length} picked` : "";
}

function summary() {
  return KINDS.map(([k, l]) => {
    const c = choice[k]; if (!c) return `${l}: not picked yet`;
    const name = c === "A" ? LABELS_A[k] : VARIANTS[k][c].label;
    return `${l}: ${c} (${name})`;
  }).join("\n");
}

function buildAll() {
  const A = AMB[amb];
  setPalette({ soft: A.soft, metal: A.metal, glow: A.glow, ...A.pal });
  document.documentElement.dataset.amb = amb;
  document.querySelectorAll("#amb button").forEach((b) => b.classList.toggle("on", b.dataset.amb === amb));
  views.length = 0;
  const list = document.getElementById("list"); list.innerHTML = "";
  KINDS.forEach(([kind, label], i) => {
    const s = document.createElement("section");
    s.innerHTML = `<h2>${label}<code>${kind}</code></h2><div class="row"></div>`;
    const row = s.querySelector(".row"), color = COLORS[i % COLORS.length];
    row.appendChild(cell(kind, "A", LABELS_A[kind] || "Original", color));
    Object.entries(VARIANTS[kind] || {}).forEach(([letter, v]) => row.appendChild(cell(kind, letter, v.label, color)));
    list.appendChild(s);
  });
  mark();
}

document.querySelectorAll("#amb button").forEach((b) => b.onclick = () => { amb = b.dataset.amb; put("pm.workshop.amb", amb); buildAll(); });
document.getElementById("copy").onclick = async () => {
  const t = summary();
  try { await navigator.clipboard.writeText(t); } catch (e) { /* clipboard denied */ }
  const b = document.getElementById("copy"); b.textContent = "Copied"; setTimeout(() => { b.textContent = "Copy my picks"; }, 1400);
};

function frame(ms) {
  const t = ms / 1000;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
  renderer.setScissorTest(false); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.setScissorTest(true);
  views.forEach((v) => {
    const r = v.el.getBoundingClientRect();
    if (r.bottom < 54 || r.top > h || r.right < 0 || r.left > w) return;
    // the view does not spill under the sticky header
    const top = Math.max(r.top, 54), vh = r.bottom - top;
    if (vh <= 0) return;
    v.camera.aspect = r.width / r.height; v.camera.updateProjectionMatrix();
    v.pivot.rotation.y = v.rot + (v.drag === null ? Math.sin(t * 0.35) * 0.35 : 0);
    if (v.tick) v.tick(t);
    renderer.setViewport(r.left, h - r.bottom, r.width, r.height);
    renderer.setScissor(r.left, h - r.bottom, r.width, vh);
    renderer.render(v.scene, v.camera);
  });
  requestAnimationFrame(frame);
}
buildAll();
requestAnimationFrame(frame);
