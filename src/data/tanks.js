// Tank roster: mobility, firepower, armour (mm RHA-equivalent) and the internal module layout used by the damage model.
// Local axes for every tank: +z forward, +x left, +y up. Hull space origin = hull centre on the ground.
// Turret space origin = turret ring centre on the hull roof.
// Armour values: [kinetic, chemical]. Frontal zones (ufp/lfp/tfront/mant) are line-of-sight values for a level
// head-on shot; the builder converts them to plate-normal thickness so angling works geometrically.

export const CREW_LABEL = { commander: '车长', gunner: '炮手', loader: '装填手', driver: '驾驶员' };
export const MODULE_LABEL = {
  engine: '发动机', trans: '传动', fuel: '油箱', ammo: '弹药架', breech: '炮闩', tdrive: '炮塔驱动', autoloader: '自动装弹机',
  trackL: '左履带', trackR: '右履带', barrel: '炮管', wall: '隔舱',
};
export const SHELL_LABEL = { ap: '尾翼稳定脱壳穿甲弹', heat: '破甲弹', he: '高爆弹' };
export const SHELL_SHORT = { ap: 'APFSDS', heat: 'HEAT', he: 'HE' };

const KIND = {
  crew: { hp: 100, absorb: 30 }, engine: { hp: 320, absorb: 280 }, trans: { hp: 260, absorb: 220 }, fuel: { hp: 160, absorb: 55 },
  ammo: { hp: 110, absorb: 70 }, breech: { hp: 220, absorb: 220 }, tdrive: { hp: 160, absorb: 60 }, autoloader: { hp: 170, absorb: 90 },
  wall: { hp: 1e9, absorb: 300 },
};

