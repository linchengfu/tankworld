// Garage (tank select), help, settings, pause and after-action screens.
import { TANKS, SHELL_LABEL } from '../data/tanks.js';
import { DIFF } from '../ai/ai.js';
import { drawXray } from './xray.js';
import { REASON } from './hud.js';

const $ = (id) => document.getElementById(id);
const KEYS = `
<dl class="keys">
  <dt><kbd>W</kbd> <kbd>S</kbd></dt><dd>前进 / 倒车</dd>
  <dt><kbd>A</kbd> <kbd>D</kbd></dt><dd>车体左转 / 右转（静止时原地转向）</dd>
  <dt><kbd>空格</kbd></dt><dd>制动</dd>
  <dt>鼠标移动</dt><dd>观察与瞄准，炮塔会以自身转速跟随准星</dd>
  <dt>鼠标左键</dt><dd>开火</dd>
  <dt>鼠标右键（按住）</dt><dd>自由观察，炮塔保持不动</dd>
  <dt><kbd>Shift</kbd> / 滚轮</dt><dd>切换炮手瞄准镜、调整倍率与镜头距离</dd>
  <dt><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></dt><dd>穿甲弹 / 破甲弹 / 高爆弹（换弹需要重新装填）</dd>
  <dt><kbd>F</kbd></dt><dd>停车后战地维修履带、发动机、火炮</dd>
  <dt><kbd>Esc</kbd></dt><dd>暂停</dd>
</dl>
<ul class="tips">
  <li>没有血条。炮弹要先打穿装甲，再由弹芯和破片杀伤车内的乘员与部件。</li>
  <li>炮口指示圈变<b style="color:var(--ally)">绿</b>表示能击穿，<b style="color:var(--amber)">黄</b>表示勉强，<b style="color:var(--enemy)">红</b>表示打不穿。正面请瞄车体首下和炮盾，侧面和后部几乎一打就穿。</li>
  <li>车体与来袭方向的夹角越大，装甲等效越厚；角度过大时炮弹会直接跳开。</li>
  <li>弹药架被击中可能殉爆；只剩一名乘员时车辆即失去战斗力。</li>
  <li>占满世纪大道与银城中路路口的据点，或击毁全部敌方坦克即可获胜。</li>
</ul>`;

const HTML = `
<div id="garage" class="screen">
  <div class="g-left">
    <h1 class="g-title">浦东铁流</h1>
    <div class="g-sub">LUJIAZUI · ARMOURED ENCOUNTER</div>
    <div class="g-list" id="g-list"></div>
  </div>
  <div class="g-mid">
    <div class="rot">横屏游玩体验更佳</div>
    <div class="opt"><label>对手</label><div class="seg" id="seg-diff"></div><label>规模</label><div class="seg" id="seg-size"></div></div>
    <button class="go" id="btn-go">开始战斗</button>
    <div class="row"><button class="ghost" id="btn-help">操作说明</button><button class="ghost" id="btn-set">设置</button></div>
  </div>
  <div class="g-right">
    <div class="g-card plate">
      <h2 id="g-name"></h2><h3 id="g-cn"></h3><p id="g-blurb"></p>
      <div class="bar3"><span>火力</span><u><i id="g-b1"></i></u><span class="num" id="g-n1"></span></div>
      <div class="bar3"><span>防护</span><u><i id="g-b2"></i></u><span class="num" id="g-n2"></span></div>
      <div class="bar3"><span>机动</span><u><i id="g-b3"></i></u><span class="num" id="g-n3"></span></div>
      <dl class="spec" id="g-spec"></dl>
    </div>
    <div class="g-card plate"><h3 style="margin:0 0 4px">车内布局</h3><canvas id="gx" width="620" height="300"></canvas></div>
  </div>
</div>
<div id="m-help" class="modal"><div class="card wide"><h2>操作说明</h2>${KEYS}<div class="row"><button class="ghost" data-close>知道了</button></div></div></div>
<div id="m-set" class="modal"><div class="card"><h2>设置</h2>
  <div class="set">
    <label>画质</label><div class="seg" id="seg-q"></div>
    <label for="set-sens">鼠标灵敏度</label><input type="range" id="set-sens" min="0.3" max="2.5" step="0.05">
    <label for="set-vol">音量</label><input type="range" id="set-vol" min="0" max="1" step="0.02">
  </div>
  <div class="row"><button class="ghost" data-close>完成</button></div></div></div>
<div id="m-pause" class="modal"><div class="card"><h2>暂停</h2>
  <div class="row" style="justify-content:flex-start"><button class="go" id="btn-resume" style="font-size:20px;padding:8px 30px">继续战斗</button><button class="ghost" id="btn-phelp">操作说明</button><button class="ghost" id="btn-pset">设置</button><button class="ghost" id="btn-quit">返回车库</button></div></div></div>
<div id="m-result" class="modal"><div class="card wide" id="result"><h2 id="r-head"></h2><p class="why" id="r-why"></p><div class="stats" id="r-stats"></div><div class="board" id="r-board"></div>
  <div class="row" style="justify-content:flex-start"><button class="go" id="btn-again" style="font-size:20px;padding:8px 30px">再战一场</button><button class="ghost" id="btn-back">返回车库</button></div></div></div>`;

