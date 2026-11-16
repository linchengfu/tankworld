// Dev-only: renders one tank in orthographic side / top / front views plus a perspective view, for checking the
// model against three-view drawings. Bundled and driven by tools/modelshot.cjs.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TANKS, tankById } from '../src/data/tanks.js';
import { buildTankModel } from '../src/tank/model.js';

const W = 1600, H = 1000;
const canvas = document.createElement('canvas'); document.body.style.margin = '0'; document.body.appendChild(canvas);
const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); r.setSize(W, H, false); r.setPixelRatio(1);
r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8a8f96);
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;
const sun = new THREE.DirectionalLight(0xfff2e0, 2.6); sun.position.set(6, 10, 7); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 }); sun.shadow.bias = -0.0006; scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6f7378, roughness: 0.9 })); floor.receiveShadow = true; scene.add(floor);
let model = null;
const ortho = (w, h, pos, up) => { const c = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 100); c.position.set(...pos); c.up.set(...up); return c; };
window.show = (id, mode = 'sheet', o = {}) => {
  if (model) { scene.remove(model.root); model.dispose(); }
  const def = tankById(id) || TANKS[0]; model = buildTankModel(def); scene.add(model.root);
  model.turret.rotation.y = o.yaw || 0; model.gun.rotation.x = -(o.elev || 0);
  r.setScissorTest(true); r.setClearColor(0x8a8f96);
  const view = (x, y, w, h, cam, look) => { cam.lookAt(...look); cam.updateProjectionMatrix(); r.setViewport(x, y, w, h); r.setScissor(x, y, w, h); r.render(scene, cam); };
  if (mode === 'sheet') {
    floor.visible = false;
    const a = (W * 0.62) / (H / 2), ws = 12.4;
    view(0, H / 2, W * 0.62, H / 2, ortho(ws, ws / a, [30, 1.6, 1.2], [0, 1, 0]), [0, 1.6, 1.2]);            // side (forward to the left)
    view(0, 0, W * 0.62, H / 2, ortho(ws, ws / a, [0, 30, 1.2], [-1, 0, 0]), [0, 0, 1.2]);                    // top (forward left, tank's left side down)
    const b = (W * 0.38) / (H / 2), wf = 5.6;
    view(W * 0.62, H / 2, W * 0.38, H / 2, ortho(wf, wf / b, [0, 1.6, 30], [0, 1, 0]), [0, 1.6, 0]);         // front
    floor.visible = true;
    const p = new THREE.PerspectiveCamera(30, b, 0.1, 200); p.position.set(7.5, 4.2, 10.5); view(W * 0.62, 0, W * 0.38, H / 2, p, [0, 1.2, 0.6]);
  } else {
    floor.visible = true;
    const p = new THREE.PerspectiveCamera(o.fov || 28, W / H, 0.1, 200), d = o.dist || 15, az = o.az ?? 0.7, el = o.el ?? 0.28;
    p.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d + 1, Math.cos(az) * Math.cos(el) * d); view(0, 0, W, H, p, [0, 1.3, 0.4]);
  }
  return { tris: model.meshes.reduce((s, m) => s + m.geometry.attributes.position.count / 3, 0) };
};
window.ready = true;
