// Photographic assets, all CC0 from Poly Haven (see assets/CREDITS.md). They are inlined into the bundle as data
// URLs, decoded once at boot, and everything that uses them falls back to the procedural textures if decoding fails.
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import skyJpg from '../../assets/sky_4k.jpg';
import skyHdr from '../../assets/sky_1k.hdr';
import aD from '../../assets/asphalt_diff.jpg'; import aN from '../../assets/asphalt_nor.jpg'; import aR from '../../assets/asphalt_arm.jpg';
import pD from '../../assets/pavers_diff.jpg'; import pN from '../../assets/pavers_nor.jpg'; import pR from '../../assets/pavers_arm.jpg';
import zD from '../../assets/plaza_diff.jpg'; import zN from '../../assets/plaza_nor.jpg'; import zR from '../../assets/plaza_arm.jpg';

// Where the sun sits in the sky panorama (u, v from the top), measured from the HDR, and the gain that brings the
// tone-mapped JPG up to the HDR's average radiance.
export const SKY = { sunUV: [0.5952, 0.2341], gain: 1.36 };
export const ASSETS = { ok: false };

const bytes = (dataUrl) => { const b = atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
function image(url, o = {}) {
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => { const t = new THREE.Texture(img); t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping; t.anisotropy = o.aniso ?? 8; if (o.noMip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; } t.needsUpdate = true; res(t); };
    img.onerror = () => rej(new Error('image decode failed')); img.src = url;
  });
}
const set = async (d, n, r) => ({ map: await image(d), normal: await image(n, { linear: true }), arm: await image(r, { linear: true }) });

export async function loadAssets() {
  try {
    const hdr = new HDRLoader().parse(bytes(skyHdr).buffer), ht = new THREE.DataTexture(hdr.data, hdr.width, hdr.height, THREE.RGBAFormat, hdr.type);
    ht.flipY = true; ht.minFilter = ht.magFilter = THREE.LinearFilter; ht.wrapS = THREE.RepeatWrapping; ht.generateMipmaps = false; ht.needsUpdate = true;
    const sky = await image(skyJpg, { noMip: true, aniso: 1 }); sky.wrapT = THREE.ClampToEdgeWrapping;
    Object.assign(ASSETS, { sky, skyHdr: ht, asphalt: await set(aD, aN, aR), pavers: await set(pD, pN, pR), plaza: await set(zD, zN, zR), ok: true });
  } catch (e) { console.warn('photographic assets unavailable, using procedural textures', e); ASSETS.ok = false; }
  return ASSETS;
}
