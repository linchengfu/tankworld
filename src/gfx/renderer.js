// Renderer, storm-dawn sky, sun + shadow rig, the planar reflection that wet ground mirrors, rain,
// and the post chain (AO → bloom → tone map → lens pass).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { WEATHER } from './wet.js';
import { tankWeather } from '../tank/model.js';
import { ASSETS, SKY } from './assets.js';

// The sun is wherever it sits in the sky panorama; the panorama is turned so that it stands in the south-west,
// high enough to reach the street between the towers. Rain has just passed: the ground is still wet.
const SKY_AZ = (SKY.sunUV[0] - 0.5) * Math.PI * 2, SKY_EL = (0.5 - SKY.sunUV[1]) * Math.PI;
const SUN_OBJ = new THREE.Vector3(Math.cos(SKY_EL) * Math.cos(SKY_AZ), Math.sin(SKY_EL), Math.cos(SKY_EL) * Math.sin(SKY_AZ));
const SKY_ROT = SKY_AZ - Math.atan2(0.6, -0.8);
export const SUN_DIR = SUN_OBJ.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), SKY_ROT).normalize();
const FOG = new THREE.Color(0.47, 0.54, 0.63);
const skyPhoto = `
varying vec3 vDir; uniform sampler2D tSky, tHdr; uniform vec3 uFog, uSunObj; uniform float uGain;
void main(){
  vec3 d = normalize(vDir);
  vec2 uv = vec2(atan(d.z, d.x) / 6.28318531 + 0.5, 0.5 + asin(clamp(d.y, -1.0, 1.0)) / 3.14159265);
  vec3 col = texture2D(tSky, uv).rgb * uGain;
  vec3 hdr = min(texture2D(tHdr, uv).rgb, vec3(14.0));
  col = mix(col, hdr, smoothstep(1.6, 4.0, dot(hdr, vec3(0.2126, 0.7152, 0.0722))));
  float sd = max(dot(d, uSunObj), 0.0); col += vec3(1.0, 0.93, 0.82) * (pow(sd, 500.0) * 8.0 + pow(sd, 24.0) * 0.2);
  col = mix(uFog, col, smoothstep(-0.01, 0.13, d.y));
  if (d.y < 0.0) col = mix(uFog, uFog * 0.6, smoothstep(0.0, -0.4, d.y));
  gl_FragColor = vec4(col, 1.0);
}`;

