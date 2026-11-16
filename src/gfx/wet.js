// Rain-soaked ground. Any MeshStandardMaterial passed through wetGround() gets, in world space: a continuous
// dry → damp → standing-water gradient, puddles that mirror the scene through a planar reflection (blurred by
// roughness, smeared toward the viewer on damp asphalt), and rain rings spreading across the water.
import * as THREE from 'three';

// One set of uniforms shared by every wet material; the renderer owns the reflection texture and matrix.
export const WEATHER = {
  uTime: { value: 0 }, uRain: { value: 0.7 }, uWet: { value: 1 }, uReflOn: { value: 0 }, uRefl: { value: null }, uReflMatrix: { value: new THREE.Matrix4() },
};

const HEAD = `
uniform float uTime, uRain, uWet, uReflOn, uPud; uniform sampler2D uRefl; uniform mat4 uReflMatrix;
varying vec3 vGW;
float gPud; float gDamp; vec2 gSlope;
float gH1(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec3 gH3(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.xxy + q.yzz) * q.zyx); }
float gVN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gH1(i), gH1(i + vec2(1.0, 0.0)), f.x), mix(gH1(i + vec2(0.0, 1.0)), gH1(i + vec2(1.0, 1.0)), f.x), f.y); }
// one sparse layer of rain rings: each cell gets a new drop every cycle; returns the surface slope it adds
vec2 gRipple(vec2 p, float t, float cell, float seed){
  vec2 q = p / cell + seed * 17.3, id = floor(q), f = fract(q);
  vec3 h0 = gH3(id + seed); float tt = t * (0.6 + 0.5 * h0.x) + h0.y * 9.0, cyc = floor(tt), life = fract(tt);
  vec3 h = gH3(id + seed + cyc * 7.31);
  float on = step(h.z, 0.25 + 0.6 * uRain);
  vec2 dv = (f - mix(vec2(0.3), vec2(0.7), h.xy)) * cell; float d = length(dv), r = life * 0.3 * cell, w = 0.006 + 0.02 * life, x = (d - r) / w;
  float amp = 1.0 - life; amp *= amp * on;
  return dv / max(d, 1e-4) * (x * exp(-x * x) * 2.3) * amp;
}`;
const MASK = `
{
  vec2 gxz = vGW.xz; float gDist = length(cameraPosition - vGW);
  float n1 = gVN(gxz * 0.05), n2 = gVN(gxz * 0.17 + 7.0), n3 = gVN(gxz * 0.9 + 3.0);
  float depth = n1 * 0.58 + n2 * 0.36 + n3 * 0.06 - uPud;
  gPud = smoothstep(0.0, 0.022, depth) * uWet;
  gDamp = uWet * (0.78 + 0.22 * smoothstep(-0.16, 0.0, depth));
  diffuseColor.rgb *= mix(1.0, 0.66, gDamp);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45 + vec3(0.004, 0.005, 0.006), gPud);
  gSlope = vec2(0.0);
  if (gPud > 0.01 && gDist < 42.0) {
    float rf = 1.0 - smoothstep(18.0, 42.0, gDist);
    gSlope = (gRipple(gxz, uTime, 0.83, 1.0) + gRipple(gxz.yx + 3.1, uTime * 0.87, 1.31, 2.0).yx + gRipple(gxz * 1.0 + 9.7, uTime * 1.13, 0.57, 3.0) * 0.6) * 0.32 * rf * (0.3 + 0.7 * uRain);
  }
}`;
const REFL = `
{
  vec4 rc = uReflMatrix * vec4(vGW.x, 0.0, vGW.z, 1.0);
  vec2 ruv = rc.xy / max(rc.w, 1e-4);
  vec3 nWr = inverseTransformDirection(normal, viewMatrix);
  vec2 rt = normalize(vec2(viewMatrix[0][0], viewMatrix[2][0]) + vec2(1e-5)), fw = vec2(-rt.y, rt.x);
  float gd = length(cameraPosition - vGW), dk = 1.0 / (1.0 + gd * 0.05);
  ruv += clamp(vec2(dot(nWr.xz, rt), dot(nWr.xz, fw)) * dk * 0.6, vec2(-0.1), vec2(0.1));
  float r = material.roughness;
  float lod = clamp(r * 9.0, 0.0, 6.0) + (1.0 - gPud) * 1.3;
  vec2 st = vec2(0.0, r * 0.1 + (1.0 - gPud) * 0.035), lo = vec2(0.002), hi = vec2(0.998);
  vec3 pr = textureLod(uRefl, clamp(ruv, lo, hi), lod).rgb * 0.5 + textureLod(uRefl, clamp(ruv + st, lo, hi), lod + 0.6).rgb * 0.25 + textureLod(uRefl, clamp(ruv - st * 0.6, lo, hi), lod + 0.6).rgb * 0.25;
  pr = min(pr, vec3(40.0));
  float pw = (1.0 - smoothstep(0.42, 0.8, r)) * uReflOn;
  radiance = mix(radiance, pr, pw);
}`;

// o.pud: water level, 0.5 floods about half the surface, 0.7 leaves only the odd puddle.
export function wetGround(m, o = {}) {
  const pud = { value: o.pud ?? 0.57 };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, WEATHER, { uPud: pud });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${HEAD}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${MASK}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(roughnessFactor, roughnessFactor * 0.4 + 0.1, gDamp), 0.035, gPud);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, normalize(mat3(viewMatrix) * normalize(vec3(-gSlope.x, 1.0, -gSlope.y))), gPud));')
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n${REFL}`);
  };
  m.customProgramCacheKey = () => 'wet-ground';
  m.userData.wet = true;
  return m;
}