export class Menu {
  constructor(root, settings, cb) {
    root.insertAdjacentHTML('beforeend', HTML);
    this.s = settings; this.cb = cb; this.sel = settings.tank || TANKS[0].id;
    $('g-list').innerHTML = TANKS.map((t) => `<button class="g-item" data-id="${t.id}"><i class="flag ${t.nation}"></i><div><b>${t.name}</b><span>${t.nationName} · ${t.cn}</span></div></button>`).join('');
    $('g-list').addEventListener('click', (e) => { const b = e.target.closest('.g-item'); if (b) { this.select(b.dataset.id); cb.click('select'); } });
    this.seg('seg-diff', Object.keys(DIFF).map((k) => [k, DIFF[k].label]), 'diff'); this.seg('seg-size', [[3, '3 v 3'], [5, '5 v 5'], [7, '7 v 7']], 'size');
    this.seg('seg-q', [['low', '低'], ['mid', '中'], ['high', '高']], 'quality', () => cb.settings());
    $('set-sens').value = settings.sens; $('set-vol').value = settings.vol;
    $('set-sens').addEventListener('input', (e) => { settings.sens = +e.target.value; cb.settings(); }); $('set-vol').addEventListener('input', (e) => { settings.vol = +e.target.value; cb.settings(); });
    $('btn-go').addEventListener('click', () => cb.start()); $('btn-help').addEventListener('click', () => this.modal('m-help', true)); $('btn-set').addEventListener('click', () => this.modal('m-set', true));
    $('btn-phelp').addEventListener('click', () => this.modal('m-help', true)); $('btn-pset').addEventListener('click', () => this.modal('m-set', true));
    $('btn-resume').addEventListener('click', () => cb.resume()); $('btn-quit').addEventListener('click', () => cb.quit());
    $('btn-again').addEventListener('click', () => cb.start()); $('btn-back').addEventListener('click', () => cb.quit());
    root.addEventListener('click', (e) => { if (e.target.closest('button')) cb.click('click'); const c = e.target.closest('[data-close]'); if (c) c.closest('.modal').classList.remove('on'); });
    this.select(this.sel);
  }
  seg(id, items, key, after) {
    const el = $(id); el.innerHTML = items.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('');
    const paint = () => { for (const b of el.children) b.classList.toggle('sel', String(this.s[key]) === b.dataset.v); };
    el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; this.s[key] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v; paint(); this.cb.save(); if (after) after(); }); paint();
  }
  modal(id, on) { $(id).classList.toggle('on', on); }
  anyModal() { return ['m-help', 'm-set'].some((id) => $(id).classList.contains('on')); }
  garage(on) { $('garage').classList.toggle('on', on); if (on) { this.modal('m-result', false); this.modal('m-pause', false); } }
  select(id) {
    const d = TANKS.find((t) => t.id === id) || TANKS[0]; this.sel = d.id; this.s.tank = d.id; this.cb.save();
    for (const b of $('g-list').children) b.classList.toggle('sel', b.dataset.id === d.id);
    $('g-name').textContent = d.name; $('g-cn').textContent = `${d.nationName} · ${d.cn}`; $('g-blurb').textContent = d.blurb;
    [['fire', 1], ['armor', 2], ['mob', 3]].forEach(([k, i]) => { $('g-b' + i).style.width = d.rating[k] + '%'; $('g-n' + i).textContent = d.rating[k]; });
    $('g-spec').innerHTML = [
      ['主炮', d.gunName], ['穿甲弹', `${d.shells[0].name} · ${d.shells[0].pen} mm`], ['破甲弹', `${d.shells[1].name} · ${d.shells[1].pen} mm`],
      ['装填', `${d.reload.toFixed(1)} s · ${d.autoloader ? '自动装弹机' : '人工装填'}`], ['极速 / 倒车', `${d.vmax} / ${d.vrev} km/h`], ['功重比', `${d.pw.toFixed(1)} hp/t · ${d.mass} t`],
      ['俯仰角', `-${d.depr}° / +${d.elev}°`], ['正面装甲', `炮塔 ${d.armor.tfront[0]} · 首上 ${d.armor.ufp[0]} · 首下 ${d.armor.lfp[0]} mm`], ['乘员', `${d.crewN} 人`],
    ].map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    const cv = $('gx'), g = cv.getContext('2d'); g.save(); g.clearRect(0, 0, 620, 300); g.translate(310, 150); g.rotate(Math.PI / 2); g.translate(-150, -310); drawXray(g, d, null, 300, 620); g.restore();
    this.cb.select(d);
  }
  result(r) {
    $('result').className = 'card wide ' + r.outcome; $('r-head').textContent = r.outcome === 'win' ? '胜利' : r.outcome === 'lose' ? '失败' : '平局'; $('r-why').textContent = r.why;
    const s = r.me.stats;
    $('r-stats').innerHTML = [['击毁', s.kills], ['开火 / 命中', `${s.shots} / ${s.hits}`], ['击穿', s.pens], ['挡下炮弹', s.bounced]].map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    const col = (team, cls, title) => `<div><h5 class="${cls}">${title}</h5>${r.tanks.filter((t) => t.team === team).sort((a, b) => b.stats.kills - a.stats.kills).map((t) => `<div class="${t.alive ? '' : 'x'} ${t === r.me ? 'me' : ''}"><span>${t.name} · ${t.def.name}</span><span class="num">${t.stats.kills} 击毁${t.alive ? '' : ' · ' + (REASON[t.deadReason] || '')}</span></div>`).join('')}</div>`;
    $('r-board').innerHTML = col(0, 'a', '我方') + col(1, 'e', '敌方');
    this.modal('m-result', true);
  }
}
