// Boot: build the city, wire the systems together, run the frame loop.
import * as THREE from 'three';
import { createGfx } from './gfx/renderer.js';
import { buildCity } from './world/city.js';
import { FX } from './fx/fx.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Hud } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const settings = { tank: 'ztz99a', diff: 'normal', size: 5, quality: 'mid', sens: 1, vol: 0.8 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('pudong-armor') || '{}')); } catch (e) { /* storage is optional */ }
const save = () => { try { localStorage.setItem('pudong-armor', JSON.stringify(settings)); } catch (e) { /* ignore */ } };
const step = (pct, msg) => new Promise((r) => { $('boot-fill').style.width = pct + '%'; if (msg) $('boot-msg').textContent = msg; requestAnimationFrame(() => setTimeout(r, 0)); });

async function boot() {
  const canvas = $('view'), ui = $('ui');
  await step(8, '正在点亮天空');
  const gfx = createGfx(canvas);
  await step(25, '正在构筑陆家嘴');
  const world = buildCity(gfx.scene);
  await step(70, '正在调校火控');
  const fx = new FX(gfx.scene), audio = new Audio(), input = new Input(canvas), hud = new Hud(ui);
  input.bindTouch();
  let game;
  const menu = new Menu(ui, settings, {
    save, click: (k) => { audio.init(); audio.ui(k); },
    select: (def) => { if (game && game.state === 'garage') game.showTank(def); },
    settings: () => { save(); gfx.setQuality(settings.quality); audio.setVolume(settings.vol); },
    start: () => { audio.init(); audio.setVolume(settings.vol); game.start(); if (!input.touch) input.lock(); },
    resume: () => game.pause(false),
    quit: () => { audio.suspend(false); game.toGarage(); },
  });
  game = new Game({ gfx, world, audio, hud, input, fx, settings, menu });
  gfx.setQuality(settings.quality);
  game.toGarage();
  await step(100, '准备就绪');
  window.addEventListener('resize', () => gfx.resize());
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'battle' && !game.paused) game.pause(true); });
  let last = performance.now(), slow = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    game.update(dt); gfx.render(dt);
    // drop a quality step if the machine cannot hold ~24 fps
    if (dt > 0.042) { if (++slow > 150 && settings.quality !== 'low') { settings.quality = settings.quality === 'high' ? 'mid' : 'low'; gfx.setQuality(settings.quality); slow = 0; } } else slow = Math.max(0, slow - 2);
    window.__frames = (window.__frames || 0) + 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  $('boot').classList.add('done');
  if (typeof __DEV__ !== 'undefined' && __DEV__) window.__dbg = { game, gfx, world, THREE, settings, input };
}
boot().catch((e) => { $('boot-msg').textContent = '启动失败：' + (e && e.message ? e.message : e); console.error(e); });