const skyVert = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position,1.0); gl_Position = p.xyww; }`;
const skyFrag = `
varying vec3 vDir; uniform vec3 uSun; uniform vec3 uFog; uniform float uTime;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=vn(p)*a; p=p*2.03+7.1; a*=.5; } return s; }
void main(){
  vec3 d = normalize(vDir); float h = max(d.y, 0.0);
  float sd = max(dot(d, uSun), 0.0);
  float az = max(dot(normalize(d.xz + 1e-5), normalize(uSun.xz)), 0.0);
  // the sky behind the weather: cold overhead, burning along the horizon toward the sun
  vec3 hor = mix(vec3(0.34,0.36,0.40), vec3(0.95,0.52,0.25), pow(az, 4.0));
  vec3 col = mix(hor, vec3(0.20,0.27,0.40), pow(h, 0.42));
  col += vec3(1.0,0.50,0.20) * pow(sd, 10.0) * 0.5 + vec3(1.0,0.72,0.42) * pow(sd, 80.0) * 1.0;
  col += vec3(1.0,0.90,0.74) * smoothstep(0.9993, 0.9998, sd) * 14.0;
  // storm deck in two drifting layers; it lifts off the horizon, and breaks where the sun pushes through
  vec2 cp = d.xz / (d.y + 0.14);
  float c1 = fbm(cp * 0.8 + uTime * vec2(0.006, 0.003)), c2 = fbm(cp * 2.6 + 11.0 - uTime * vec2(0.009, 0.002));
  float dens = c1 * 0.7 + c2 * 0.3;
  float cov = smoothstep(0.40, 0.60, dens) * smoothstep(0.02, 0.17, d.y) * (1.0 - 0.8 * pow(sd, 7.0));
  float thick = smoothstep(0.46, 0.74, dens), under = pow(sd, 2.2) * (0.3 + 0.7 * c2);
  vec3 cc = mix(vec3(0.34,0.36,0.40), vec3(0.055,0.065,0.085), thick);                               // bright torn edges, slate-dark cores
  cc = mix(cc, vec3(1.2,0.56,0.25), under * 0.7 * (1.0 - 0.6 * thick));
  col = mix(col, cc, cov * 0.96);
  col = mix(uFog * (1.0 + vec3(1.1,0.5,0.15) * pow(az, 5.0)), col, smoothstep(0.0, 0.09, h));       // haze band on the horizon
  if (d.y < 0.0) col = mix(uFog, uFog * 0.5, smoothstep(0.0, -0.4, d.y));
  gl_FragColor = vec4(col, 1.0);
}`;

const LensShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uHit: { value: 0 }, uScope: { value: 0 }, uDead: { value: 0 }, uAspect: { value: 1.6 }, uSunPos: { value: new THREE.Vector3(0.5, 0.5, 0) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
  varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uTime, uHit, uScope, uDead, uAspect; uniform vec3 uSunPos;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime*7.13) * 43758.5453); }
  void main(){
    vec2 c = vUv - 0.5; float r = length(c * vec2(uAspect, 1.0));
    float ca = 0.0012 + uHit * 0.006;
    vec3 col = vec3(texture2D(tDiffuse, vUv + c*ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c*ca).b);
    // veiling glare when looking toward the low sun
    vec2 sv = (vUv - uSunPos.xy) * vec2(uAspect, 1.0); float sg = exp(-dot(sv, sv) * 2.6) * uSunPos.z;
    col += vec3(1.0, 0.86, 0.66) * sg * 0.05;
    // grade: desaturated, steel-blue shadows, amber highlights, firmer contrast
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, 1.04);
    col *= mix(vec3(0.96, 0.99, 1.05), vec3(1.03, 1.0, 0.96), smoothstep(0.08, 0.7, l));
    col = mix(col, col * col * (3.0 - 2.0 * col), 0.2);
    col *= 1.0 - smoothstep(0.45, 1.05, r) * (0.3 + uScope * 0.35);
    col = mix(col, vec3(dot(col, vec3(0.3,0.59,0.11))) * vec3(1.0,0.92,0.85), uDead * 0.75);
    col = mix(col, col * vec3(1.25,0.55,0.45), uHit * smoothstep(0.2, 0.9, r));
    col += (h(vUv * 811.0) - 0.5) * 0.022;
    gl_FragColor = vec4(col, 1.0);
  }`,
};

// Rain: line streaks in a box that wraps around the camera, slanted by the wind.
function makeRain(n = 2600, R = 20, Hh = 24) {
  const pos = new Float32Array(n * 6), par = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const x = Math.random() * 2 * R, y = Math.random() * Hh, z = Math.random() * 2 * R, sp = 16 + Math.random() * 10; for (let k = 0; k < 2; k++) { pos.set([x, y, z], i * 6 + k * 3); par.set([k, sp], i * 4 + k * 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPar', new THREE.BufferAttribute(par, 2));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms: { uTime: WEATHER.uTime, uRain: WEATHER.uRain, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector2(R, Hh) } },
    vertexShader: `attribute vec2 aPar; uniform float uTime, uRain; uniform vec3 uCam; uniform vec2 uBox; varying float vA;
      void main(){ vec3 w = normalize(vec3(0.12, -1.0, 0.05)); vec3 p = position; p.y = mod(p.y - uTime * aPar.y, uBox.y);
        p.xz = mod(p.xz + w.xz * (uBox.y - p.y) - uCam.xz, 2.0 * uBox.x) - uBox.x;
        vec3 wp = vec3(uCam.x + p.x, uCam.y - uBox.y * 0.4 + p.y, uCam.z + p.z) - w * aPar.x * (0.22 + aPar.y * 0.016);
        vec4 mv = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mv;
        vA = (1.0 - smoothstep(uBox.x * 0.55, uBox.x, length(p.xz))) * smoothstep(0.6, 3.0, -mv.z) * (0.35 + 0.65 * aPar.x) * step(0.0, wp.y); }`,
    fragmentShader: `uniform float uRain; varying float vA; void main(){ gl_FragColor = vec4(vec3(0.62, 0.66, 0.72), vA * 0.24 * uRain); }`,
  });
  const o = new THREE.LineSegments(g, m); o.frustumCulled = false; o.renderOrder = 5; o.userData.noAO = true; o.userData.noRefl = true; return o;
}

