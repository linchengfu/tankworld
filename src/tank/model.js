// Visual model of a tank: assembles the hull, turret and gun meshes described in vehicles.js, the two track bands,
// and the materials. One draw call per part: paint, rubber, bare steel and glass are told apart in the shader by a
// per-vertex surface class, so a road wheel's tyre and its painted disc can share a mesh.
// The damage model uses the simpler convex solids in geom.js, which are sized from the same drawings.
import * as THREE from 'three';
import { GeoBuilder, surf } from './geom.js';
import { SHAPES } from './vehicles.js';
import { hullBody, runningGear, trackSampler, trackLink } from './parts.js';
import { camoTexture, armorDetail, blobShadow, markTexture, insigniaTexture } from '../gfx/textures.js';

// Shared weather state for every tank material: 0 dry .. 1 rain-soaked. The renderer sets it.
export const tankWeather = { wet: { value: 0.0 }, dust: { value: new THREE.Color(0.105, 0.092, 0.074) } };
const geoCache = new Map(), matCache = new Map();

function geometryFor(def) {
  if (geoCache.has(def.id)) return geoCache.get(def.id);
  const S = SHAPES[def.id], g = def.geo, H = new GeoBuilder(), T = new GeoBuilder(), G = new GeoBuilder();
  hullBody(H, S.hull); runningGear(H, S.gear, g.W / 2 - g.trackW / 2, g.trackW);
  S.build(H, T, G, def);
  T.cyl(1.06, 0.1, 0, -0.01, 0, { seg: 28, c: surf(0.16, 2) });                  // turret ring
  const path = trackSampler(S.gear), links = Math.round(path.total / 0.165), pitch = path.total / links, K = new GeoBuilder();
  trackLink(K, g.trackW, pitch, def.nation === 'ru' ? 'bar' : 'pad');
  const out = { hull: H.build(), turret: T.build(), gun: G.build(), link: K.build(), path, links, pitch };
  geoCache.set(def.id, out);
  return out;
}

const VERT_HEAD = 'attribute float aSurf;\nvarying float vSurf;\nvarying vec3 vWPos;';
const FRAG_HEAD = 'varying float vSurf;\nvarying vec3 vWPos;\nuniform float uWet;\nuniform vec3 uDust;';
// Applied after the normal is known: surface class response, road dust on the lower hull, a wet film on upward faces.
const FRAG_SURF = `
{
  float cls = floor(vSurf + 0.5);
  float isPaint = step(cls, 0.5), isRubber = step(abs(cls - 1.0), 0.5), isSteel = step(abs(cls - 2.0), 0.5), isGlass = step(abs(cls - 3.0), 0.5), isPlain = step(abs(cls - 4.0), 0.5);
  vec3 wN = inverseTransformDirection(normal, viewMatrix);
  roughnessFactor = isPaint * roughnessFactor + isRubber * 0.9 + isSteel * (0.45 + 0.3 * roughnessFactor) + isGlass * 0.05 + isPlain * 0.8;
  metalnessFactor = isPaint * 0.22 + isSteel * 0.92 + isGlass * 0.85;
  diffuseColor.rgb *= 1.0 + isGlass * 1.2;
  float low = smoothstep(1.0, 0.1, vWPos.y);
  float dustK = clamp(low * 0.5 + (1.0 - wN.y * wN.y) * low * 0.12, 0.0, 1.0) * (1.0 - isGlass) * (1.0 - 0.85 * isRubber) * (1.0 - 0.6 * step(1.5, diffuseColor.r));
  diffuseColor.rgb = mix(diffuseColor.rgb, uDust, dustK);
  roughnessFactor = mix(roughnessFactor, 0.94, dustK); metalnessFactor *= 1.0 - dustK;
  float wet = uWet * smoothstep(-0.25, 0.75, wN.y);
  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.3 + 0.05, wet * 0.9);
  diffuseColor.rgb *= mix(1.0, 0.86, wet * (1.0 - isGlass));
}`;
function surfaced(m, classes) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = tankWeather.wet; sh.uniforms.uDust = tankWeather.dust;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${classes ? VERT_HEAD : 'varying float vSurf;\nvarying vec3 vWPos;'}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\nvSurf = ${classes ? 'aSurf' : '2.0'};\n#ifdef USE_INSTANCING\nvWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#else\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <map_fragment>', classes ? '#ifdef USE_MAP\n  diffuseColor.rgb *= mix(vec3(1.0), texture2D(map, vMapUv).rgb, step(vSurf, 0.5));\n#endif' : '#include <map_fragment>')
      .replace('#include <emissivemap_fragment>', `${FRAG_SURF}\n#include <emissivemap_fragment>`);
  };
  m.customProgramCacheKey = () => (classes ? 'tank-surf' : 'tank-track');
  return m;
}
function materialFor(def) {
  if (matCache.has(def.id)) return matCache.get(def.id);
  const d = armorDetail();
  const m = surfaced(new THREE.MeshStandardMaterial({ map: camoTexture(def.camo), normalMap: d.normal, normalScale: new THREE.Vector2(0.12, 0.12), roughnessMap: d.rough, vertexColors: true, roughness: (def.camo.rough ?? 0.6) / 0.72, metalness: 1, envMapIntensity: 1.0 }), true);
  matCache.set(def.id, m);
  return m;
}
let linkMat;
const wreckMat = new THREE.MeshStandardMaterial({ color: 0x15130f, vertexColors: true, roughness: 0.97, metalness: 0.25, envMapIntensity: 0.2 });
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blobPlane = new THREE.PlaneGeometry(1, 1), markMats = {};
let blobMat;