function buildModules(def) {
  const g = def.geo, L = g.L, by = g.belly + 0.05, hy = g.hullH - 0.05, T = g.turret, th = T.h, gz = g.gun.z, gy = g.gun.y;
  const hm = (by + hy) / 2, hh = hy - by;
  const out = [];
  const add = (id, kind, space, cx, cy, cz, sx, sy, sz, extra = {}) => {
    const k = KIND[kind];
    out.push({ id, kind, space, min: [cx - sx / 2, cy - sy / 2, cz - sz / 2], max: [cx + sx / 2, cy + sy / 2, cz + sz / 2], hpMax: k.hp, absorb: k.absorb, ...extra });
  };
  const zr = T.prof[T.prof.length - 1][0]; // turret rear z
  // power pack (all layouts: rear engine, rear transmission)
  add('trans', 'trans', 'hull', 0, hm, -L / 2 + 0.55, 1.9, hh, 0.7);
  add('engine', 'engine', 'hull', 0, hm, -L / 2 + 1.75, 1.7, hh, 1.6);
  add('fuelR', 'fuel', 'hull', 0.95 * (def.layout === 'leclerc' ? 0 : 1), hm, -L / 2 + 2.9, 0.4, hh * 0.8, 0.7);
  // gun
  add('breech', 'breech', 'turret', 0, gy, gz - 0.75, 0.5, 0.5, 1.3);
  add('tdrive', 'tdrive', 'turret', 0, 0.08, 0.15, 1.0, 0.22, 1.0);
  const tcy = th * 0.2, tch = th * 1.3; // turret crew sit in a basket that reaches down into the hull
  if (def.layout === 'west4') {
    const dx = g.driverX || 0;
    add('driver', 'crew', 'hull', dx, hm, L / 2 - g.glacisLen - 0.55, 0.6, hh, 1.0, { role: 'driver' });
    add('fuelF', 'fuel', 'hull', dx > 0 ? -0.75 : 0.85, hm, L / 2 - g.glacisLen - 0.5, 0.5, hh * 0.8, 0.9);
    if (g.hullAmmo) add('ammoH', 'ammo', 'hull', g.hullAmmo[0], hm, L / 2 - g.glacisLen - 0.5 + g.hullAmmo[1], 0.7, hh * 0.85, 1.0);
    add('gunner', 'crew', 'turret', -0.62, tcy, gz - 0.95, 0.5, tch, 0.55, { role: 'gunner' });
    add('commander', 'crew', 'turret', -0.62, tcy, gz - 1.8, 0.5, tch, 0.6, { role: 'commander' });
    add('loader', 'crew', 'turret', 0.62, tcy, gz - 1.4, 0.55, tch, 0.75, { role: 'loader' });
    add('ammoB', 'ammo', 'turret', 0, th * 0.5, zr + 0.6, 1.9, th * 0.7, 0.95, { blowout: true });
  } else if (def.layout === 'carousel') {
    add('driver', 'crew', 'hull', 0, hm, L / 2 - g.glacisLen - 0.5, 0.6, hh, 1.0, { role: 'driver' });
    add('fuelF', 'fuel', 'hull', -0.8, hm, L / 2 - g.glacisLen - 0.45, 0.55, hh * 0.8, 0.9);
    add('ammoH', 'ammo', 'hull', 0.8, hm, L / 2 - g.glacisLen - 0.45, 0.55, hh * 0.7, 0.8);
    add('ammoC', 'ammo', 'hull', 0, by + 0.2, T.z, 1.7, 0.4, 1.7);
    add('autoloader', 'autoloader', 'turret', 0, 0.3, gz - 1.75, 0.5, 0.5, 0.6);
    add('gunner', 'crew', 'turret', 0.62, tcy, gz - 1.25, 0.5, tch, 0.6, { role: 'gunner' });
    add('commander', 'crew', 'turret', -0.62, tcy, gz - 1.25, 0.5, tch, 0.6, { role: 'commander' });
    if (g.bustleAmmo) add('ammoB', 'ammo', 'turret', 0, th * 0.5, zr + 0.45, 1.5, th * 0.6, 0.7, { blowout: true });
  } else if (def.layout === 'capsule') {
    const cz = L / 2 - g.glacisLen - 0.45;
    add('driver', 'crew', 'hull', 0.7, hm, cz, 0.5, hh, 0.9, { role: 'driver' });
    add('gunner', 'crew', 'hull', 0, hm, cz, 0.5, hh, 0.9, { role: 'gunner' });
    add('commander', 'crew', 'hull', -0.7, hm, cz, 0.5, hh, 0.9, { role: 'commander' });
    add('capsule', 'wall', 'hull', 0, hm, cz - 0.75, 2.3, hh, 0.12);
    add('ammoC', 'ammo', 'hull', 0, by + 0.25, T.z, 1.7, 0.5, 1.7);
    add('autoloader', 'autoloader', 'turret', 0, 0.3, gz - 1.75, 0.6, 0.5, 0.7);
    add('fuelF', 'fuel', 'hull', 0.9, hm, cz - 1.5, 0.45, hh * 0.8, 0.9);
  } else if (def.layout === 'leclerc') {
    add('driver', 'crew', 'hull', 0.55, hm, L / 2 - g.glacisLen - 0.5, 0.6, hh, 1.0, { role: 'driver' });
    add('ammoH', 'ammo', 'hull', -0.55, hm, L / 2 - g.glacisLen - 0.5, 0.8, hh * 0.85, 0.9);
    add('fuelF', 'fuel', 'hull', 0.9, hm, L / 2 - g.glacisLen - 1.6, 0.45, hh * 0.8, 0.8);
    add('gunner', 'crew', 'turret', -0.62, tcy, gz - 1.2, 0.5, tch, 0.6, { role: 'gunner' });
    add('commander', 'crew', 'turret', 0.62, tcy, gz - 1.2, 0.5, tch, 0.6, { role: 'commander' });
    add('autoloader', 'autoloader', 'turret', 0, th * 0.5, zr + 1.35, 1.6, th * 0.6, 0.5);
    add('ammoB', 'ammo', 'turret', 0, th * 0.5, zr + 0.6, 1.9, th * 0.7, 0.95, { blowout: true });
  }
  return out;
}

const T = [];

T.push({
  id: 'ztz99a', name: 'ZTZ-99A', cn: '99A式主战坦克', nation: 'cn', nationName: '中国',
  blurb: '解放军陆军的拳头装备。125毫米高膛压滑膛炮配自动装弹机，楔形附加装甲与激光压制系统，1500马力让它在同级中机动性拔尖。',
  mass: 55, hp: 1500, vmax: 80, vrev: 36, hullTurn: 38, turretTurn: 36, elevRate: 20, depr: 6, elev: 14,
  reload: 7.0, autoloader: true, crewN: 3, layout: 'carousel', aimTime: 1.9, disp: 1.15,
  gunName: 'ZPT-98 125毫米滑膛炮',
  shells: [
    { type: 'ap', name: 'DTC10-125', v: 1740, pen: 680 },
    { type: 'heat', name: 'DTP-125', v: 1000, pen: 480 },
    { type: 'he', name: 'DTB-125', v: 850, pen: 42 },
  ],
  ammo: [22, 12, 8],
  armor: { ufp: [800, 1000], lfp: [300, 370], hside: [70, 220], hrear: [40, 40], htop: [35, 35], hbot: [25, 25], tfront: [820, 1150], mant: [400, 480], tside: [280, 450], trear: [50, 50], ttop: [40, 40] },
  geo: {
    L: 8.1, W: 3.7, hullH: 1.62, belly: 0.48, glacisLen: 1.6, noseY: 1.03, lfpLen: 0.75, trackW: 0.62, trackH: 1.04,
    turret: { z: 0.2, h: 0.86, prof: [[1.8, 0.42], [1.35, 1.22], [0.15, 1.45], [-0.9, 1.4], [-2.3, 1.0]], taper: [0.92, 0.85] },
    gun: { z: 1.5, y: 0.4, len: 5.25, r: 0.085, evac: 0.5 }, mant: [0.4, 0.3],
  },
  camo: { type: 'digital', colors: ['#5e7b36', '#35513a', '#bf9a74', '#252925'], rough: 0.46 },
});