export function createGfx(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(FOG, 0.0015);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 6000);

  const photo = ASSETS.ok;
  if (!photo) SUN_DIR.set(-0.62, 0.74, 0.26).normalize();
  const skyU = photo ? { tSky: { value: ASSETS.sky }, tHdr: { value: ASSETS.skyHdr }, uFog: { value: FOG }, uSunObj: { value: SUN_OBJ }, uGain: { value: SKY.gain } } : { uSun: { value: SUN_DIR }, uFog: { value: FOG }, uTime: WEATHER.uTime };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: photo ? skyPhoto : skyFrag, uniforms: skyU, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false }));
  if (photo) sky.rotation.y = SKY_ROT;
  sky.frustumCulled = false; sky.renderOrder = -10; sky.userData.noAO = true; scene.add(sky);
  // reflections come from the same sky until the city has been captured
  const pm = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(); envScene.add(sky.clone());
  const env = pm.fromScene(envScene, 0, 0.1, 100).texture; scene.environment = env; scene.environmentIntensity = 1.15; pm.dispose();

  const sun = new THREE.DirectionalLight(0xfff1dd, 4.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.07;
  const sc = sun.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 10; sc.far = 2200;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xbfd3ee, 0x7a7268, 1.25));
  const rain = makeRain(); scene.add(rain);
  tankWeather.wet.value = 0.3; tankWeather.dust.value.setRGB(0.1, 0.088, 0.07); WEATHER.uRain.value = 0.12; WEATHER.uWet.value = 0.8; rain.visible = false;

  // planar reflection of everything above the road, mip-mapped so rougher surfaces can read blurrier levels
  const reflRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
  const vcam = new THREE.PerspectiveCamera(), _hidden = [];
  const _n = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3(), _t = new THREE.Vector3(), _rot = new THREE.Matrix4(), _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4(), PLANE_Y = -0.02;
  WEATHER.uRefl.value = reflRT.texture;
  function renderReflection() {
    const cp = camera.getWorldPosition(_v); if (cp.y <= PLANE_Y + 0.05) return false;
    _rot.extractRotation(camera.matrixWorld);
    _t.set(0, 0, -1).applyMatrix4(_rot).add(cp); _t.y = 2 * PLANE_Y - _t.y;
    vcam.position.set(cp.x, 2 * PLANE_Y - cp.y, cp.z); vcam.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n); vcam.lookAt(_t);
    vcam.near = camera.near; vcam.far = camera.far; vcam.updateMatrixWorld(); vcam.matrixWorldInverse.copy(vcam.matrixWorld).invert(); vcam.projectionMatrix.copy(camera.projectionMatrix);
    WEATHER.uReflMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);
    // oblique near plane: nothing below the road gets into the mirror
    _plane.setFromNormalAndCoplanarPoint(_n, _t.set(0, PLANE_Y, 0)).applyMatrix4(vcam.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pe = vcam.projectionMatrix.elements;
    _q.set((Math.sign(_clip.x) + pe[8]) / pe[0], (Math.sign(_clip.y) + pe[9]) / pe[5], -1, (1 + pe[10]) / pe[14]);
    _clip.multiplyScalar(2 / _clip.dot(_q)); pe[2] = _clip.x; pe[6] = _clip.y; pe[10] = _clip.z + 1 - 0.003; pe[14] = _clip.w;
    vcam.projectionMatrixInverse.copy(vcam.projectionMatrix).invert();
    _hidden.length = 0; scene.traverse((o) => { if ((o.userData.noRefl || (o.material && o.material.userData && o.material.userData.wet)) && o.visible) { o.visible = false; _hidden.push(o); } });
    const au = renderer.shadowMap.autoUpdate, tm = renderer.toneMapping; renderer.shadowMap.autoUpdate = false; renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(reflRT); renderer.clear(); renderer.render(scene, vcam); renderer.setRenderTarget(null);
    renderer.shadowMap.autoUpdate = au; renderer.toneMapping = tm; for (const o of _hidden) o.visible = true;
    return true;
  }

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
  const renderPass = new RenderPass(scene, camera), bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.26, 0.6, 1.05), lens = new ShaderPass(LensShader);
  // ground-truth ambient occlusion on the high setting: grounds vehicles, street furniture and building bases
  const ao = new GTAOPass(scene, camera, 256, 256, undefined, { radius: 1.1, distanceExponent: 1.4, thickness: 1.4, scale: 1.3, samples: 8, distanceFallOff: 1, screenSpaceRadius: false }, { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 8, radiusExponent: 2, rings: 2, samples: 8 });
  ao.blendIntensity = 0.9;
  const ov = ao._overrideVisibility.bind(ao);
  ao._overrideVisibility = function () { ov(); const cache = this._visibilityCache; this.scene.traverse((o) => { if (o.userData.noAO && o.visible) { o.visible = false; cache.push(o); } }); };
  composer.addPass(renderPass); composer.addPass(ao); composer.addPass(bloom); composer.addPass(new OutputPass()); composer.addPass(lens);

  const gfx = {
    renderer, scene, camera, sun, composer, lens: lens.uniforms, quality: 'high', usePost: true, time: 0, reflScale: 0.5, weather: WEATHER,
    setQuality(q) {
      this.quality = q;
      const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'mid' ? 1.4 : 1);
      renderer.setPixelRatio(dpr); composer.setPixelRatio(dpr);
      this.usePost = q !== 'low'; bloom.enabled = q !== 'low'; ao.enabled = q === 'high';
      this.reflScale = q === 'high' ? 0.5 : q === 'mid' ? 0.35 : 0;
      renderer.shadowMap.enabled = true; sun.castShadow = q !== 'low';
      sun.shadow.mapSize.set(q === 'high' ? 4096 : 2048, q === 'high' ? 4096 : 2048); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      this.resize();
    },
    resize() {
      const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false); composer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix(); this.lens.uAspect.value = w / h;
      const pr = renderer.getPixelRatio(), k = this.reflScale || 0.25; reflRT.setSize(Math.max(8, Math.round(w * pr * k)), Math.max(8, Math.round(h * pr * k)));
    },
    // Re-light reflections from inside the city: one cube capture from street level replaces the bare-sky environment,
    // so glass towers mirror their neighbours and armour picks up the street.
    captureEnv(x, y, z) {
      const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }), cc = new THREE.CubeCamera(0.5, 5000, rt);
      cc.position.set(x, y, z); sky.position.set(x, y, z); sky.scale.setScalar(3000); sky.updateMatrixWorld();
      const sh = renderer.shadowMap.autoUpdate, rv = rain.visible, ro = WEATHER.uReflOn.value; rain.visible = false; WEATHER.uReflOn.value = 0;
      this.focus(x, z); cc.update(renderer, scene); renderer.shadowMap.autoUpdate = sh; rain.visible = rv; WEATHER.uReflOn.value = ro;
      const pg = new THREE.PMREMGenerator(renderer); scene.environment = pg.fromCubemap(rt.texture).texture; pg.dispose(); rt.dispose();
    },
    // keep the shadow box around the action (snapped so it does not crawl)
    focus(x, z) {
      const s = 160 / 512; x = Math.round(x / s) * s; z = Math.round(z / s) * s;
      sun.target.position.set(x, 0, z); sun.position.set(x, 0, z).addScaledVector(SUN_DIR, 900); sun.target.updateMatrixWorld();
    },
    render(dt) {
      this.time += dt; this.lens.uTime.value = this.time % 100; WEATHER.uTime.value = this.time % 3600;
      sky.position.copy(camera.position); sky.scale.setScalar(3000); sky.updateMatrixWorld();
      rain.material.uniforms.uCam.value.copy(camera.position);
      camera.updateMatrixWorld();
      // where the sun sits on screen, for the glare in the lens pass
      const sp = _t.copy(camera.position).addScaledVector(SUN_DIR, 1000).project(camera), fwd = _v.set(0, 0, -1).transformDirection(camera.matrixWorld).dot(SUN_DIR);
      this.lens.uSunPos.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5, fwd > 0 ? Math.min(1, fwd * 1.4) * (1 - this.lens.uScope.value * 0.5) : 0);
      WEATHER.uReflOn.value = this.reflScale > 0 && renderReflection() ? 1 : 0;
      if (this.usePost) composer.render(dt); else renderer.render(scene, camera);
    },
  };
  return gfx;
}
