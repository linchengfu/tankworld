// Renderer, golden-hour sky, sun + shadow rig, and the post chain (bloom → tone map → lens pass).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export const SUN_DIR = new THREE.Vector3(-0.68, 0.7, 0.22).normalize(); // afternoon sun from the west, straight down Century Avenue
const FOG = new THREE.Color(0.62, 0.55, 0.47);

const skyVert = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position,1.0); gl_Position = p.xyww; }`;
const skyFrag = `
varying vec3 vDir; uniform vec3 uSun; uniform vec3 uFog;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=vn(p)*a; p=p*2.03+7.1; a*=.5; } return s; }
void main(){
  vec3 d = normalize(vDir); float h = max(d.y, 0.0);
  float sd = max(dot(d, uSun), 0.0);
  vec3 zen = vec3(0.16,0.30,0.56), mid = vec3(0.52,0.62,0.74);
  vec3 col = mix(mid, zen, pow(h, 0.55));
  col = mix(uFog*1.25, col, smoothstep(0.0, 0.28, h));            // haze band on the horizon
  col += vec3(1.0,0.62,0.30) * pow(sd, 6.0) * 0.55;                // wide warm glow toward the sun
  col += vec3(1.0,0.80,0.52) * pow(sd, 90.0) * 1.6;
  col += vec3(1.0,0.92,0.78) * smoothstep(0.99955, 0.9998, sd) * 30.0;
  // thin high cloud streaks
  vec2 cp = d.xz / (d.y + 0.18) * 1.6; float c = fbm(cp*vec2(1.0,2.4) + 3.0); c = smoothstep(0.52, 0.86, c) * smoothstep(0.02, 0.3, d.y);
  vec3 cc = mix(vec3(0.80,0.74,0.70), vec3(1.25,0.92,0.66), pow(sd, 2.0));
  col = mix(col, cc, c * 0.6);
  if (d.y < 0.0) col = mix(uFog*1.1, uFog*0.55, smoothstep(0.0, -0.4, d.y));
  gl_FragColor = vec4(col, 1.0);
}`;

const LensShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uHit: { value: 0 }, uScope: { value: 0 }, uDead: { value: 0 }, uAspect: { value: 1.6 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
  varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uTime, uHit, uScope, uDead, uAspect;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime*7.13) * 43758.5453); }
  void main(){
    vec2 c = vUv - 0.5; float r = length(c * vec2(uAspect, 1.0));
    float ca = 0.0012 + uHit * 0.006;
    vec3 col = vec3(texture2D(tDiffuse, vUv + c*ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c*ca).b);
    col *= 1.0 - smoothstep(0.45, 1.05, r) * (0.42 + uScope * 0.35);
    col = mix(col, vec3(dot(col, vec3(0.3,0.59,0.11))) * vec3(1.0,0.92,0.85), uDead * 0.75);
    col = mix(col, col * vec3(1.25,0.55,0.45), uHit * smoothstep(0.2, 0.9, r));
    col += (h(vUv * 811.0) - 0.5) * 0.028;
    gl_FragColor = vec4(col, 1.0);
  }`,
};

export function createGfx(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(FOG, 0.0019);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 6000);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, uniforms: { uSun: { value: SUN_DIR }, uFog: { value: FOG } }, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false }));
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  // reflections come from the same sky
  const pm = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(); envScene.add(sky.clone());
  const env = pm.fromScene(envScene, 0, 0.1, 100).texture; scene.environment = env; scene.environmentIntensity = 0.85; pm.dispose();

  const sun = new THREE.DirectionalLight(0xffe0b8, 3.3);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.06;
  const sc = sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 10; sc.far = 1500;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xa6c0e6, 0x62554a, 1.15));

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
  const renderPass = new RenderPass(scene, camera), bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.7, 1.05), lens = new ShaderPass(LensShader);
  composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new OutputPass()); composer.addPass(lens);

  const gfx = {
    renderer, scene, camera, sun, composer, lens: lens.uniforms, quality: 'high', usePost: true, time: 0,
    setQuality(q) {
      this.quality = q;
      const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'mid' ? 1.4 : 1);
      renderer.setPixelRatio(dpr); composer.setPixelRatio(dpr);
      this.usePost = q !== 'low'; bloom.enabled = q !== 'low';
      renderer.shadowMap.enabled = true; sun.castShadow = q !== 'low';
      sun.shadow.mapSize.set(q === 'high' ? 4096 : 2048, q === 'high' ? 4096 : 2048); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      this.resize();
    },
    resize() {
      const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false); composer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix(); this.lens.uAspect.value = w / h;
    },
    // keep the shadow box around the action (snapped so it does not crawl)
    focus(x, z) {
      const s = 150 / 512; x = Math.round(x / s) * s; z = Math.round(z / s) * s;
      sun.target.position.set(x, 0, z); sun.position.set(x, 0, z).addScaledVector(SUN_DIR, 700); sun.target.updateMatrixWorld();
    },
    render(dt) {
      this.time += dt; this.lens.uTime.value = this.time % 100;
      sky.position.copy(camera.position); sky.scale.setScalar(3000); sky.updateMatrixWorld();
      if (this.usePost) composer.render(dt); else renderer.render(scene, camera);
    },
  };
  return gfx;
}