T.push({
  id: 't14', name: 'T-14 Armata', cn: 'T-14“阿玛塔”', nation: 'ru', nationName: '俄罗斯',
  blurb: '无人炮塔设计：三名乘员全部坐在车体前部的装甲隔离舱内。炮塔正面装甲薄弱，但打穿它伤不到人——想击毁它，瞄准车体。',
  mass: 55, hp: 1500, vmax: 80, vrev: 40, hullTurn: 38, turretTurn: 40, elevRate: 22, depr: 6, elev: 16,
  reload: 6.2, autoloader: true, crewN: 3, layout: 'capsule', aimTime: 1.7, disp: 1.05,
  gunName: '2A82-1M 125毫米滑膛炮',
  shells: [
    { type: 'ap', name: '3BM69 真空-1', v: 1780, pen: 760 },
    { type: 'heat', name: '3BK31', v: 1000, pen: 550 },
    { type: 'he', name: '3OF82', v: 850, pen: 42 },
  ],
  ammo: [24, 12, 9],
  armor: { ufp: [900, 1200], lfp: [360, 480], hside: [90, 380], hrear: [45, 45], htop: [40, 60], hbot: [30, 30], tfront: [260, 380], mant: [200, 250], tside: [90, 200], trear: [40, 60], ttop: [30, 30] },
  geo: {
    L: 8.25, W: 3.9, hullH: 1.68, belly: 0.5, glacisLen: 2.3, noseY: 1.1, lfpLen: 0.8, trackW: 0.62, trackH: 1.1,
    turret: { z: -0.1, h: 0.86, prof: [[2.0, 0.32], [1.15, 0.9], [0.45, 1.1], [-1.2, 1.1], [-2.4, 0.9]], taper: [0.92, 0.78] },
    gun: { z: 1.85, y: 0.35, len: 4.85, r: 0.088 }, mant: [0.34, 0.28],
  },
  camo: { type: 'solid', colors: ['#49553a'], rough: 0.6 },
});

T.push({
  id: 't90m', name: 'T-90M 突破', cn: 'T-90M“突破”', nation: 'ru', nationName: '俄罗斯',
  blurb: '车身低矮、正面披挂“遗迹”反应装甲。倒车只有每小时 5 公里，转盘式弹药架就在乘员脚下——一旦被从侧面打穿，炮塔很可能直接飞天。',
  mass: 48, hp: 1130, vmax: 60, vrev: 5, hullTurn: 36, turretTurn: 38, elevRate: 20, depr: 5, elev: 14,
  reload: 7.0, autoloader: true, crewN: 3, layout: 'carousel', aimTime: 1.9, disp: 1.15,
  gunName: '2A46M-5 125毫米滑膛炮',
  shells: [
    { type: 'ap', name: '3BM60 铅弹-2', v: 1660, pen: 640 },
    { type: 'heat', name: '3BK31', v: 1000, pen: 550 },
    { type: 'he', name: '3OF26', v: 850, pen: 42 },
  ],
  ammo: [22, 12, 9],
  armor: { ufp: [800, 1100], lfp: [280, 340], hside: [70, 300], hrear: [40, 40], htop: [35, 35], hbot: [25, 25], tfront: [800, 1150], mant: [360, 430], tside: [250, 450], trear: [45, 80], ttop: [40, 40] },
  geo: {
    L: 6.86, W: 3.78, hullH: 1.36, belly: 0.46, glacisLen: 1.43, noseY: 0.89, lfpLen: 0.55, trackW: 0.58, trackH: 1.03,
    turret: { z: -0.37, h: 0.68, prof: [[1.7, 0.44], [1.25, 1.0], [0.6, 1.3], [-0.6, 1.24], [-1.7, 1.0]], taper: [0.92, 0.84] },
    gun: { z: 1.45, y: 0.42, len: 4.5, r: 0.085, evac: 0.52 }, mant: [0.38, 0.28],
  },
  camo: { type: 'solid', colors: ['#555b4c'], rough: 0.66 },
});