// Returns the scene graph of one tank plus handles the simulation animates.
export function buildTankModel(def) {
  const geo = geometryFor(def), mat = materialFor(def), g = def.geo;
  const root = new THREE.Group(), body = new THREE.Group(), turret = new THREE.Group(), gun = new THREE.Group(), gunRecoil = new THREE.Group();
  const mk = (ge, m) => { const o = new THREE.Mesh(ge, m); o.castShadow = true; o.receiveShadow = true; return o; };
  const hullMesh = mk(geo.hull, mat), turretMesh = mk(geo.turret, mat), gunMesh = mk(geo.gun, mat);
  // tracks: one instanced link per pitch, laid along the wheel path and shuffled along it as the track runs
  linkMat ||= surfaced(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 1, envMapIntensity: 0.8 }), true);
  const _m = new THREE.Matrix4(), _x = new THREE.Vector3(1, 0, 0), _y = new THREE.Vector3(), _z = new THREE.Vector3();
  const tracks = [1, -1].map((s) => {
    const o = new THREE.InstancedMesh(geo.link, linkMat, geo.links); o.castShadow = true; o.receiveShadow = true; o.position.x = s * (g.W / 2 - g.trackW / 2); o.frustumCulled = false; body.add(o);
    const t = { mesh: o, phase: 0, shown: 1e9,
      // d: metres the track has run (positive = vehicle moving forward on this side)
      advance(d) { this.phase = (this.phase + d) % geo.path.total; if (Math.abs(this.phase - this.shown) < 0.004) return; this.shown = this.phase;
        for (let i = 0; i < geo.links; i++) { const p = geo.path.at(i * geo.pitch - this.phase); _y.set(0, p.ny, p.nz); _z.set(0, -p.nz, p.ny); _m.makeBasis(_x, _y, _z).setPosition(0, p.y, p.z); o.setMatrixAt(i, _m); }
        o.instanceMatrix.needsUpdate = true; } };
    t.advance(0); return t;
  });
  blobMat ||= new THREE.MeshBasicMaterial({ map: blobShadow(), color: 0x000000, transparent: true, depthWrite: false, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const blob = new THREE.Mesh(blobGeo, blobMat); blob.scale.set(g.W + 1.3, 1, g.L + 1.5); blob.position.y = 0.04; blob.renderOrder = 1; blob.userData.noAO = true; root.add(blob);
  body.add(hullMesh);
  turret.position.set(0, g.hullH, g.turret.z); turret.add(turretMesh);
  gun.position.set(0, g.gun.y, g.gun.z); gun.add(gunRecoil); gunRecoil.add(gunMesh);
  turret.add(gun); body.add(turret); root.add(body);
  // stencilled numbers and insignia: one plane per side, facing outward so nothing mirrors
  const marks = [];
  for (const mk2 of SHAPES[def.id].marks || []) for (const s of [1, -1]) {
    const key = (mk2.kind || mk2.t) + (mk2.c || '');
    markMats[key] ||= new THREE.MeshStandardMaterial({ map: mk2.kind ? insigniaTexture(mk2.kind) : markTexture(mk2.t, mk2.c), transparent: true, alphaTest: 0.35, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const o = new THREE.Mesh(blobPlane, markMats[key]); o.scale.set(mk2.w ?? (mk2.kind === 'star81' ? mk2.h : mk2.h * 2), mk2.h, 1); o.position.set(s * mk2.p[0], mk2.p[1], mk2.p[2]); o.rotation.order = 'YXZ'; o.rotation.y = s * (Math.PI / 2 - (mk2.yaw || 0)); o.rotation.x = -(mk2.lean || 0); o.userData.noAO = true; (mk2.on === 'hull' ? body : turret).add(o); marks.push(o);
  }
  return {
    root, body, turret, gun, gunRecoil, tracks, meshes: [hullMesh, turretMesh, gunMesh],
    setWreck() { for (const o of marks) o.visible = false; for (const m of this.meshes) m.material = wreckMat; for (const t of tracks) t.mesh.material = wreckMat; },
    dispose() { for (const t of tracks) t.mesh.dispose(); },
  };
}