T.push({
  id: 'm1a2', name: 'M1A2 SEPv3', cn: 'M1A2 SEPv3“艾布拉姆斯”', nation: 'us', nationName: '美国',
  blurb: '贫铀装甲炮塔正面几乎无解，弹药全部存放在带泄压板的尾舱内，殉爆也未必致命。燃气轮机加速迅猛，倒车很快。',
  mass: 66.8, hp: 1500, vmax: 67, vrev: 40, hullTurn: 36, turretTurn: 40, elevRate: 24, depr: 10, elev: 20,
  reload: 6.0, autoloader: false, crewN: 4, layout: 'west4', aimTime: 1.6, disp: 1.0, turbine: true,
  gunName: 'M256 120毫米滑膛炮',
  shells: [
    { type: 'ap', name: 'M829A4', v: 1650, pen: 740 },
    { type: 'heat', name: 'M830A1', v: 1410, pen: 480 },
    { type: 'he', name: 'M1147 AMP', v: 1100, pen: 45 },
  ],
  ammo: [24, 10, 8],
  armor: { ufp: [600, 700], lfp: [620, 880], hside: [65, 320], hrear: [35, 35], htop: [40, 40], hbot: [25, 25], tfront: [900, 1300], mant: [430, 600], tside: [330, 480], trear: [40, 60], ttop: [45, 45] },
  geo: {
    L: 7.8, W: 3.66, hullH: 1.6, belly: 0.48, glacisLen: 2.05, noseY: 1.25, lfpLen: 0.65, trackW: 0.635, trackH: 1.3,
    turret: { z: 0.1, h: 0.85, prof: [[2.4, 0.75], [1.86, 1.68], [0.4, 1.64], [-1.86, 1.47], [-2.3, 1.43]], taper: [0.97, 0.95] },
    gun: { z: 2.1, y: 0.42, len: 3.75, r: 0.08, evac: 0.56, evacLen: 0.75 }, mant: [0.43, 0.28],
  },
  camo: { type: 'solid', colors: ['#a89978'], rough: 0.64 },
});

T.push({
  id: 'leo2a7', name: 'Leopard 2A7V', cn: '“豹”2A7V', nation: 'de', nationName: '德国',
  blurb: '西欧主战坦克的标杆。L/55A1 长身管火炮穿深出色，箭簇形楔形装甲保护炮塔正面，但车体左前方的弹药架是出了名的弱点。',
  mass: 66.5, hp: 1500, vmax: 63, vrev: 31, hullTurn: 40, turretTurn: 40, elevRate: 24, depr: 9, elev: 20,
  reload: 6.0, autoloader: false, crewN: 4, layout: 'west4', aimTime: 1.6, disp: 0.95,
  gunName: 'Rh-120 L/55A1 120毫米滑膛炮',
  shells: [
    { type: 'ap', name: 'DM73', v: 1750, pen: 740 },
    { type: 'heat', name: 'DM12A1', v: 1140, pen: 480 },
    { type: 'he', name: 'DM11', v: 1100, pen: 40 },
  ],
  ammo: [24, 10, 8],
  armor: { ufp: [770, 900], lfp: [340, 420], hside: [75, 240], hrear: [35, 35], htop: [40, 40], hbot: [25, 25], tfront: [880, 1300], mant: [520, 680], tside: [260, 420], trear: [40, 60], ttop: [45, 45] },
  geo: {
    L: 7.7, W: 3.75, hullH: 1.72, belly: 0.5, glacisLen: 2.2, noseY: 1.2, lfpLen: 0.6, trackW: 0.635, trackH: 1.27, driverX: -0.62,
    turret: { z: 0.3, h: 0.78, prof: [[2.9, 0.2], [2.28, 1.3], [1.3, 1.44], [-0.75, 1.4], [-3.1, 1.32]], taper: [0.96, 0.94] },
    gun: { z: 1.6, y: 0.33, len: 5.15, r: 0.08, evac: 0.44, evacLen: 0.8 }, mant: [0.44, 0.3],
  },
  camo: { type: 'nato3', colors: ['#3e4b33', '#47372b', '#1c1d1b'], rough: 0.6 },
});

T.push({
  id: 'cr3', name: 'Challenger 3', cn: '“挑战者”3', nation: 'gb', nationName: '英国',
  blurb: '英国陆军的新一代主战坦克，换装德制 120 毫米滑膛炮与新型模块化装甲。皮糙肉厚、炮塔坚固，但 1200 马力拖着 66 吨，是全场最慢的一辆，备弹也只有 31 发。',
  mass: 66, hp: 1200, vmax: 59, vrev: 30, hullTurn: 30, turretTurn: 36, elevRate: 22, depr: 10, elev: 20,
  reload: 6.5, autoloader: false, crewN: 4, layout: 'west4', aimTime: 1.7, disp: 0.95,
  gunName: 'Rh-120 L/55A1 120毫米滑膛炮',
  shells: [
    { type: 'ap', name: 'DM73', v: 1750, pen: 740 },
    { type: 'heat', name: 'DM12A1', v: 1140, pen: 480 },
    { type: 'he', name: 'DM11', v: 1100, pen: 40 },
  ],
  ammo: [18, 7, 6],
  armor: { ufp: [800, 1050], lfp: [300, 480], hside: [80, 380], hrear: [40, 40], htop: [40, 40], hbot: [25, 25], tfront: [920, 1350], mant: [380, 500], tside: [320, 520], trear: [45, 60], ttop: [45, 45] },
  geo: {
    L: 8.1, W: 3.5, hullH: 1.5, belly: 0.5, glacisLen: 1.55, noseY: 1.02, lfpLen: 0.65, trackW: 0.65, trackH: 1.03,
    turret: { z: 0.05, h: 0.82, prof: [[2.4, 0.56], [1.9, 1.4], [0.9, 1.44], [-1.1, 1.44], [-2.45, 1.38]], taper: [0.96, 0.92] },
    gun: { z: 2.3, y: 0.32, len: 4.7, r: 0.08, evac: 0.46, evacLen: 0.8 }, mant: [0.45, 0.25],
  },
  camo: { type: 'solid', colors: ['#3f4736'], rough: 0.6 },
});

T.push({
  id: 'leclerc', name: 'Leclerc XLR', cn: '“勒克莱尔”XLR', nation: 'fr', nationName: '法国',
  blurb: '尾舱式自动装弹机让它拥有全场最快的射速，车体轻、功重比高。装甲在同代里偏薄，适合打了就跑的巷战节奏。',
  mass: 57.4, hp: 1500, vmax: 71, vrev: 38, hullTurn: 42, turretTurn: 40, elevRate: 24, depr: 8, elev: 15,
  reload: 5.0, autoloader: true, crewN: 3, layout: 'leclerc', aimTime: 1.6, disp: 1.0,
  gunName: 'CN120-26 120毫米滑膛炮',
  shells: [
    { type: 'ap', name: 'SHARD Mk.2', v: 1740, pen: 690 },
    { type: 'heat', name: 'OECC 120 F1', v: 1100, pen: 450 },
    { type: 'he', name: 'OE 120 F1', v: 1050, pen: 40 },
  ],
  ammo: [22, 10, 8],
  armor: { ufp: [720, 880], lfp: [300, 400], hside: [70, 300], hrear: [35, 35], htop: [35, 35], hbot: [25, 25], tfront: [720, 950], mant: [340, 430], tside: [240, 400], trear: [40, 50], ttop: [35, 35] },
  geo: {
    L: 7.0, W: 3.71, hullH: 1.55, belly: 0.48, glacisLen: 2.15, noseY: 1.06, lfpLen: 0.6, trackW: 0.635, trackH: 1.14, driverX: 0.62,
    turret: { z: 0.23, h: 0.88, prof: [[1.7, 0.62], [1.5, 1.42], [0.95, 1.64], [-1.6, 1.64], [-2.37, 1.06]], taper: [0.96, 0.92] },
    gun: { z: 1.6, y: 0.45, len: 4.45, r: 0.08 }, mant: [0.4, 0.26],
  },
  camo: { type: 'solid', colors: ['#675741'], rough: 0.62 },
});

for (const d of T) {
  d.modules = buildModules(d);
  d.pw = d.hp / d.mass;
  // 0-100 ratings for the garage bars
  d.rating = {
    fire: Math.round(Math.min(100, (d.shells[0].pen / 760) * 62 + (5 / d.reload) * 38)),
    armor: Math.round(Math.min(100, ((d.armor.tfront[0] + d.armor.ufp[0] + d.armor.lfp[0] * 1.2 + d.armor.mant[0]) / (920 + 850 + 780 + 520)) * 100)),
    mob: Math.round(Math.min(100, (d.pw / 27.3) * 55 + (d.vmax / 80) * 25 + (d.vrev / 40) * 20)),
  };
}
export const TANKS = T;
export const tankById = (id) => T.find((t) => t.id === id);
