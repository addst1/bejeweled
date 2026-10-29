'use strict';
/* Jewel Reboot v2 — 보석 매치-3 퍼즐 (독자 디자인, 캔버스 직접 렌더링)
 * 구성: [코어/세이브/모드/배지] [그리기 도구] [레이아웃] [이펙트/오디오] [게임 로직] [화면 렌더링] [입력/루프]
 */
(() => {
  const N = 8, NT = 6, HYPER = 6;
  const VERSION = '2.6.0', BUILD = '2026-10-29';   // 배포 시 sw.js 의 VERSION(캐시 이름)도 같이 올리세요
  const IDLE_HINT_SEC = 9;

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d', { alpha: false });

  // 동적 레이아웃 값 (applyLayout 에서 계산)
  let W = 0, H = 0, DPR = 1, CS = 40, GS = 37, BX = 0, BY = 0, U = 1;
  let L = { btns: [] };
  let lowQ = false;

  const rnd = n => Math.floor(Math.random() * n);
  const ease = p => p * p * (3 - 2 * p);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cx = c => BX + c * CS;
  const cy = r => BY + r * CS;
  const FONT = '"Trebuchet MS","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",Tahoma,sans-serif';

  // ───────────────────────── 세이브 ─────────────────────────
  const SAVE_KEY = 'jewel-reboot-save-v2';
  const defStats = () => ({ gems: 0, plays: 0, flame: 0, star: 0, hyper: 0, nova: 0, zenSec: 0, bf: 0, quest: 0, maxCombo: 0 });
  let save = (() => {
    const d = { best: {}, badges: {}, unlocked: {}, stats: defStats(), sound: true, coins: 300, boosters: { wand: 3, bomb: 3, burst: 5 }, crt: 1 };
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && typeof s === 'object') { Object.assign(d, s); d.stats = Object.assign(defStats(), s.stats || {}); }
    } catch (e) {}
    return d;
  })();
  let dirty = false;
  function persist() { dirty = false; try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
  const bestOf = id => save.best[id] || (save.best[id] = { score: 0, level: 0 });
  let sound = save.sound !== false;

  // ───────────────────────── 모드 / 배지 ─────────────────────────
  // lvl: 레벨 진행, spec: 특수 보석, dead: 막혔을 때(over 종료 / shuffle 섞기 / none), mult: 레벨 배율
  const MODES = [
    { id: 'classic', name: 'CLASSIC', hue: 245, desc: '수가 없으면 종료. 레벨을 올려라!', lvl: 1, spec: 1, dead: 'over', mult: 1 },
    { id: 'zen', name: 'ZEN', hue: 175, desc: '끝없는 평온. 막히면 자동 셔플', lvl: 1, spec: 1, dead: 'shuffle', mult: 0 },
    { id: 'lightning', name: 'SPRINT', hue: 205, desc: '60초 승부! 시계 보석으로 시간 연장', timer: 'lightning', spec: 1, dead: 'shuffle', mult: 0 },
    { id: 'action', name: 'ACTION', hue: 345, desc: '매치로 타이머를 채워 버텨라', timer: 'action', lvl: 1, spec: 1, dead: 'shuffle', mult: 1, noReset: 1 },
    { id: 'quest', name: 'QUEST', hue: 140, desc: '미션을 깨고 유물을 모아라 (목숨 3개)', quest: 1, spec: 1, dead: 'shuffle', mult: 0 },
    { id: 'twist', name: 'SWIRL', hue: 300, desc: '2×2 회전! 폭탄이 터지기 전에 해체', twist: 1, bombs: 1, lvl: 1, spec: 1, dead: 'none', mult: 1 },
    { id: 'endless', name: 'ENDLESS', hue: 225, desc: '종료 없음, 점수 배율 없음', lvl: 1, spec: 1, dead: 'shuffle', mult: 0, secret: 1,
      unlock: 'ZEN 3,000점', cond: () => bestOf('zen').score >= 3000 },
    { id: 'twilight', name: 'DRIFT', hue: 275, desc: '매 수마다 중력 방향이 바뀐다', gravity: 1, lvl: 1, spec: 1, dead: 'over', mult: 1, secret: 1,
      unlock: 'CLASSIC 레벨 5', cond: () => bestOf('classic').level >= 5 },
    { id: 'hyper', name: 'HYPER', hue: 355, desc: '더 빠르고 더 치열한 ACTION', timer: 'hyper', lvl: 1, spec: 1, dead: 'shuffle', mult: 1, noReset: 1, secret: 1,
      unlock: 'ACTION 레벨 4', cond: () => bestOf('action').level >= 4 },
    { id: 'bfly', name: 'FIREFLIES', hue: 120, desc: '거미가 닿기 전에 반딧불이를 매치하라', bfly: 1, lvl: 1, spec: 1, dead: 'shuffle', mult: 1, secret: 1,
      unlock: 'QUEST 미션 5 클리어', cond: () => bestOf('quest').level >= 5 },
    { id: 'original', name: 'ORIGINAL', hue: 235, desc: '특수 보석 없는 순수 클래식', lvl: 1, spec: 0, dead: 'over', mult: 1, secret: 1,
      unlock: '배지 5개 획득', cond: () => Object.keys(save.badges).length >= 5 }
  ];
  const modeById = id => MODES.find(m => m.id === id);
  const isUnlocked = m => !m.secret || !!save.unlocked[m.id];

  const BADGES = [
    { id: 'flame', name: 'Ember Maker', desc: 'Ember 보석 만들기' },
    { id: 'star', name: 'Beacon Maker', desc: 'Beacon 보석 만들기' },
    { id: 'hyper', name: 'Prism Master', desc: 'Prism 보석 만들기' },
    { id: 'nova', name: 'Aurora!', desc: '6개 이상 일렬 매치' },
    { id: 'combo5', name: 'Chain Reaction', desc: '5연쇄 달성' },
    { id: 'combo8', name: 'Cascade King', desc: '8연쇄 달성' },
    { id: 'big', name: 'High Roller', desc: '한 판에 5,000점' },
    { id: 'lightning', name: 'Sprinter', desc: 'SPRINT 1,500점' },
    { id: 'quest5', name: 'Adventurer', desc: 'QUEST 미션 5 클리어' },
    { id: 'quest10', name: 'Relic Hunter', desc: 'QUEST 미션 10 클리어' },
    { id: 'zen', name: 'Zen Master', desc: 'ZEN 5분 플레이' },
    { id: 'twist', name: 'Swirler', desc: 'SWIRL 1,500점' },
    { id: 'butterfly', name: 'Firefly Friend', desc: '반딧불이 20마리 구하기 (누적)' },
    { id: 'bigbang', name: 'Big Bang', desc: 'Prism 두 개를 맞바꾸기' },
    { id: 'level8', name: 'Veteran', desc: '레벨 8 도달' },
    { id: 'all', name: 'Completionist', desc: '모든 모드 해금' }
  ];

  // ───────────────────────── 팔레트 / 보석 스프라이트 ─────────────────────────
  // 6종 보석: 사파이어(쿠션) / 루비(스퀘어) / 에메랄드(옥타곤) / 자수정(페어) / 토파즈(라운드) / 다이아몬드(마퀴즈)
  const BASE = ['#2f6bff', '#ff2d4a', '#1fcf6a', '#a63cff', '#ffb81c', '#e4f1ff'];
  const GEM_NAMES = ['사파이어', '루비', '에메랄드', '자수정', '토파즈', '다이아'];
  const mixHex = (a, b, t) => {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    const f = s => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
    return '#' + [16, 8, 0].map(s => f(s).toString(16).padStart(2, '0')).join('');
  };
  const PAL = BASE.map(b => ({ b, d: mixHex(b, '#000010', .55), l: mixHex(b, '#ffffff', .62) }));

  const ring = (n, fx, fy) => Array.from({ length: n }, (_, i) => {
    const a = i / n * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(a) * fx, Math.sin(a) * fy];
  });
  const superEllipse = (n, r, p) => Array.from({ length: n }, (_, i) => {
    const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    return [Math.sign(c) * Math.pow(Math.abs(c), p) * r, Math.sign(s) * Math.pow(Math.abs(s), p) * r];
  });
  const cutRect = (hw, hh, cut) => [[-hw + cut, -hh], [hw - cut, -hh], [hw, -hh + cut], [hw, hh - cut], [hw - cut, hh], [-hw + cut, hh], [-hw, hh - cut], [-hw, -hh + cut]];
  const pear = n => Array.from({ length: n }, (_, i) => {
    const t = i / n * Math.PI * 2;
    return [Math.sin(t) * Math.pow(Math.abs(Math.sin(t / 2)), .72) * .98, -Math.cos(t) * .95];
  });
  const marquise = () => {
    const R = [], n = 9;
    for (let i = 0; i <= n; i++) { const u = -1 + 2 * i / n; R.push([.66 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 1.8)), .92), u * .98]); }
    const Lp = R.slice(1, -1).reverse().map(([x, y]) => [-x, y]);
    return R.concat(Lp);
  };
  // 외곽선, 테이블 비율(작을수록 크라운이 큼), 단계(스텝) 컷 여부
  const SHAPES = [
    () => ({ pts: superEllipse(24, .9, .68), k: .56, step: 0 }),
    () => ({ pts: cutRect(.88, .88, .26), k: .62, step: 1 }),
    () => ({ pts: cutRect(.8, .94, .3), k: .62, step: 1 }),
    () => ({ pts: pear(26), k: .54, step: 0 }),
    () => ({ pts: ring(16, .93, .93), k: .5, step: 0 }),
    () => ({ pts: marquise(), k: .5, step: 0 })
  ];

  function star4(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 - Math.PI / 2, rad = i % 2 ? r * .22 : r;
      g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    g.closePath();
  }

  let SPR = [], spriteKey = '';
  function makeSprite(t, bright) {
    const k = Math.max(1, DPR * 1.5);
    const px = Math.max(8, Math.round(GS * k));
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const g = cv.getContext('2d');
    g.scale(px / GS, px / GS);
    const img = (typeof GEM_IMGS !== 'undefined') && GEM_IMGS[t];
    if (img && img.complete && img.naturalWidth) {
      const sz = GS * .98, off = (GS - sz) / 2;
      g.save(); g.shadowColor = PAL[t].b; g.shadowBlur = GS * .07; g.shadowOffsetY = GS * .02;
      g.drawImage(img, off, off, sz, sz); g.restore();
      if (bright) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(0, 0, GS, GS); }
      return cv;
    }
    const w = GS / 52, c = GS / 2, R = GS / 2 - 2.2 * w;
    const pc = PAL[t], sh = SHAPES[t]();
    const P = sh.pts.map(([u, v]) => [c + u * R, c + v * R]);
    let mx = 0, my = 0;
    P.forEach(p => { mx += p[0]; my += p[1]; });
    mx /= P.length; my /= P.length;
    const lerp = (A, B, f) => [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
    const scaleP = f => P.map(p => [mx + (p[0] - mx) * f, my + (p[1] - my) * f]);
    const Q = scaleP(sh.k), M = sh.step ? scaleP((1 + sh.k) / 2) : null;
    const path = A => { g.beginPath(); A.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };
    const white = t === 5;
    const tint = (f, i) => {   // 다이아몬드는 면마다 프리즘 색을 살짝 섞는다
      if (!white) return f;
      return mixHex(f, ['#9db8ff', '#ffd4f4', '#b8fff0', '#fff2b8'][i % 4], .28);
    };
    const shade = (base, d, amp) => d > 0 ? mixHex(base, '#ffffff', Math.min(.85, d * amp)) : mixHex(base, '#00001a', Math.min(.8, -d * amp));

    // 바깥 광채 + 바닥
    g.save(); g.shadowColor = pc.b; g.shadowBlur = 6 * w; g.shadowOffsetY = 1.5 * w;
    path(P); g.fillStyle = pc.d; g.fill(); g.restore();
    let gr = g.createLinearGradient(mx - R, my - R, mx + R, my + R);
    gr.addColorStop(0, pc.l); gr.addColorStop(.5, pc.b); gr.addColorStop(1, pc.d);
    path(P); g.fillStyle = gr; g.fill();

    // 크라운 면 (사각형을 삼각형 둘로 나눠 서로 다른 밝기로 칠한다)
    const ringFacets = (A, B, amp, seed) => {
      for (let i = 0; i < A.length; i++) {
        const j = (i + 1) % A.length;
        const mxp = (A[i][0] + A[j][0] + B[i][0] + B[j][0]) / 4 - mx, myp = (A[i][1] + A[j][1] + B[i][1] + B[j][1]) / 4 - my;
        const len = Math.hypot(mxp, myp) || 1, d = (-mxp - myp) / len * .7071;
        const tri = [[A[i], A[j], B[j]], [A[i], B[j], B[i]]];
        tri.forEach((T, q) => {
          const jit = (((i * 7 + q * 3 + seed) % 5) - 2) * .07;
          g.beginPath(); g.moveTo(T[0][0], T[0][1]); g.lineTo(T[1][0], T[1][1]); g.lineTo(T[2][0], T[2][1]); g.closePath();
          g.fillStyle = shade(tint(pc.b, i + q), (q ? d * .55 + .12 : d) + jit, amp);
          g.fill();
          g.strokeStyle = 'rgba(0,0,30,.28)'; g.lineWidth = .55 * w; g.stroke();
        });
      }
    };
    if (M) { ringFacets(P, M, 1.1, 0); ringFacets(M, Q, 1.25, 2); } else ringFacets(P, Q, 1.15, 1);

    // 테이블(윗면)
    gr = g.createLinearGradient(mx - R * .55, my - R * .6, mx + R * .5, my + R * .55);
    gr.addColorStop(0, mixHex(pc.b, '#ffffff', white ? .7 : .55)); gr.addColorStop(.55, pc.b); gr.addColorStop(1, mixHex(pc.b, '#00001a', .35));
    path(Q); g.fillStyle = gr; g.fill();
    g.save(); path(Q); g.clip();
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = .7 * w;
    for (let i = 0; i < Q.length; i += (Q.length > 10 ? 3 : 2)) { g.beginPath(); g.moveTo(mx, my); g.lineTo(Q[i][0], Q[i][1]); g.stroke(); }
    g.strokeStyle = 'rgba(0,0,40,.18)';
    for (let i = 1; i < Q.length; i += (Q.length > 10 ? 3 : 2)) { g.beginPath(); g.moveTo(mx, my); g.lineTo(Q[i][0], Q[i][1]); g.stroke(); }
    const rg = g.createRadialGradient(mx - R * .15, my - R * .2, 0, mx, my, R * .55);
    rg.addColorStop(0, 'rgba(255,255,255,.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, GS, GS);
    g.restore();
    path(Q); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = .9 * w; g.stroke();

    // 테두리
    path(P); g.lineWidth = 1.7 * w; g.strokeStyle = mixHex(pc.d, '#000010', .5); g.stroke();
    path(P); g.lineWidth = .8 * w; g.strokeStyle = 'rgba(255,255,255,.4)'; g.stroke();

    // 반짝임 (왼쪽 위 하이라이트 + 별빛)
    g.save(); g.translate(mx - R * .34, my - R * .4); g.rotate(-.7);
    g.fillStyle = 'rgba(255,255,255,.95)';
    g.beginPath(); g.ellipse(0, 0, R * .2, R * .075, 0, 0, Math.PI * 2); g.fill(); g.restore();
    g.fillStyle = 'rgba(255,255,255,.95)'; star4(g, mx + R * .32, my + R * .36, R * .22); g.fill();
    g.fillStyle = 'rgba(255,255,255,.75)'; star4(g, mx - R * .1, my - R * .66, R * .11); g.fill();

    if (bright) {
      g.save(); path(P); g.clip();
      g.fillStyle = 'rgba(255,255,255,.62)'; g.fillRect(0, 0, GS, GS); g.restore();
    }
    return cv;
  }
  function buildSprites() {
    const key = GS + '|' + DPR + '|' + GEM_IMGS.filter(i => i.complete && i.naturalWidth).length;
    if (key === spriteKey) return;
    spriteKey = key;
    SPR = [];
    for (let t = 0; t < NT; t++) SPR.push([makeSprite(t, false), makeSprite(t, true)]);
  }

  // ───────────────────────── 그리기 도구 ─────────────────────────
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
  function gold(y, size) {
    const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, '#fff7b8'); g.addColorStop(.5, '#ffd23c'); g.addColorStop(1, '#d9860c');
    return g;
  }
  function txt(s, x, y, o) {
    o = o || {};
    const size = o.size || 16;
    ctx.font = (o.weight || 'bold') + ' ' + Math.round(size) + 'px ' + (o.font || FONT);
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (o.stroke) { ctx.lineWidth = o.stroke.w; ctx.strokeStyle = o.stroke.c; ctx.strokeText(s, x, y); }
    if (o.shadow !== false) { const so = Math.max(1, size * .06); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(s, x + so, y + so * 1.3); }
    ctx.fillStyle = o.color || '#fff';
    ctx.fillText(s, x, y);
  }
  function fitSize(str, maxW, size, weight) {
    ctx.font = (weight || 'bold') + ' ' + Math.round(size) + 'px ' + FONT;
    while (size > 8 && ctx.measureText(str).width > maxW) { size -= 1; ctx.font = (weight || 'bold') + ' ' + Math.round(size) + 'px ' + FONT; }
    return size;
  }
  function wrapLines(str, maxW, size, weight) {
    ctx.font = (weight || 'bold') + ' ' + Math.round(size) + 'px ' + FONT;
    const lines = []; let cur = '';
    for (const ch of str) {
      if (ch === '\n') { lines.push(cur); cur = ''; continue; }
      const t = cur + ch;
      if (cur && ctx.measureText(t).width > maxW) { lines.push(cur.trimEnd()); cur = ch === ' ' ? '' : ch; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function glassPanel(x, y, w, h, hue) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(46,40,120,.86)'); g.addColorStop(1, 'rgba(14,14,52,.92)');
    const col = hue ? 'hsl(' + hue + ',75%,70%)' : '#a99cff';
    ctx.save();
    ctx.shadowColor = hue ? 'hsla(' + hue + ',90%,65%,.55)' : 'rgba(150,120,255,.6)'; ctx.shadowBlur = lowQ ? 0 : 12 * U;
    rr(ctx, x, y, w, h, 12 * U); ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1.8; ctx.strokeStyle = col; rr(ctx, x, y, w, h, 12 * U); ctx.stroke();
    rr(ctx, x + 3, y + 3, w - 6, h / 2 - 3, 9 * U); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill();
  }
  function glossBtn(x, y, w, h, pressed, hue, glowA) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (pressed) { g.addColorStop(0, hue[2]); g.addColorStop(1, hue[1]); }
    else { g.addColorStop(0, hue[0]); g.addColorStop(1, hue[2]); }
    if (glowA) { ctx.save(); ctx.shadowColor = hue[0]; ctx.shadowBlur = 16 * U * glowA; rr(ctx, x, y, w, h, 10 * U); ctx.fillStyle = hue[2]; ctx.fill(); ctx.restore(); }
    rr(ctx, x, y + (pressed ? 1 : 0), w, h, 10 * U); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke();
    rr(ctx, x + 3, y + 3 + (pressed ? 1 : 0), w - 6, h / 2 - 2, 7 * U);
    ctx.fillStyle = pressed ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.3)'; ctx.fill();
  }
  const HUE_BLUE = ['#6fb0ff', '#1b4fb0', '#2a74e0'];
  const HUE_GOLD = ['#ffd96a', '#a8680c', '#e09a1c'];
  const HUE_GREEN = ['#7fe49a', '#1c7a3a', '#2aae52'];
  const HUE_RED = ['#ff8a8a', '#a01818', '#e03030'];
  function heart(x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, s * .35);
    ctx.bezierCurveTo(-s * .9, -s * .2, -s * .5, -s * .9, 0, -s * .4);
    ctx.bezierCurveTo(s * .5, -s * .9, s * .9, -s * .2, 0, s * .35);
    ctx.fill(); ctx.restore();
  }
  function lockIcon(x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, s * .16);
    rr(ctx, -s * .5, -s * .1, s, s * .75, s * .12); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -s * .1, s * .32, Math.PI, 0); ctx.stroke(); ctx.restore();
  }
  // 보석 아트 (사용자 제작 시안에서 추출한 이미지). 로드 전에는 아래 절차적 보석을 임시로 그린다.
  const GEM_SRC = [
    'data:image/png;base64,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',
    'data:image/png;base64,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',
    'data:image/png;base64,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',
    'data:image/png;base64,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',
    'data:image/png;base64,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',
    'data:image/png;base64,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'
  ];
  const GEM_IMGS = GEM_SRC.map(src => { const im = new Image(); im.onload = () => { spriteKey = ''; if (typeof W !== 'undefined' && W) buildSprites(); }; im.src = src; return im; });
  // 자동 생성: tools/make_ui_js.py — 시안에서 글자를 지워 낸 UI 조각 (WebP, 투명 배경)
  const UI_SRC = {"plaque": "data:image/webp;base64,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", "coinchip": "data:image/webp;base64,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", "prog": "data:image/webp;base64,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", "progfill": "data:image/webp;base64,UklGRuACAABXRUJQVlA4INQCAACQGACdASrIAFIAPjEWikOiISET6G1sIAMEsrcFf973QuLCNEiBTLLn2A17/kR+N3qGq7+Vv/Hh/3ytsXt/6rZW/wAt6LYAbS8xQySFtxdSgQZQHlYD9tm+IjUarrHh9R4RI4UBhyr0U/9Ze2aBT0HNai0PxeGhLCpXXjtXuuL++0fmT6W6fEbxnuXLNq/9d1IpUP+nDjz/ZlMh0BPN2qYoefWSoBz5P3o+lOcmLjAINmWmMn//mzsbmWiFHXql5nISIlq7f6EmulTwlPQAAP5Pv/sgue36M1Qwv/YOYESXtz/9Xo3gJ1FpTtPqHk//t783v6RIXsze/pEhepsP2NjERM2EYZDKfH0jWKzCmx1PrMQNQywYsTIvsnxJMw9PN2krrl6ndAIOnQPhagonj1mSexVGVM+juNspmpCdrywBeWDxTMEaT09HTr8+IAOcCYja1k6ZCmp6H8qPQTv5CVKmaxVT7433Rp8zZ/2sJYTlPV3R1fE2zHbhIab6WTd+b+3izSULPXv4J2BIl6Vr9swP7hRRTi9/QfRM/RBT5GpJcK3HoH/gPY0N97m9J1QWj7rJptNWMMcIMnlsQhMhkBfX36dfXZ2uxlJt7Mt56CPDxplDu2px/0+ZY5Mx7bYmhw1cJN52bM0thUBjR8JctEg2ZWNkSPl1+qUyMc3YgNAlzKr7Esn+G3u/Y1aXymNjx4n1xlH9fj1oiHw5sqBOCgwN8W6UJrKpn0pMMVrYoDZKuttDmk4P3iMJKGfeZBlMm4DFtnCwzc6XlHXL1oxTu1GvyvbMJhDf18EjM0iHjjwzJXjmrD7vL0HA/C80FE3zR6WyslHENaPvJNiAjK4D5BoDXlTKS47sIi2BhFjRnHFZn7C69HsSap7iuWFdNIkEjTvq9Q0JKWTVVIn/wqcHWYYbMTzC/2F96G3PUC2W7Ze3o7P/9YLHvGEmzTlFNRuwnWOwH3IA", "panel": "data:image/webp;base64,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", "trophy": "data:image/webp;base64,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", "shop": "data:image/webp;base64,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", "arrows": "data:image/webp;base64,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"};
  const UI_META = {"plaque": [700, 177], "coinchip": [540, 188], "prog": [1500, 164], "progfill": [200, 82], "panel": [520, 1403], "trophy": [136, 128], "shop": [131, 128], "arrows": [146, 128]};
  const UI = {};
  for (const k in UI_SRC) { const im = new Image(); im.src = UI_SRC[k]; UI[k] = im; }
  const uiOk = k => { const im = UI[k]; return im && im.complete && im.naturalWidth ? im : null; };
  // 진행 바 채움 색 변형 (한 번만 만든다): 0 기본, 1 타이머(청록), 2 퀘스트(금색), 3 위험(빨강) — 밝기 → 색 램프로 다시 칠한다
  const FILL_VAR = [];
  const FILL_RAMPS = [null, ['#0a5a8a', '#17b4e6', '#a6f4ff'], ['#8a5006', '#f0b020', '#fff0a0'], ['#8a1008', '#ff3a2a', '#ffc0b0']];
  function buildFillVars() {
    const im = UI.progfill, w = im.naturalWidth, h = im.naturalHeight;
    const base = document.createElement('canvas'); base.width = w; base.height = h; base.getContext('2d').drawImage(im, 0, 0);
    FILL_VAR[0] = base;
    const src = base.getContext('2d').getImageData(0, 0, w, h);
    const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    for (let v = 1; v < FILL_RAMPS.length; v++) {
      const [d, m, l] = FILL_RAMPS[v].map(hex), c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'), out = g.createImageData(w, h);
      for (let i = 0; i < src.data.length; i += 4) {
        const L = .3 * src.data[i] + .59 * src.data[i + 1] + .11 * src.data[i + 2], t = Math.max(0, Math.min(1, (L - 70) / 140));
        const a = t < .5 ? d : m, b = t < .5 ? m : l, u = t < .5 ? t * 2 : (t - .5) * 2;
        out.data[i] = a[0] + (b[0] - a[0]) * u; out.data[i + 1] = a[1] + (b[1] - a[1]) * u; out.data[i + 2] = a[2] + (b[2] - a[2]) * u; out.data[i + 3] = src.data[i + 3];
      }
      g.putImageData(out, 0, 0); FILL_VAR[v] = c;
    }
  }
  UI.progfill.addEventListener('load', buildFillVars);
  if (UI.progfill.complete && UI.progfill.naturalWidth) buildFillVars();

  // ───────────────────────── 공유 상태 ─────────────────────────
  let grid = [];                       // grid[r][c] = 보석 객체
  let G = null;                        // 현재 게임 상태 (메뉴에서는 null)
  let screen = 'menu';                 // menu | game | badges | records | help
  let dlg = null;                      // 모달 대화상자
  let sel = null, hintMove = null, idle = 0, twistSel = null, armed = null, menuPage = 'main';
  const parts = [], rings = [], bolts = [], beams = [], flashes = [], popups = [], conf = [], glints = [], toasts = [];
  const motes = Array.from({ length: 34 }, () => ({ x: Math.random() * 400, y: Math.random() * 800, r: Math.random() * 1.8 + .8, sp: Math.random() * .25 + .08, ph: Math.random() * 6 }));
  let praise = null, shake = null, flashT = 0, punch = 0, energy = 0;
  const uiButtons = [];
  let pressBtn = null, down = null;

  // ───────────────────────── 레이아웃 (게임 화면) ─────────────────────────
  function computeLayout() {
    const land = W > H * 1.15;
    const verH = 16;   // 맨 아래 버전 표시 줄
    L = { land, btns: [], boost: [] };

    if (!land) {
      const m = Math.round(clamp(W * .035, 8, 16));
      const g0 = Math.round(clamp(Math.min(W, H) * .014, 5, 10));
      const topH = Math.round(clamp(H * .058, 38, 52));
      const progH = Math.round(clamp(H * .04, 28, 40));
      const scoreH = Math.round(clamp(H * .095, 50, 92));
      const chipH = Math.round(clamp(H * .036, 24, 32));
      const bD = Math.round(clamp(Math.min(W * .17, H * .085), 44, 68));
      const bLab = 14;
      const navH = Math.round(clamp(H * .07, 50, 66));
      const base = topH + progH + scoreH + chipH + bLab + bD;
      const csOf = (fx, gaps) => Math.floor(Math.min((W - 2 * m) / N, (H - 2 * m - verH - fx - g0 * gaps) / N));
      const useNav = csOf(base + navH, 7) >= csOf(base, 6) * .97 && csOf(base + navH, 7) >= 28;
      const fixed = base + (useNav ? navH : 0), nG = useNav ? 7 : 6;
      CS = Math.max(20, csOf(fixed, nG));
      const bw = CS * N;
      const free = Math.max(0, H - 2 * m - verH - fixed - bw - g0 * nG);
      const g = g0 + Math.min(12, Math.floor(free / (nG + 3)));
      const rest = Math.max(0, free - (g - g0) * nG);
      let y = m + Math.round(rest * .4);
      BX = Math.round((W - bw) / 2);
      const cw = Math.round(clamp(bw * .27, 76, 120)), pw = Math.round(Math.min(bw * .42, 180));
      L.top = {
        gear: { x: BX, y, d: topH },
        plaque: { x: BX + Math.round((bw - pw) / 2), y: y + Math.round(topH * .05), w: pw, h: Math.round(topH * .9) },
        coin: { x: BX + bw - cw, y: y + Math.round(topH * .11), w: cw, h: Math.round(topH * .78) }
      };
      y += topH + g;
      L.prog = { x: BX, y, w: bw, h: progH }; y += progH + g;
      L.score = { x: BX, y, w: bw, h: scoreH }; y += scoreH + g;
      L.chips = { x: BX, y, w: bw, h: chipH }; y += chipH + g;
      BY = y; y += bw + g;
      L.boostLabel = { x: BX, y, w: bw, h: bLab }; y += bLab + Math.round(g * .5);
      for (let i = 0; i < 4; i++) { const cxp = BX + bw * (i + .5) / 4; L.boost.push({ x: Math.round(cxp - bD / 2), y, d: bD }); }
      if (useNav) { L.nav = { x: BX, y: y + bD + Math.round(g * .9), w: bw, h: navH }; }
      L.ver = { x: Math.round(W / 2) - 60, y: H - verH, w: 120, h: verH };
    } else {
      // 가로: 보드는 오른쪽, 왼쪽에 장식 패널(점수/정보/목표) + 부스터
      const mm = 4, cgap = Math.round(clamp(W * .012, 6, 14)), colMin = 200;
      CS = Math.max(20, Math.floor(Math.min((H - 2 * mm) / N, (W - 2 * mm - colMin - cgap) / N)));
      const bw = CS * N;
      BX = W - mm - bw; BY = Math.round((H - bw) / 2);
      const areaW = BX - cgap - mm, colW = Math.min(areaW, 330);
      const colX = mm + Math.round((areaW - colW) / 2);
      let f = clamp((H - 2 * mm) / 350, .55, 1.2);
      const S = { g: Math.round(5 * f), top: Math.round(34 * f), prog: Math.round(30 * f) };
      let y = mm;
      const cw = Math.round(clamp(colW * .3, 70, 104));
      L.top = {
        gear: { x: colX, y, d: S.top },
        plaque: { x: colX + S.top + S.g, y, w: colW - S.top - cw - S.g * 2, h: S.top },
        coin: { x: colX + colW - cw, y: y + Math.round(S.top * .08), w: cw, h: Math.round(S.top * .84) }
      };
      y += S.top + S.g;
      L.prog = { x: colX, y, w: colW, h: S.prog }; y += S.prog + S.g;
      // 장식 패널(시안 이미지): 폭 520 : 높이 1403 비율을 기준으로, 가운데(목표 영역)만 세로로 늘린다
      const Hp = H - mm - y - verH;
      let ps = Hp / 1063;                              // 최소 높이(위 560 + 아래 173 + 목표 330)에 맞춘 배율
      ps = Math.min(ps, colW * .6 / 520);
      const pw = Math.round(520 * ps), ph = Math.round(Math.min(Hp, 1500 * ps));
      L.panel = { x: colX, y, w: pw, h: ph, s: ps };
      L.score = { x: colX, y: y + 40 * ps, w: pw, h: 210 * ps };
      L.main = { x: colX, y: y + 255 * ps, w: pw, h: 200 * ps };
      L.goals = { x: colX, y: y + 460 * ps, w: pw, h: ph - 460 * ps };
      // 부스터: 패널 오른쪽에 세로로 쌓는다
      const bx0 = colX + pw + S.g * 2, bAvail = colX + colW - bx0;
      const bD = Math.max(30, Math.min(64, Math.floor(bAvail), Math.floor((ph - S.g * 3) / 4)));
      const bgap = Math.min(S.g * 2, Math.floor((ph - bD * 4) / 3));
      const bTot = bD * 4 + bgap * 3, by0 = y + Math.max(0, Math.round((ph - bTot) / 2));
      for (let i = 0; i < 4; i++) L.boost.push({ x: Math.round(bx0 + (bAvail - bD) / 2), y: by0 + i * (bD + bgap), d: bD });
      y += ph + S.g;
      L.ver = { x: colX, y, w: colW, h: verH };
    }
    GS = Math.max(16, Math.round(CS * .95));
    U = Math.max(.55, CS / 56);
  }

  // ───────────────────────── 레이아웃 (메뉴 / 보조 화면) ─────────────────────────
  let ML = null, SL = null;
  const MAIN_IDS = ['classic', 'zen', 'quest'];
  function computeMenuLayout() {
    const land = W > H * 1.15;
    const m = Math.round(clamp(W * .04, 10, 24));
    const gap = Math.round(clamp(Math.min(W, H) * .016, 6, 12));
    const verH = 16;
    const navH = Math.round(clamp(Math.min(W, H) * .15, 52, 70));
    const navY = H - Math.round(m * .4) - verH - navH;
    const top = Math.round(m * .5);
    const bodyH = navY - gap - top, areaW = W - 2 * m;
    ML = { land, m, gap, nav: { x: m, y: navY, w: areaW, h: navH }, ver: { x: Math.round(W / 2) - 70, y: H - verH - Math.round(m * .3), w: 140, h: verH } };
    if (!land) {
      const logoH = Math.round(clamp(bodyH * .38, 120, 360));
      ML.logo = { x: m, y: top, w: areaW, h: logoH };
      const avail = bodyH - logoH - gap;
      const bh = Math.round(clamp((avail - gap * 3) / 3.8, 50, 108));
      const total = bh * 3.8 + gap * 3, y0 = top + logoH + gap + Math.max(0, Math.round((avail - total) / 2));
      ML.main = [0, 1, 2].map(i => ({ x: m, y: Math.round(y0 + i * (bh + gap)), w: areaW, h: bh }));
      ML.more = { x: m, y: Math.round(y0 + 3 * (bh + gap)), w: areaW, h: Math.round(bh * .8) };
    } else {
      const leftW = Math.round(areaW * .44), rx = m + leftW + gap * 2, rw = areaW - leftW - gap * 2;
      ML.logo = { x: m, y: top, w: leftW, h: bodyH };
      const bh = Math.floor((bodyH - gap * 3) / 3.8);
      ML.main = [0, 1, 2].map(i => ({ x: rx, y: top + i * (bh + gap), w: rw, h: bh }));
      ML.more = { x: rx, y: top + 3 * (bh + gap), w: rw, h: Math.floor(bh * .8) };
    }
    // 서브 화면(More Modes / Badges / Records / Help)
    const titleH = Math.round(land ? clamp(H * .15, 32, 54) : clamp(H * .075, 44, 70));
    const areaY = top + titleH + gap, areaH = navY - gap - areaY;
    SL = { title: { x: m, y: top, w: areaW, h: titleH }, area: { x: m, y: areaY, w: areaW, h: areaH }, back: { x: Math.round((W - Math.min(240, areaW)) / 2), y: navY + Math.round(navH * .08), w: Math.min(240, areaW), h: Math.round(navH * .84) }, gap, m };
    const others = MODES.filter(x => MAIN_IDS.indexOf(x.id) < 0), n = others.length;
    let best = null;
    for (let cols = 2; cols <= 4; cols++) {
      const rows = Math.ceil(n / cols);
      const cw = (areaW - gap * (cols - 1)) / cols, ch = Math.min((areaH - gap * (rows - 1)) / rows, 120);
      const sc = Math.min(cw / 2.3, ch);
      if (!best || sc > best.sc) best = { cols, rows, cw: Math.floor(cw), ch: Math.floor(ch), sc };
    }
    const bw = best.cols * best.cw + (best.cols - 1) * gap, bx = Math.round((W - bw) / 2), bhh = best.rows * best.ch + (best.rows - 1) * gap, by = areaY + Math.max(0, Math.round((areaH - bhh) / 2));
    ML.moreCards = others.map((md, i) => {
      const row = Math.floor(i / best.cols), col = i % best.cols;
      const inRow = Math.min(best.cols, n - row * best.cols);
      const off = row === best.rows - 1 ? (best.cols - inRow) * (best.cw + gap) / 2 : 0;
      return { id: md.id, x: Math.round(bx + col * (best.cw + gap) + off), y: by + row * (best.ch + gap), w: best.cw, h: best.ch };
    });
  }

  // ───────────────────────── 배경 ─────────────────────────
  const bgCache = { key: '', cv: null };
  function curHue() { return screen === 'game' && G ? (G.cfg.hue + (G.level - 1) * 12) % 360 : 265; }
  function buildBg(hue, withBoard) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    const b = cv.getContext('2d');
    b.scale(DPR, DPR);
    const grd = b.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#0a0c2c'); grd.addColorStop(.5, 'hsl(' + hue + ',48%,12%)'); grd.addColorStop(1, '#05061a');
    b.fillStyle = grd; b.fillRect(0, 0, W, H);
    const neb = (x, y, r, h, a) => {
      const rg = b.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'hsla(' + h + ',90%,58%,' + a + ')'); rg.addColorStop(1, 'hsla(' + h + ',90%,50%,0)');
      b.fillStyle = rg; b.fillRect(0, 0, W, H);
    };
    const R_ = Math.max(W, H);
    neb(W * .25, H * .22, R_ * .7, hue + 30, .25); neb(W * .82, H * .72, R_ * .75, hue - 45, .2); neb(W * .5, H * .5, R_ * .5, hue, .1);
    // 별 + 별자리
    let s = 12345;
    const rs = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 150; i++) {
      b.globalAlpha = .2 + rs() * .65; b.fillStyle = '#dfe6ff';
      b.beginPath(); b.arc(rs() * W, rs() * H, .5 + rs() * 1.1, 0, Math.PI * 2); b.fill();
    }
    b.globalAlpha = .2; b.strokeStyle = '#b8c4ff'; b.lineWidth = 1; b.fillStyle = '#e6ecff';
    for (let k = 0; k < 4; k++) {
      let x = rs() * W, y = rs() * H; const pts = [[x, y]];
      for (let i = 0; i < 5; i++) { x += (rs() - .35) * W * .18; y += (rs() - .5) * H * .1; pts.push([x, y]); }
      b.beginPath(); pts.forEach((p, i) => i ? b.lineTo(p[0], p[1]) : b.moveTo(p[0], p[1])); b.stroke();
      pts.forEach(p => { b.beginPath(); b.arc(p[0], p[1], 2, 0, Math.PI * 2); b.fill(); });
    }
    b.globalAlpha = 1;
    if (withBoard) {
      const bw = CS * N, rad = 14 * U;
      b.save();
      b.shadowColor = 'hsla(' + (hue + 40) + ',100%,68%,.7)'; b.shadowBlur = 28 * U;
      rr(b, BX - 2, BY - 2, bw + 4, bw + 4, rad); b.fillStyle = 'rgba(8,9,34,.92)'; b.fill();
      b.restore();
      b.save(); rr(b, BX, BY, bw, bw, rad); b.clip();
      b.fillStyle = 'rgba(16,18,58,.88)'; b.fillRect(BX, BY, bw, bw);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const x = cx(c), y = cy(r), ins = Math.max(1, CS * .035);
        rr(b, x + ins, y + ins, CS - ins * 2, CS - ins * 2, 6 * U);
        b.fillStyle = (r + c) & 1 ? 'rgba(130,120,255,.11)' : 'rgba(100,110,255,.06)'; b.fill();
        b.lineWidth = 1; b.strokeStyle = 'rgba(170,165,255,.13)'; b.stroke();
      }
      b.restore();
      const bgd = b.createLinearGradient(BX, BY, BX + bw, BY + bw);
      bgd.addColorStop(0, '#9a72ff'); bgd.addColorStop(.5, '#ff6fd8'); bgd.addColorStop(1, '#6fb4ff');
      b.save(); b.shadowColor = 'rgba(190,120,255,.9)'; b.shadowBlur = 14 * U;
      rr(b, BX, BY, bw, bw, rad); b.lineWidth = Math.max(2, 3 * U); b.strokeStyle = bgd; b.stroke(); b.restore();
      rr(b, BX + 2.5 * U, BY + 2.5 * U, bw - 5 * U, bw - 5 * U, rad - 2); b.lineWidth = 1; b.strokeStyle = 'rgba(255,255,255,.2)'; b.stroke();
    }
    return cv;
  }
  function ensureBg() {
    const game = screen === 'game' && G;
    const hue = curHue();
    const key = (game ? 'g' : 'm') + hue + '|' + W + 'x' + H + '|' + DPR + '|' + CS;
    if (bgCache.key !== key) { bgCache.key = key; bgCache.cv = buildBg(hue, !!game); }
  }

  // CRT 오버레이: 스캔라인 + 비네트 (해상도/강도 변경 때만 다시 만든다). save.crt: 0 끔 / 1 약하게 / 2 강하게
  let crt = null;
  function buildCrt() {
    crt = null;
    if (!save.crt) return;
    crt = document.createElement('canvas');
    crt.width = canvas.width; crt.height = canvas.height;
    const strong = save.crt === 2;
    const g = crt.getContext('2d'), w = crt.width, h = crt.height;
    const period = Math.max(3, Math.round(DPR * 3)), th = Math.max(1, Math.round(period / 2.2));
    g.fillStyle = 'rgba(0,0,0,' + (strong ? .24 : .08) + ')';
    for (let y = 0; y < h; y += period) g.fillRect(0, y, w, th);
    const rg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .35, w / 2, h / 2, Math.max(w, h) * .78);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,' + (strong ? .5 : .28) + ')');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  }
  function setCrt(v) { save.crt = v; dirty = true; buildCrt(); }
  function drawCrt(now) {
    if (!crt) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(crt, 0, 0);
    if (save.crt !== 2) return;
    const ch = canvas.height;
    if (!lowQ) {
      const by = (((now / 6500) % 1.4) - .2) * ch, bh = ch * .22;
      const lg = ctx.createLinearGradient(0, by, 0, by + bh);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.5, 'rgba(255,255,255,.05)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, by, canvas.width, bh);
    }
    ctx.fillStyle = 'rgba(255,255,255,' + (.012 + .012 * Math.sin(now / 37)) + ')';
    ctx.fillRect(0, 0, canvas.width, ch);
  }

  function applyLayout() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(200, Math.floor(rect.width)), h = Math.max(260, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (w === W && h === H && dpr === DPR) return;
    W = w; H = h; DPR = dpr;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    computeLayout();
    computeMenuLayout();
    buildSprites();
    buildCrt();
    bgCache.key = '';
    for (let r = 0; r < grid.length; r++) for (let c = 0; c < N; c++) {
      const o = grid[r] && grid[r][c];
      if (o && o.x !== undefined) { o.x = cx(c); o.y = cy(r); o.vx = o.vy = o.v = 0; }
    }
    parts.length = rings.length = bolts.length = beams.length = flashes.length = popups.length = conf.length = glints.length = 0;
    for (const m of motes) { m.x = Math.random() * W; m.y = Math.random() * H; }
  }

  // ───────────────────────── 이펙트 ─────────────────────────
  const q = () => lowQ ? .5 : 1;
  const FWCOL = ['#ffd23c', '#ff6ad5', '#6ad7ff', '#ffffff', '#9dff6a', '#ff9a3c'];

  function shatter(x, y, color, n) {
    const cnt = Math.max(2, Math.round((n || 6) * q()));
    for (let i = 0; i < cnt; i++) {
      parts.push({ k: 's', x, y, vx: (Math.random() - .5) * 8 * U, vy: (Math.random() - .85) * 7 * U, life: 1, dec: .014 + Math.random() * .012,
        col: color, size: (5 + Math.random() * 7) * U, rot: Math.random() * 6, vr: (Math.random() - .5) * .5, grav: .36 * U });
    }
    const sp = Math.max(2, Math.round(7 * q()));
    for (let i = 0; i < sp; i++) {
      const a = Math.random() * Math.PI * 2, v = (1.5 + Math.random() * 5) * U;
      parts.push({ k: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - U, life: 1, dec: .02 + Math.random() * .02,
        col: Math.random() < .4 ? '#ffffff' : color, size: (2.5 + Math.random() * 4) * U, rot: Math.random() * 3, vr: .1, grav: .1 * U });
    }
  }
  function sparksAt(x, y, color, n, speed) {
    const cnt = Math.round((n || 10) * q());
    for (let i = 0; i < cnt; i++) {
      const a = Math.random() * Math.PI * 2, v = (speed || 4) * (.3 + Math.random()) * U;
      parts.push({ k: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, dec: .014 + Math.random() * .016,
        col: color, size: (2.5 + Math.random() * 4) * U, rot: Math.random() * 3, vr: .12, grav: .05 * U });
    }
  }
  function embers(x, y, n) {
    const cnt = Math.round((n || 14) * q());
    for (let i = 0; i < cnt; i++) {
      const a = Math.random() * Math.PI * 2, v = (1 + Math.random() * 4.5) * U;
      parts.push({ k: 'e', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5 * U, life: 1, dec: .012 + Math.random() * .012,
        col: Math.random() < .5 ? '#ff9a2a' : '#ffd23c', size: (2.5 + Math.random() * 5) * U, rot: 0, vr: 0, grav: -.04 * U });
    }
  }
  function addRing(x, y, col, r0, speed, w) { rings.push({ x, y, r: (r0 || 6) * U, v: (speed || 2.6) * U, life: 1, col, w: w || 1 }); }
  function addFlash(x, y, r, col, life) { flashes.push({ x, y, r, life: 1, dec: 1 / (life || 24), col: col || '255,244,200' }); }
  function addBeam(horiz, idx, col) { beams.push({ horiz, idx, life: 1, col: col || '255,246,200' }); }
  function boltPts(x1, y1, x2, y2, amp) {
    const pts = [], segs = Math.max(5, Math.round(Math.hypot(x2 - x1, y2 - y1) / (CS * .5)));
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, off = (i === 0 || i === segs) ? 0 : (Math.random() - .5) * amp;
      pts.push([x1 + dx * t + nx * off, y1 + dy * t + ny * off]);
    }
    return pts;
  }
  function addBolt(x1, y1, x2, y2, col, life, w) {
    const amp = CS * .6;
    bolts.push({ x1, y1, x2, y2, amp, life: 1, dec: 1 / (life || 20), col: col || '120,200,255', w: w || 1, pts: boltPts(x1, y1, x2, y2, amp), tk: 0 });
  }
  function firework(x, y) {
    const cnt = Math.round(34 * q());
    for (let i = 0; i < cnt; i++) {
      const a = Math.random() * Math.PI * 2, sp = (2 + Math.random() * 5.5) * U;
      parts.push({ k: 'p', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, dec: .011 + Math.random() * .008,
        col: FWCOL[rnd(FWCOL.length)], size: (3 + Math.random() * 4) * U, rot: Math.random() * 3, vr: .1, grav: .07 * U });
    }
    addRing(x, y, '#ffe680', 8, 3.2);
    addFlash(x, y, CS * 2, '255,230,150', 18);
  }
  function confettiRain(n) {
    const cols = ['#ff4d6d', '#ffd23c', '#4dd2ff', '#7dff6a', '#c77dff', '#ffffff'];
    const cnt = Math.round((n || 70) * q());
    for (let i = 0; i < cnt; i++)
      conf.push({ x: Math.random() * W, y: -Math.random() * H * .3, vx: (Math.random() - .5) * 1.6 * U, vy: (1 + Math.random() * 2.4) * U,
        w: (5 + Math.random() * 5) * U, h: (3 + Math.random() * 4) * U, rot: Math.random() * 6, vr: (Math.random() - .5) * .3, col: cols[rnd(cols.length)], life: 1 });
  }
  function doShake(mag, dur) { shake = { t0: performance.now(), mag: mag * U, dur: dur || 380 }; }
  function doPunch(v) { punch = Math.max(punch, v); }
  function showPraise(text, size, col) { praise = { text, size: (size || 54) * Math.max(.7, U), t0: performance.now(), dur: 1300, col }; }
  function addPopup(t, x, y, big) { popups.push({ txt: t, x, y, life: 1, t0: performance.now(), big: !!big }); }
  function buzz(p) { if (!sound) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  function toast(kind, title, sub) { toasts.push({ kind, title, sub, t0: 0, dur: 2800 }); }
  function clearFx() {
    parts.length = rings.length = bolts.length = beams.length = flashes.length = popups.length = conf.length = glints.length = 0;
    praise = null; shake = null; flashT = 0; punch = 0; energy = 0;
  }

  function updateFx(dt, now) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= p.dec * dt; p.rot += p.vr * dt;
      if (p.k === 'e') { p.vx *= Math.pow(.98, dt); }
      if (p.life <= 0) parts.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.r += r.v * dt; r.life -= .045 * dt; if (r.life <= 0) rings.splice(i, 1); }
    for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.life -= f.dec * dt; if (f.life <= 0) flashes.splice(i, 1); }
    for (let i = beams.length - 1; i >= 0; i--) { beams[i].life -= .055 * dt; if (beams[i].life <= 0) beams.splice(i, 1); }
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]; b.life -= b.dec * dt;
      if (++b.tk % 3 === 0) b.pts = boltPts(b.x1, b.y1, b.x2, b.y2, b.amp);
      if (b.life <= 0) bolts.splice(i, 1);
    }
    for (let i = conf.length - 1; i >= 0; i--) {
      const c = conf[i]; c.vy += .05 * U * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt; c.life -= .004 * dt;
      if (c.y > H + 20 || c.life <= 0) conf.splice(i, 1);
    }
    for (let i = popups.length - 1; i >= 0; i--) { const p = popups[i]; p.y -= .7 * U * dt; p.life -= .014 * dt; if (p.life <= 0) popups.splice(i, 1); }
    for (const m of motes) { m.y -= m.sp * dt * (1 + energy * 4); if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; } }
    if (flashT > 0) flashT = Math.max(0, flashT - .03 * dt);
    if (punch > 0) punch = Math.max(0, punch - .055 * dt);
    if (energy > 0) energy = Math.max(0, energy - .006 * dt);
    for (let i = toasts.length - 1; i >= 0; i--) {
      const t = toasts[i];
      if (!t.t0) { if (i === 0 || !toasts[0].t0) t.t0 = now; else continue; }
      if (now - t.t0 > t.dur) toasts.splice(i, 1);
    }
  }

  function drawFxBoard(now) {
    const bw = CS * N;
    // 빔 / 플래시 / 링 / 번개 (밝은 가산 합성)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of beams) {
      const th = CS * (1.1 + (1 - b.life) * .5), a = Math.min(1, b.life * 1.4);
      let lg;
      if (b.horiz) {
        const y = cy(b.idx) + CS / 2;
        lg = ctx.createLinearGradient(0, y - th, 0, y + th);
        lg.addColorStop(0, 'rgba(' + b.col + ',0)'); lg.addColorStop(.5, 'rgba(' + b.col + ',' + a + ')'); lg.addColorStop(1, 'rgba(' + b.col + ',0)');
        ctx.fillStyle = lg; ctx.fillRect(BX - CS, y - th, bw + CS * 2, th * 2);
      } else {
        const x = cx(b.idx) + CS / 2;
        lg = ctx.createLinearGradient(x - th, 0, x + th, 0);
        lg.addColorStop(0, 'rgba(' + b.col + ',0)'); lg.addColorStop(.5, 'rgba(' + b.col + ',' + a + ')'); lg.addColorStop(1, 'rgba(' + b.col + ',0)');
        ctx.fillStyle = lg; ctx.fillRect(x - th, BY - CS, th * 2, bw + CS * 2);
      }
    }
    for (const f of flashes) {
      const rad = f.r * (1.3 - f.life * .5);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);
      g.addColorStop(0, 'rgba(' + f.col + ',' + Math.min(1, f.life * 1.2) + ')'); g.addColorStop(1, 'rgba(' + f.col + ',0)');
      ctx.fillStyle = g; ctx.fillRect(f.x - rad, f.y - rad, rad * 2, rad * 2);
    }
    for (const r of rings) {
      ctx.lineWidth = (1 + 5 * r.life) * U * r.w; ctx.strokeStyle = r.col; ctx.globalAlpha = Math.max(0, r.life) * .85;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const b of bolts) {
      const a = Math.max(0, Math.min(1, b.life * 1.5));
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const pass of [[12 * U * b.w, 'rgba(' + b.col + ',' + (.3 * a) + ')'], [4 * U * b.w, 'rgba(255,255,255,' + a + ')']]) {
        ctx.lineWidth = pass[0]; ctx.strokeStyle = pass[1];
        ctx.beginPath(); b.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
      }
    }
    for (const p of parts) {
      if (p.k === 's') continue;
      const a = Math.max(0, Math.min(1, p.life * 1.4));
      ctx.globalAlpha = a; ctx.fillStyle = p.col;
      if (p.k === 'e') { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (.3 + p.life * .7), 0, Math.PI * 2); ctx.fill(); }
      else { star4(ctx, p.x, p.y, p.size * (.4 + p.life * .6)); ctx.fill(); }
    }
    ctx.restore();
    // 보석 파편 (일반 합성)
    for (const p of parts) {
      if (p.k !== 's') continue;
      const a = Math.max(0, Math.min(1, p.life * 1.6)), s = p.size * (.5 + p.life * .5);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = a;
      ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * .5, s * .8); ctx.lineTo(-s * .6, -s * .7); ctx.closePath();
      ctx.fillStyle = p.col; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = Math.max(1, U); ctx.stroke();
      ctx.restore();
    }
  }

  // ───────────────────────── 오디오 (WebAudio 합성) ─────────────────────────
  let AC = null, master = null, noiseBuf = null;
  function unlockAudio() {
    if (!AC) {
      try {
        AC = new (window.AudioContext || window.webkitAudioContext)();
        master = AC.createGain(); master.gain.value = .9; master.connect(AC.destination);
        noiseBuf = AC.createBuffer(1, Math.floor(AC.sampleRate * .8), AC.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { AC = null; }
    }
    if (AC && AC.state === 'suspended') AC.resume();
  }
  function beep(f, d, type, vol, delay, slide) {
    if (!sound || !AC) return;
    const t = AC.currentTime + (delay || 0);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + d);
    g.gain.setValueAtTime(vol || .07, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + d + .02);
  }
  function noise(d, vol, freq, delay, type, slide) {
    if (!sound || !AC || !noiseBuf) return;
    const t = AC.currentTime + (delay || 0);
    const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = noiseBuf; f.type = type || 'lowpass';
    f.frequency.setValueAtTime(freq || 1200, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + d);
    g.gain.setValueAtTime(vol || .12, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + d + .05);
  }
  const PENTA = [523, 587, 659, 784, 880, 1047, 1175, 1319];
  function sfx(n, k) {
    k = k || 1;
    switch (n) {
      case 'sel': beep(880, .06, 'sine', .06); break;
      case 'swap': beep(330, .08, 'sine', .05, 0, 520); break;
      case 'bad': beep(170, .14, 'sawtooth', .07); beep(120, .18, 'sawtooth', .07, .1); break;
      case 'match': {
        const base = PENTA[Math.min(k - 1, 7)];
        beep(base, .12, 'triangle', .08); beep(base * 1.5, .16, 'sine', .06, .07); beep(base * 2, .2, 'sine', .04, .14); break;
      }
      case 'forge': beep(440, .25, 'sine', .07, 0, 1760); beep(1760, .3, 'triangle', .04, .15); break;
      case 'flame': noise(.5, .16, 2400, 0, 'lowpass', 200); beep(160, .35, 'sawtooth', .07, 0, 50); break;
      case 'star': noise(.4, .1, 3000, 0, 'bandpass', 600); beep(900, .35, 'square', .04, 0, 2400); break;
      case 'hyper': for (let i = 0; i < 6; i++) beep(600 + i * 180, .12, 'sawtooth', .04, i * .05, 300 + i * 90); noise(.5, .1, 4000, 0, 'highpass', 800); break;
      case 'nova': noise(1, .22, 1800, 0, 'lowpass', 80); beep(90, .9, 'sine', .16, 0, 30); [523, 784, 1047, 1568].forEach((f, i) => beep(f, .5, 'triangle', .06, .1 + i * .08)); break;
      case 'boom': noise(.8, .2, 1500, 0, 'lowpass', 60); beep(80, .6, 'sine', .14, 0, 28); break;
      case 'level': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => beep(f, .2, 'triangle', .07, i * .09)); break;
      case 'over': [440, 392, 349, 294].forEach((f, i) => beep(f, .24, 'triangle', .08, i * .18)); break;
      case 'ui': beep(660, .05, 'sine', .05); break;
      case 'time': beep(1568, .1, 'square', .05); beep(2093, .16, 'square', .05, .08); break;
      case 'tick': beep(1200, .04, 'square', .03); break;
      case 'badge': [784, 988, 1175, 1568].forEach((f, i) => beep(f, .18, 'sine', .07, i * .07)); break;
      case 'unlock': [523, 784, 1047].forEach((f, i) => beep(f, .25, 'triangle', .07, i * .12)); break;
      case 'shuffle': noise(.35, .07, 2500, 0, 'bandpass', 500); beep(300, .3, 'sine', .05, 0, 900); break;
      case 'mission': [659, 784, 988, 1319].forEach((f, i) => beep(f, .2, 'triangle', .07, i * .1)); break;
    }
  }

  // ───────────────────────── 보석 / 보드 기본 ─────────────────────────
  const mkGem = (t, r, c) => ({ t, sp: null, x: cx(c), y: cy(r), v: 0, s: 1, f: 0, land: 0, bomb: 0, bf: 0, time: 0, ph: Math.random() * 6.28, noTrig: false });
  const gemAt = i => grid[(i / N) | 0][i % N];
  const tAt = (r, c) => { const g = grid[r] && grid[r][c]; return g && g.t < HYPER ? g.t : -1; };
  const eachGem = fn => { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const g = grid[r] && grid[r][c]; if (g) fn(g, r, c); } };
  const countFlag = k => { let n = 0; eachGem(g => { if (g[k]) n++; }); return n; };
  const flagged = g => g.sp || g.bf || g.bomb || g.time;

  function lineLen(r, c, dr, dc) {
    const t = tAt(r, c);
    if (t < 0) return 0;
    let n = 1;
    for (let k = 1; tAt(r + dr * k, c + dc * k) === t; k++) n++;
    for (let k = 1; tAt(r - dr * k, c - dc * k) === t; k++) n++;
    return n;
  }
  const matchAt = (r, c) => lineLen(r, c, 0, 1) >= 3 || lineLen(r, c, 1, 0) >= 3;
  function swapT(a, b) { const A_ = grid[a.r][a.c], B_ = grid[b.r][b.c]; const t = A_.t; A_.t = B_.t; B_.t = t; }

  function findSwap() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const r2 = r + dr, c2 = c + dc;
        if (r2 >= N || c2 >= N) continue;
        const a = { r, c }, b = { r: r2, c: c2 };
        if (grid[r][c].t === HYPER || grid[r2][c2].t === HYPER) return { a, b };
        swapT(a, b);
        const ok = matchAt(r, c) || matchAt(r2, c2);
        swapT(a, b);
        if (ok) return { a, b };
      }
    }
    return null;
  }
  function rotT(r, c) {   // 2×2 시계 방향 회전 (t 값만, 시뮬레이션용)
    const a = grid[r - 1][c - 1].t, b = grid[r - 1][c].t, d = grid[r][c].t, e = grid[r][c - 1].t;
    grid[r - 1][c].t = a; grid[r][c].t = b; grid[r][c - 1].t = d; grid[r - 1][c - 1].t = e;
  }
  function findTwist() {
    for (let k = 1; k <= 3; k++) for (let r = 1; r < N; r++) for (let c = 1; c < N; c++) {
      for (let i = 0; i < k; i++) rotT(r, c);
      const ok = matchAt(r - 1, c - 1) || matchAt(r - 1, c) || matchAt(r, c) || matchAt(r, c - 1);
      for (let i = 0; i < 4 - k; i++) rotT(r, c);
      if (ok) return { quad: { r, c }, k };
    }
    return null;
  }
  const findMove = () => (G && G.cfg.twist) ? findTwist() : findSwap();

  function findMatches() {
    const runs = [], cells = new Set();
    for (let r = 0; r < N; r++) {
      let c = 0;
      while (c < N) {
        const t = tAt(r, c); let k = c + 1;
        while (t >= 0 && k < N && tAt(r, k) === t) k++;
        if (t >= 0 && k - c >= 3) { const cs = []; for (let i = c; i < k; i++) cs.push(r * N + i); runs.push({ dir: 'h', cells: cs, len: k - c, t, done: false }); }
        c = k;
      }
    }
    for (let c = 0; c < N; c++) {
      let r = 0;
      while (r < N) {
        const t = tAt(r, c); let k = r + 1;
        while (t >= 0 && k < N && tAt(k, c) === t) k++;
        if (t >= 0 && k - r >= 3) { const cs = []; for (let i = r; i < k; i++) cs.push(i * N + c); runs.push({ dir: 'v', cells: cs, len: k - r, t, done: false }); }
        r = k;
      }
    }
    runs.forEach(r => r.cells.forEach(i => cells.add(i)));
    return { runs, cells };
  }

  // 매치 모양 → 특수 보석 계획 (4개=Ember, L·T·十=Beacon, 5개=Prism, 6개+=Aurora)
  function planCreations(m, pref) {
    const cre = [];
    const pick = cells => {
      const ok = cells.filter(i => !flagged(gemAt(i)));
      if (!ok.length) return -1;
      const p = ok.find(i => pref.has(i));
      return p !== undefined ? p : ok[Math.floor(ok.length / 2)];
    };
    const byLen = [...m.runs].sort((a, b) => b.len - a.len);
    for (const run of byLen) {
      if (run.len >= 5 && !run.done) {
        const idx = pick(run.cells);
        run.done = true;
        if (idx >= 0) cre.push({ idx, sp: run.len >= 6 ? 'nova' : 'hyper' });
      }
    }
    const hr = m.runs.filter(r => r.dir === 'h' && !r.done), vr = m.runs.filter(r => r.dir === 'v' && !r.done);
    for (const h of hr) for (const v of vr) {
      if (h.done || v.done) continue;
      const common = h.cells.find(i => v.cells.includes(i));
      if (common !== undefined && !flagged(gemAt(common))) { cre.push({ idx: common, sp: 'star' }); h.done = v.done = true; }
    }
    for (const run of m.runs) {
      if (run.len === 4 && !run.done) {
        const idx = pick(run.cells);
        run.done = true;
        if (idx >= 0) cre.push({ idx, sp: 'flame' });
      }
    }
    return cre;
  }

  function commonColor() {
    const n = Array(NT).fill(0);
    eachGem(g => { if (g.t < HYPER) n[g.t]++; });
    let b = 0; for (let i = 1; i < NT; i++) if (n[i] > n[b]) b = i;
    return b;
  }

  // 특수 보석 연쇄 폭발 범위 계산
  function expandClear(cells, creIdx) {
    const clear = new Set(cells), trig = [], seen = new Set(), qu = [...cells];
    const add = (r, c) => {
      if (r < 0 || r >= N || c < 0 || c >= N || !grid[r][c]) return;
      const j = r * N + c;
      if (!clear.has(j)) { clear.add(j); qu.push(j); }
    };
    while (qu.length) {
      const i = qu.pop();
      if (seen.has(i)) continue;
      seen.add(i);
      const g = gemAt(i);
      if (!g || !g.sp || creIdx.has(i) || g.noTrig) continue;
      const r = (i / N) | 0, c = i % N;
      trig.push({ i, r, c, sp: g.sp });
      if (g.sp === 'flame') { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) add(r + dr, c + dc); }
      else if (g.sp === 'star') { for (let k = 0; k < N; k++) { add(r, k); add(k, c); } }
      else if (g.sp === 'nova') { for (let k = 0; k < N; k++) for (let d = -1; d <= 1; d++) { add(r + d, k); add(k, c + d); } }
      else if (g.sp === 'hyper') { const t = commonColor(); eachGem((gg, rr, cc) => { if (gg.t === t) add(rr, cc); }); }
    }
    const blasted = new Set([...clear].filter(i => !cells.has(i)));
    return { clear, trig, blasted };
  }

  // ───────────────────────── 애니메이션 도구 ─────────────────────────
  function tween(ms, fn) {
    return new Promise(res => {
      const t0 = performance.now();
      (function step(now) {
        const p = Math.min(1, Math.max(0, (now - t0) / ms));
        fn(p);
        if (p < 1) requestAnimationFrame(step); else res();
      })(t0);
    });
  }
  const wait = ms => tween(ms, () => {});

  // 중력(모든 방향) — 각 보석이 자기 칸까지 날아갈 때까지
  function settle() {
    return new Promise(res => {
      const t0 = performance.now();
      let last = t0;
      (function step(now) {
        const dt = Math.min(3, Math.max(0.2, (now - last) / 16.667)); last = now;
        let moving = false;
        const force = now - t0 > 3500;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const o = grid[r][c]; if (!o) continue;
          const tx = cx(c), ty = cy(r), dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
          if (d > .5 && !force) {
            o.v += 1.1 * U * dt;
            const mv = Math.min(d, o.v * dt);
            o.x += dx / d * mv; o.y += dy / d * mv;
            if (mv >= d) { o.x = tx; o.y = ty; if (o.v > 3 * U) o.land = 1; o.v = 0; } else moving = true;
          } else { o.x = tx; o.y = ty; o.v = 0; }
        }
        if (moving) requestAnimationFrame(step); else res();
      })(last);
    });
  }

  const cellOf = (line, i, dir) => dir === 0 ? [N - 1 - i, line] : dir === 1 ? [line, i] : dir === 2 ? [i, line] : [line, N - 1 - i];
  function newGem(r, c) {
    const g = mkGem(rnd(NT), r, c);
    if (G && G.cfg.timer === 'lightning' && Math.random() < .04 && countFlag('time') < 2) g.time = 1;
    return g;
  }
  async function fall() {
    const dir = G ? G.grav : 0;
    for (let line = 0; line < N; line++) {
      let w = 0;
      for (let k = 0; k < N; k++) {
        const [r, c] = cellOf(line, k, dir), g = grid[r][c];
        if (g) {
          if (k !== w) { const [r2, c2] = cellOf(line, w, dir); grid[r2][c2] = g; grid[r][c] = null; }
          w++;
        }
      }
      for (let i = w; i < N; i++) {
        const [r, c] = cellOf(line, i, dir), g = newGem(r, c), k = i - w;
        if (dir === 0) g.y = BY - (k + 1) * CS;
        else if (dir === 2) g.y = BY + N * CS + k * CS;
        else if (dir === 1) g.x = BX + N * CS + k * CS;
        else g.x = BX - (k + 1) * CS;
        grid[r][c] = g;
      }
    }
    await settle();
  }

  function genBoardTypes() {
    for (;;) {
      const T = [];
      for (let r = 0; r < N; r++) {
        T[r] = [];
        for (let c = 0; c < N; c++) {
          let t;
          do { t = rnd(NT); }
          while ((c >= 2 && T[r][c - 1] === t && T[r][c - 2] === t) ||
                 (r >= 2 && T[r - 1][c] === t && T[r - 2][c] === t));
          T[r][c] = t;
        }
      }
      grid = T.map(row => row.map(t => ({ t })));
      if (findSwap()) return T;
    }
  }
  async function fillFall() {
    const T = genBoardTypes();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const o = mkGem(T[r][c], r, c);
      o.y = cy(r) - N * CS - c * CS * .3;
      grid[r][c] = o;
    }
    await settle();
  }
  async function refreshBoard() {
    await tween(220, p => { eachGem(g => { g.s = 1 - p; }); });
    if (G) G.grav = 0;
    await fillFall();
    if (G && G.cfg.bfly) { spawnButterfly(); spawnButterfly(); }
  }

  // ───────────────────────── 점수 / 배지 / 해금 ─────────────────────────
  const mulFactor = () => G.cfg.mult ? G.level : (G.cfg.timer === 'lightning' ? G.spd : 1);
  function noteBest() {
    if (!G) return;
    const b = bestOf(G.cfg.id);
    b.score = Math.max(b.score, G.score);
    if (!G.cfg.quest) b.level = Math.max(b.level, G.level);
    dirty = true;
  }
  function award(id) {
    if (save.badges[id]) return;
    save.badges[id] = Date.now();
    const b = BADGES.find(x => x.id === id);
    toast('badge', b.name, b.desc); sfx('badge'); dirty = true;
    checkUnlocks();
  }
  function checkUnlocks() {
    for (const m of MODES) {
      if (m.cond && !save.unlocked[m.id] && m.cond()) {
        save.unlocked[m.id] = 1; dirty = true;
        toast('unlock', 'NEW MODE: ' + m.name, '모드가 해금되었습니다!'); sfx('unlock');
      }
    }
    if (MODES.filter(m => m.secret).every(m => save.unlocked[m.id])) award('all');
  }
  function addScore(n) {
    G.score += n; G.pts += n; G.bump = 1;
    G.coinAcc = (G.coinAcc || 0) + n / 100;
    if (G.coinAcc >= 1) { const c = Math.floor(G.coinAcc); G.coinAcc -= c; save.coins += c; G.coinBump = 1; dirty = true; }
    const id = G.cfg.id;
    if (G.score >= 5000) award('big');
    if (id === 'lightning' && G.score >= 1500) award('lightning');
    if (id === 'twist' && G.score >= 1500) award('twist');
    noteBest();
  }

  // ───────────────────────── 특수 보석 연출 ─────────────────────────
  const PRAISE = ['', '', 'Good!', 'Great!', 'Superb!', 'Amazing!', 'Incredible!'];
  async function playTriggers(trig, forced) {
    let hold = 0;
    if (forced) {
      const x0 = cx(forced.from % N) + CS / 2, y0 = cy((forced.from / N) | 0) + CS / 2;
      let n = 0;
      for (const i of forced.cells) {
        if (i === forced.from) continue;
        if (n++ > 42) break;
        addBolt(x0, y0, cx(i % N) + CS / 2, cy((i / N) | 0) + CS / 2, '170,130,255', 24, .7);
      }
      addFlash(x0, y0, CS * 3.4, '210,170,255', 28); addRing(x0, y0, '#c9a0ff', 8, 4.5, 1.2);
      doShake(7); doPunch(.8); hold = 280;
      if (forced.kind === 'bigbang') {
        sfx('nova'); flashT = Math.max(flashT, .9); doShake(14, 600); doPunch(1.3); showPraise('BIG BANG!', 66); hold = 380;
      } else if (forced.kind === 'bomb') {
        sfx('flame'); embers(x0, y0, 26); addRing(x0, y0, '#ff9a2a', 8, 4.2, 1.3); showPraise('BOOM!', 44);
      } else if (forced.kind === 'burst') { sfx('hyper'); showPraise('COLOR BURST!', 46); }
      else { sfx('hyper'); showPraise('PRISM!', 52); }
    }
    for (const t of trig) {
      const x = cx(t.c) + CS / 2, y = cy(t.r) + CS / 2;
      if (t.sp === 'flame') {
        addFlash(x, y, CS * 2.8, '255,170,60', 28); addRing(x, y, '#ff9a2a', 8, 4.2, 1.3); addRing(x, y, '#ffe08a', 4, 2.4);
        embers(x, y, 22); sfx('flame'); doShake(5); doPunch(.55); hold = Math.max(hold, 120);
      } else if (t.sp === 'star') {
        addBeam(true, t.r); addBeam(false, t.c); addFlash(x, y, CS * 2.4, '255,255,255', 22);
        sparksAt(x, y, '#ffffff', 16, 6); sfx('star'); doShake(6); doPunch(.65); hold = Math.max(hold, 140);
      } else if (t.sp === 'nova') {
        for (let d = -1; d <= 1; d++) { addBeam(true, t.r + d, '255,230,160'); addBeam(false, t.c + d, '255,230,160'); }
        addFlash(x, y, CS * 6.5, '255,240,200', 36);
        for (let k = 0; k < 3; k++) addRing(x, y, k % 2 ? '#fff6c0' : '#ffb84a', 10 + k * 10, 3 + k, 1.5);
        embers(x, y, 34); sparksAt(x, y, '#ffffff', 24, 8);
        sfx('nova'); flashT = Math.max(flashT, .75); doShake(13, 560); doPunch(1.15); showPraise('AURORA!', 60); hold = Math.max(hold, 280);
      } else if (t.sp === 'hyper') {
        for (let k = 0; k < 7; k++) addBolt(x, y, cx(rnd(N)) + CS / 2, cy(rnd(N)) + CS / 2, '170,130,255', 22, .6);
        addFlash(x, y, CS * 3, '210,170,255', 26); sfx('hyper'); doShake(6); doPunch(.7); hold = Math.max(hold, 200);
      }
      buzz([20, 30, 40]);
    }
    if (hold) await wait(hold);
  }

  // ───────────────────────── 매치 해결 (연쇄) ─────────────────────────
  async function resolve(opts) {
    opts = opts || {};
    const cfg = G.cfg;
    let pref = opts.pref || new Set(), forced = opts.forced || null, combo = 0;
    for (;;) {
      if (G.over) break;
      const m = findMatches();
      const cells = new Set(m.cells);
      let cre = cfg.spec && m.runs.length ? planCreations(m, pref) : [];
      const creIdx = new Set(cre.map(c => c.idx));
      creIdx.forEach(i => cells.delete(i));
      if (forced) forced.cells.forEach(i => cells.add(i));
      if (!cells.size && !cre.length) break;
      combo++; G.combo = combo;
      const ex = expandClear(cells, creIdx);
      cre = cre.filter(c => !ex.blasted.has(c.idx));
      const list = [...ex.clear].map(i => ({ i, r: (i / N) | 0, c: i % N }));

      sfx('match', combo); buzz(8 + combo * 5);
      energy = Math.min(1.4, energy + .18 + combo * .04);
      if (combo >= 2 && !ex.trig.length && !forced) showPraise(PRAISE[Math.min(combo, 6)], 50 + Math.min(combo, 6) * 3);
      if (combo >= 5) award('combo5');
      if (combo >= 8) award('combo8');
      save.stats.maxCombo = Math.max(save.stats.maxCombo, combo);

      // 6개 이상 일렬 / 번개
      for (const run of m.runs) if (run.len >= 4 && !ex.trig.length) {
        const a = run.cells[0], b = run.cells[run.cells.length - 1];
        addBolt(cx(a % N) + CS / 2, cy((a / N) | 0) + CS / 2, cx(b % N) + CS / 2, cy((b / N) | 0) + CS / 2, '120,200,255', 18, .8);
      }

      if (ex.trig.length || forced) await playTriggers(ex.trig, forced);
      await tween(forced || ex.trig.length ? 90 : 190, p => { const f = (Math.floor(p * 5) % 2 === 0) ? 1 : 0; for (const it of list) { const g = grid[it.r][it.c]; if (g) g.f = f; } });

      // 점수 계산 + 파편
      const counts = Array(NT).fill(0);
      let timeGain = 0, defused = 0, saved = 0, sx = 0, sy = 0;
      for (const it of list) {
        const g = grid[it.r][it.c]; if (!g) continue;
        if (g.t < HYPER) counts[g.t]++;
        if (g.time) timeGain += 5;
        if (g.bomb) defused++;
        if (g.bf) saved++;
        shatter(g.x + CS / 2, g.y + CS / 2, g.t < HYPER ? PAL[g.t].b : '#ffffff', g.sp ? 10 : 6);
        sx += g.x + CS / 2; sy += g.y + CS / 2;
      }
      let base = 0;
      for (const run of m.runs) base += run.len >= 5 ? 100 : run.len === 4 ? 60 : 30;
      base += (ex.blasted.size + (forced ? forced.cells.size : 0)) * 12 + ex.trig.length * 60 + defused * 150 + saved * 200;
      const gain = Math.round(base * combo * mulFactor());
      if (combo >= 3 || ex.trig.length) doShake(3 + combo * 1.2);
      if (combo >= 4) { flashT = Math.max(flashT, .5); confettiRain(40); }
      doPunch(.25 + combo * .08);
      await tween(160, p => { for (const it of list) { const g = grid[it.r][it.c]; if (g) g.s = 1 + p * .25 - p * p * 1.25; } });
      for (const it of list) grid[it.r][it.c] = null;
      save.stats.gems += list.length;
      popups.push({ txt: '+' + gain, x: sx / list.length, y: sy / list.length, life: 1, t0: performance.now(), big: combo >= 3 || ex.trig.length > 0 });
      addScore(gain);

      if (timeGain) { G.time = Math.min(99, G.time + timeGain); sfx('time'); addPopup('+' + timeGain + 's', sx / list.length, sy / list.length - CS * .6, true); addFlash(sx / list.length, sy / list.length, CS * 2, '255,220,100', 22); }
      if (cfg.timer === 'lightning') {
        G.spdMeter = Math.min(1, G.spdMeter + .24);
        if (G.spdMeter >= 1 && G.spd < 8) { G.spd++; G.spdMeter = .4; showPraise('SPEED x' + G.spd, 40); }
      }
      if (cfg.timer === 'action' || cfg.timer === 'hyper') G.bar = Math.min(1, G.bar + (cfg.timer === 'hyper' ? .016 : .012) * list.length * (1 + combo * .15));
      if (saved) { save.stats.bf += saved; if (save.stats.bf >= 20) award('butterfly'); showPraise('SAVED!', 40); }
      if (defused) showPraise('DEFUSED!', 44);

      // 특수 보석 생성
      if (cre.length) {
        await tween(10, () => {});
        for (const c of cre) {
          const g = grid[(c.idx / N) | 0][c.idx % N]; if (!g) continue;
          g.sp = c.sp; g.noTrig = false; if (c.sp === 'hyper') g.t = HYPER;
          g.s = .2;
          const x = g.x + CS / 2, y = g.y + CS / 2;
          addRing(x, y, '#ffffff', 6, 3.4, 1.2); addFlash(x, y, CS * 2.2, c.sp === 'flame' ? '255,170,60' : '255,255,255', 24); sparksAt(x, y, '#ffffff', 14, 5);
          save.stats[c.sp]++; award(c.sp);
          showPraise(c.sp === 'flame' ? 'EMBER GEM!' : c.sp === 'star' ? 'BEACON GEM!' : c.sp === 'hyper' ? 'PRISM GEM!' : 'AURORA GEM!', 44);
        }
        sfx('forge');
        await tween(240, p => { for (const c of cre) { const g = grid[(c.idx / N) | 0][c.idx % N]; if (g) g.s = .2 + .8 * (1 - Math.pow(1 - p, 3)) + Math.sin(p * Math.PI) * .35; } });
        for (const c of cre) { const g = grid[(c.idx / N) | 0][c.idx % N]; if (g) g.s = 1; }
      }

      // 퀘스트 미션 진행
      const ms = G.mission;
      if (ms) {
        if (ms.kind === 'collect') ms.prog += counts[ms.color];
        else if (ms.kind === 'special') ms.prog += cre.length;
        else if (ms.kind === 'detonate') ms.prog += ex.trig.length;
        else if (ms.kind === 'combo') ms.prog = Math.max(ms.prog, combo);
        else if (ms.kind === 'score') ms.prog = G.score - ms.startScore;
      }
      if (ex.trig.length >= 1 && forced) forced = null;
      forced = null; pref = new Set();
      await fall();
    }
    return combo;
  }

  // ───────────────────────── 입력 동작: 교환 / 회전 ─────────────────────────
  function hyperForced(posA, posB) {
    const A = grid[posA.r][posA.c], B = grid[posB.r][posB.c];
    const cells = new Set();
    if (A.t === HYPER && B.t === HYPER) {
      eachGem((g, r, c) => cells.add(r * N + c));
      A.noTrig = B.noTrig = true;
      return { cells, from: posA.r * N + posA.c, kind: 'bigbang' };
    }
    const H_ = A.t === HYPER ? A : B, O = A.t === HYPER ? B : A;
    const hp = A.t === HYPER ? posA : posB;
    H_.noTrig = true;
    cells.add(hp.r * N + hp.c);
    eachGem((g, r, c) => {
      if (g.t === O.t && g.t < HYPER) {
        cells.add(r * N + c);
        if (O.sp && !g.sp) g.sp = O.sp;   // 하이퍼 + 특수 보석: 같은 색을 모두 같은 특수 보석으로 바꿔 한꺼번에 폭발
      }
    });
    return { cells, from: hp.r * N + hp.c, kind: O.sp ? 'special' : 'color' };
  }

  const canAct = () => screen === 'game' && G && !G.busy && !G.over && !dlg && G.started;

  async function trySwap(a, b) {
    if (!canAct()) return;
    G.busy = true; sel = null; hintMove = null; idle = 0;
    try {
      const A_ = grid[a.r][a.c], B_ = grid[b.r][b.c];
      const ax = cx(a.c), ay = cy(a.r), bx = cx(b.c), by = cy(b.r);
      sfx('swap');
      await tween(150, p => {
        p = ease(p);
        A_.x = ax + (bx - ax) * p; A_.y = ay + (by - ay) * p;
        B_.x = bx + (ax - bx) * p; B_.y = by + (ay - by) * p;
      });
      grid[a.r][a.c] = B_; grid[b.r][b.c] = A_;
      const hy = A_.t === HYPER || B_.t === HYPER;
      if (!hy && !matchAt(a.r, a.c) && !matchAt(b.r, b.c)) {
        sfx('bad'); buzz(25);
        await tween(150, p => {
          p = ease(p);
          A_.x = bx + (ax - bx) * p; A_.y = by + (ay - by) * p;
          B_.x = ax + (bx - ax) * p; B_.y = ay + (by - ay) * p;
        });
        grid[a.r][a.c] = A_; grid[b.r][b.c] = B_;
        return;
      }
      const opts = { pref: new Set([a.r * N + a.c, b.r * N + b.c]) };
      if (hy) {
        opts.forced = hyperForced({ r: b.r, c: b.c }, { r: a.r, c: a.c });   // A_ 는 b 위치로, B_ 는 a 위치로 이동했다
        if (opts.forced.kind === 'bigbang') award('bigbang');
      }
      await resolve(opts);
      await afterMove();
    } finally {
      if (G) { G.busy = false; } idle = 0;
    }
  }

  async function twistRotate(vr, vc) {
    if (!canAct()) return;
    G.busy = true; hintMove = null; idle = 0; twistSel = { r: vr, c: vc };
    try {
      const pos = [[vr - 1, vc - 1], [vr - 1, vc], [vr, vc], [vr, vc - 1]];
      const gs = pos.map(([r, c]) => grid[r][c]);
      const dest = [pos[1], pos[2], pos[3], pos[0]];
      const from = gs.map(g => [g.x, g.y]);
      sfx('swap');
      await tween(170, p => {
        p = ease(p);
        gs.forEach((g, i) => { g.x = from[i][0] + (cx(dest[i][1]) - from[i][0]) * p; g.y = from[i][1] + (cy(dest[i][0]) - from[i][1]) * p; });
      });
      gs.forEach((g, i) => { grid[dest[i][0]][dest[i][1]] = g; });
      await resolve({ pref: new Set() });
      await afterMove();
    } finally {
      if (G) { G.busy = false; } idle = 0;
    }
  }


  // ───────────────────────── 부스터 (마법봉 / 폭탄 / 컬러 버스트) ─────────────────────────
  const BOOST = { wand: { cost: 150, label: 'Wand', tip: '보석을 탭 → Ember/Beacon 으로 변신' }, bomb: { cost: 200, label: 'Bomb', tip: '탭한 곳 3×3 폭파' }, burst: { cost: 120, label: 'Burst', tip: '탭한 색을 모두 제거' } };
  function useBooster(k) {
    if (!canAct()) return;
    if (armed === k) { armed = null; sfx('ui'); return; }
    if ((save.boosters[k] | 0) <= 0) {
      if (save.coins >= BOOST[k].cost) {
        save.coins -= BOOST[k].cost; save.boosters[k] = 1; dirty = true; sfx('unlock');
        toast('unlock', BOOST[k].label + ' +1', '-' + BOOST[k].cost + ' 코인');
      } else { sfx('bad'); buzz(25); toast('lock', '코인이 부족해요', BOOST[k].cost + ' 코인이 필요합니다'); }
      return;
    }
    armed = k; sel = null; hintMove = null; twistSel = null; idle = 0; sfx('ui');
  }
  async function applyBooster(k, cell) {
    if (!canAct() || !cell || !grid[cell.r][cell.c]) return;
    const g0 = grid[cell.r][cell.c];
    if (k === 'wand' && (g0.sp || g0.t === HYPER)) { sfx('bad'); return; }
    G.busy = true; armed = null; hintMove = null; idle = 0;
    save.boosters[k]--; dirty = true;
    try {
      const x = cx(cell.c) + CS / 2, y = cy(cell.r) + CS / 2, idx = cell.r * N + cell.c;
      if (k === 'wand') {
        sfx('forge'); addRing(x, y, '#ffffff', 6, 3.4, 1.2); addFlash(x, y, CS * 2.4, '255,230,255', 26); sparksAt(x, y, '#ffffff', 18, 6);
        for (let i = 0; i < 6; i++) addBolt(x, y, x + (Math.random() - .5) * CS * 2.4, y + (Math.random() - .5) * CS * 2.4, '255,230,160', 10, .5);
        g0.sp = Math.random() < .5 ? 'flame' : 'star'; g0.noTrig = false; g0.s = .2;
        showPraise(g0.sp === 'flame' ? 'EMBER GEM!' : 'BEACON GEM!', 40);
        await tween(260, p => { g0.s = .2 + .8 * (1 - Math.pow(1 - p, 3)) + Math.sin(p * Math.PI) * .35; });
        g0.s = 1; save.stats[g0.sp]++; award(g0.sp);
      } else {
        const cells = new Set([idx]);
        if (k === 'bomb') {
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const r = cell.r + dr, c = cell.c + dc; if (r >= 0 && r < N && c >= 0 && c < N && grid[r][c]) cells.add(r * N + c); }
        } else {
          const t = g0.t === HYPER ? commonColor() : g0.t;
          eachGem((g, r, c) => { if (g.t === t) cells.add(r * N + c); });
        }
        await resolve({ forced: { cells, from: idx, kind: k }, pref: new Set() });
        if (!G.over && G.cfg.quest && G.mission && G.mission.prog >= G.mission.target) await missionComplete();
        if (!G.over && G.cfg.lvl && G.pts >= 300 * G.level) await levelUp();
        if (!G.over && !G.cfg.twist && !findSwap()) {
          if (G.cfg.dead === 'over') await gameOver('GAME OVER', '더 이상 둘 수 없습니다'); else await shuffleBoard();
        }
      }
    } finally { if (G) G.busy = false; idle = 0; }
  }

  // 일시정지 / 설정 대화상자
  function settingsDlg(title, inGame) {
    const btns = [];
    if (inGame) btns.push({ label: 'Resume', fn: () => { dlg = null; }, hue: HUE_GREEN });
    btns.push({ label: 'Sound: ' + (sound ? 'On' : 'Off'), fn: () => { toggleSound(); dlg = settingsDlg(title, inGame); }, hue: HUE_BLUE });
    btns.push({ label: 'Scanlines: ' + (save.crt ? 'On' : 'Off'), fn: () => { setCrt(save.crt ? 0 : 1); dlg = settingsDlg(title, inGame); }, hue: HUE_BLUE });
    if (inGame) btns.push({ label: 'Quit', fn: () => { toMenu(); }, hue: HUE_RED }); else btns.push({ label: 'Close', fn: () => { dlg = null; }, hue: HUE_GREEN });
    return { title, lines: [], btns, stack: true };
  }
  function openPause() { if (screen === 'game' && G && !dlg) { armed = null; dlg = settingsDlg('PAUSE', true); } }
  function openSettings() { if (!dlg) dlg = settingsDlg('SETTINGS', false); }

  // ───────────────────────── 모드별 규칙 ─────────────────────────
  function spawnBomb() {
    const cand = []; eachGem((g, r, c) => { if (!flagged(g)) cand.push(g); });
    if (!cand.length) return;
    const g = cand[rnd(cand.length)];
    g.bomb = Math.max(7, 14 - G.level);
    addRing(g.x + CS / 2, g.y + CS / 2, '#ff4040', 6, 3, 1.2); sfx('tick');
  }
  function spawnButterfly() {
    if (countFlag('bf') >= 4) return;
    const cols = []; for (let c = 0; c < N; c++) if (grid[N - 1][c] && !grid[N - 1][c].bf) cols.push(c);
    if (!cols.length) return;
    const g = grid[N - 1][cols[rnd(cols.length)]]; g.bf = 1;
    addRing(g.x + CS / 2, g.y + CS / 2, '#9dff9d', 6, 3, 1.1);
  }
  async function butterflyStep() {
    G.bfTick++;
    if (G.bfTick % 2) return false;
    const list = []; eachGem((g, r, c) => { if (g.bf) list.push({ r, c }); });
    list.sort((a, b) => a.r - b.r);
    let ate = false;
    for (const { r, c } of list) {
      if (r === 0) { ate = true; continue; }
      const up = grid[r - 1][c];
      if (up.bf) continue;
      up.bf = 1; grid[r][c].bf = 0;
      sparksAt(up.x + CS / 2, up.y + CS / 2, '#b6ffb6', 8, 3);
    }
    if (list.length) await wait(180);
    return ate;
  }

  function genMission(n) {
    let s = n * 7919 + 13;
    const rs = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const kinds = ['collect', 'score', 'combo', 'special', 'detonate'];
    const kind = kinds[(n - 1) % 5];
    const ms = { kind, n, prog: 0, startScore: G ? G.score : 0, color: 0, target: 0, moves: 0 };
    if (kind === 'collect') { ms.color = Math.floor(rs() * NT); ms.target = Math.round(10 + n * 2.2); ms.moves = Math.round(ms.target / 2 + 10); ms.desc = GEM_NAMES[ms.color] + ' ' + ms.target + '개 모으기'; }
    else if (kind === 'score') { ms.target = Math.round((200 + n * 90) / 50) * 50; ms.moves = 16 + Math.floor(n / 2); ms.desc = ms.target + '점 달성'; }
    else if (kind === 'combo') { ms.target = Math.min(8, 2 + Math.ceil(n / 3)); ms.moves = 22; ms.desc = ms.target + '연쇄 달성'; }
    else if (kind === 'special') { ms.target = Math.min(6, 1 + Math.floor(n / 3)); ms.moves = 18; ms.desc = '특수 보석 ' + ms.target + '개 만들기'; }
    else { ms.target = Math.min(5, 1 + Math.floor(n / 4)); ms.moves = 20; ms.desc = '특수 보석 ' + ms.target + '번 터뜨리기'; }
    ms.movesLeft = ms.moves;
    return ms;
  }
  async function missionComplete() {
    const ms = G.mission;
    sfx('mission'); showPraise('MISSION CLEAR!', 50); flashT = .8; confettiRain(80); buzz([30, 40, 80]);
    for (let i = 0; i < 4; i++) setTimeout(() => firework(BX + Math.random() * CS * N, BY + Math.random() * CS * N * .7), i * 160);
    addScore(300 + ms.n * 50); save.coins += 30; G.coinBump = 1;
    bestOf('quest').level = Math.max(bestOf('quest').level, ms.n);
    save.stats.quest++;
    if (ms.n >= 5) award('quest5');
    if (ms.n >= 10) award('quest10');
    G.qn = ms.n + 1; G.mission = genMission(G.qn);
    noteBest(); checkUnlocks();
    await wait(700);
    await refreshBoard();
  }
  async function missionFail() {
    G.lives--; sfx('bad'); showPraise(G.lives > 0 ? 'FAILED' : 'GAME OVER', 48); doShake(8);
    await wait(700);
    if (G.lives <= 0) { await gameOver('GAME OVER', '목숨을 모두 잃었습니다'); return; }
    G.mission = genMission(G.qn);
    await refreshBoard();
  }

  async function shuffleBoard() {
    sfx('shuffle'); showPraise('SHUFFLE', 44);
    await tween(200, p => { eachGem(g => { g.s = 1 - p * .8; }); });
    let ok = false;
    for (let tries = 0; tries < 400 && !ok; tries++) {
      const gs = []; const ts = [];
      eachGem(g => { if (g.t < HYPER) { gs.push(g); ts.push(g.t); } });
      for (let i = ts.length - 1; i > 0; i--) { const j = rnd(i + 1); [ts[i], ts[j]] = [ts[j], ts[i]]; }
      gs.forEach((g, i) => { g.t = ts[i]; });
      ok = findMatches().cells.size === 0 && !!findSwap();
    }
    if (!ok) {
      const old = grid; const T = genBoardTypes(); grid = old;
      eachGem((g, r, c) => { if (g.t < HYPER) g.t = T[r][c]; });
    }
    await tween(240, p => { eachGem(g => { g.s = .2 + .8 * ease(p); }); });
    eachGem(g => { g.s = 1; });
  }

  async function levelUp() {
    const cfg = G.cfg;
    G.level++; G.pts = 0; noteBest(); save.coins += 25; G.coinBump = 1; dirty = true;
    sfx('level'); buzz([30, 40, 60, 40, 90]);
    showPraise('LEVEL ' + G.level, 64); flashT = 1; confettiRain();
    for (let i = 0; i < 6; i++) setTimeout(() => firework(BX + Math.random() * CS * N, BY + Math.random() * CS * N * .8), i * 170);
    doShake(8); doPunch(1);
    if (G.level >= 8) award('level8');
    if (cfg.timer === 'action' || cfg.timer === 'hyper') G.bar = Math.min(1, G.bar + .35);
    if (!cfg.noReset) {
      await tween(300, p => { const f = (Math.floor(p * 6) % 2 === 0) ? 1 : 0; eachGem(g => { g.f = f; }); });
      eachGem(g => sparksAt(g.x + CS / 2, g.y + CS / 2, PAL[Math.min(g.t, NT - 1)].b, 4, 4));
      await refreshBoard();
    } else {
      await wait(250);
    }
    checkUnlocks();
  }

  async function gameOver(title, reason) {
    if (!G || G.over) return;
    G.over = true; sel = null; hintMove = null;
    clearRun();
    noteBest(); checkUnlocks(); persist();
    sfx(title === 'BOOM!' ? 'boom' : 'over');
    await wait(500);
    const b = bestOf(G.cfg.id), id = G.cfg.id;
    dlg = {
      title: title || 'GAME OVER',
      lines: [reason || '', 'Score: ' + G.score, 'Best: ' + b.score],
      btns: [{ label: 'Retry', fn: () => newGame(id), hue: HUE_GOLD }, { label: 'Menu', fn: toMenu, hue: HUE_BLUE }]
    };
  }

  async function afterMove() {
    const cfg = G.cfg;
    G.moves++;
    if (cfg.bombs) {
      let boom = false;
      eachGem(g => { if (g.bomb > 0) { g.bomb--; if (g.bomb === 0) boom = true; } });
      if (boom) {
        addFlash(BX + CS * N / 2, BY + CS * N / 2, CS * 9, '255,80,60', 40); flashT = 1; doShake(16, 700); sfx('boom');
        eachGem(g => shatter(g.x + CS / 2, g.y + CS / 2, '#ff5040', 3));
        await wait(500);
        await gameOver('BOOM!', '폭탄이 터졌습니다'); return;
      }
      if (G.moves % 7 === 0) spawnBomb();
    }
    if (cfg.bfly) {
      const ate = await butterflyStep();
      if (ate) { sfx('boom'); doShake(10); await gameOver('GAME OVER', '반딧불이가 거미에게 잡혔습니다'); return; }
      if (G.moves % 6 === 0) spawnButterfly();
      if (findMatches().cells.size) await resolve({ pref: new Set() });
    }
    if (cfg.gravity) { G.grav = (G.grav + 1) % 4; showPraise(['↓', '←', '↑', '→'][G.grav] + ' GRAVITY', 36); }
    if (cfg.quest && G.mission) {
      const ms = G.mission; ms.movesLeft--;
      if (ms.prog >= ms.target) { await missionComplete(); }
      else if (ms.movesLeft <= 0) { await missionFail(); }
      if (G.over) return;
    }
    if (G.timeUp) { await gameOver('TIME UP!', cfg.timer === 'lightning' ? '시간 종료' : '타이머 소진'); return; }
    if (cfg.lvl && G.pts >= 300 * G.level) await levelUp();
    if (G.over) return;
    if (!cfg.twist && !findSwap()) {
      if (cfg.dead === 'over') await gameOver('GAME OVER', '더 이상 둘 수 없습니다');
      else await shuffleBoard();
    }
  }

  // ───────────────────────── 게임 시작 / 종료 ─────────────────────────
  function clearInteraction() { dlg = null; armed = null; sel = null; hintMove = null; twistSel = null; idle = 0; down = null; pressBtn = null; }
  async function newGame(id) {
    const cfg = modeById(id);
    if (!cfg) return;
    clearInteraction(); clearFx();
    G = { cfg, score: 0, level: 1, pts: 0, moves: 0, combo: 0, over: false, busy: true, started: false, timeUp: false,
      dispScore: 0, dispBar: 0, bump: 0, grav: 0, time: 60, bar: 1, spd: 1, spdMeter: 0, lives: 3, qn: 1, mission: null, bfTick: 0, zenAcc: 0, lastTick: 0 };
    screen = 'game';
    save.stats.plays++; dirty = true;
    if (cfg.quest) G.mission = genMission(1);
    ensureBg();
    await fillFall();
    if (cfg.bfly) { spawnButterfly(); spawnButterfly(); }
    if (cfg.bombs) { /* 첫 폭탄은 7수 뒤에 */ }
    G.busy = false; G.started = true; idle = 0;
  }
  function toMenu() {
    clearInteraction(); clearFx();
    if (G) { noteBest(); persist(); }
    clearRun();
    G = null; screen = 'menu'; grid = [];
  }
  // ── 이어하기: 진행 중인 판을 따로 저장해 두었다가 앱이 다시 열릴 때 복원한다 ──
  const RUN_KEY = 'jewel-reboot-run-v1';
  function clearRun() { try { localStorage.removeItem(RUN_KEY); } catch (e) {} }
  function saveRun() {
    if (!G || G.busy || !G.started || screen !== 'game' || grid.length !== N) return;
    if (G.over) { clearRun(); return; }
    try {
      const g = Object.assign({}, G); delete g.cfg;
      const cells = grid.map(row => row.map(o => o ? { t: o.t, sp: o.sp, bomb: o.bomb, bf: o.bf, time: o.time, noTrig: o.noTrig } : null));
      localStorage.setItem(RUN_KEY, JSON.stringify({ v: 1, id: G.cfg.id, G: g, cells }));
    } catch (e) {}
  }
  function restoreRun() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(RUN_KEY) || 'null'); } catch (e) {}
    const cfg = s && s.v === 1 && modeById(s.id);
    if (!cfg || !Array.isArray(s.cells) || s.cells.length !== N || !s.cells.every(r => Array.isArray(r) && r.length === N)) { clearRun(); return false; }
    clearInteraction(); clearFx();
    G = Object.assign({}, s.G, { cfg, busy: false, started: true, over: false, timeUp: false });
    grid = s.cells.map((row, r) => row.map((o, c) => { if (!o) return null; const g = mkGem(o.t, r, c); g.sp = o.sp || null; g.bomb = o.bomb | 0; g.bf = o.bf | 0; g.time = o.time | 0; g.noTrig = !!o.noTrig; return g; }));
    if (grid.some(row => row.some(o => !o))) { G = null; grid = []; clearRun(); return false; }
    screen = 'game';
    ensureBg();
    dlg = settingsDlg('PAUSED', true);
    return true;
  }
  function askQuit() {
    if (!G || G.busy) return;
    if (G.over || G.score === 0) { toMenu(); return; }
    dlg = { title: 'Quit', lines: ['메뉴로 돌아갈까요?', '진행 중인 게임은 종료됩니다.'],
      btns: [{ label: 'Yes', fn: toMenu, hue: HUE_GREEN }, { label: 'No', fn: () => { dlg = null; }, hue: HUE_BLUE }] };
  }
  function showHint() {
    if (!canAct()) return;
    hintMove = findMove(); idle = 0;
  }

  // 게임 진행 중 매 프레임 갱신 (타이머, 속도 게이지 등)
  function updateGame(dt, now) {
    if (!G) return;
    const cfg = G.cfg;
    const d = G.score - G.dispScore;
    G.dispScore = Math.abs(d) < 1 ? G.score : G.dispScore + d * Math.min(1, .18 * dt);
    if (G.bump > 0) G.bump = Math.max(0, G.bump - .06 * dt);
    const tp = barTarget();
    G.dispBar += (tp - G.dispBar) * Math.min(1, .15 * dt);
    if (Math.abs(tp - G.dispBar) < .002) G.dispBar = tp;

    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const o = grid[r] && grid[r][c];
      if (!o) continue;
      if (o.land) { o.land *= Math.pow(.86, dt); if (o.land < .02) o.land = 0; }
      if (!G.busy && o.x !== undefined) { o.x = cx(c); o.y = cy(r); }
    }
    const run = G.started && !G.over && !dlg && screen === 'game';
    if (!run) return;
    if (cfg.timer === 'lightning') {
      G.time -= dt / 60;
      G.spdMeter -= dt / 60 * .18;
      if (G.spdMeter < 0) { if (G.spd > 1) { G.spd--; G.spdMeter = .7; } else G.spdMeter = 0; }
      if (G.time <= 10 && Math.ceil(G.time) !== G.lastTick) { G.lastTick = Math.ceil(G.time); if (G.time > 0) sfx('tick'); }
      if (G.time <= 0) { G.time = 0; G.timeUp = true; }
    } else if (cfg.timer === 'action' || cfg.timer === 'hyper') {
      const rate = (cfg.timer === 'hyper' ? .05 : .03) * (1 + .18 * (G.level - 1));
      G.bar -= rate * dt / 60;
      if (G.bar < .25 && Math.floor(now / 500) !== G.lastTick) { G.lastTick = Math.floor(now / 500); sfx('tick'); }
      if (G.bar <= 0) { G.bar = 0; G.timeUp = true; }
    }
    if (G.timeUp && !G.busy) gameOver('TIME UP!', cfg.timer === 'lightning' ? '시간 종료' : '타이머 소진');
    if (cfg.id === 'zen') {
      G.zenAcc += dt / 60;
      if (G.zenAcc >= 1) { const s = Math.floor(G.zenAcc); G.zenAcc -= s; save.stats.zenSec += s; dirty = true; if (save.stats.zenSec >= 300) award('zen'); }
    }
    if (!G.busy && glints.length < (lowQ ? 2 : 5) && Math.random() < .035 * dt) glints.push({ r: rnd(N), c: rnd(N), t0: now, dur: 420 });
    if (!G.busy && !hintMove) {
      idle += dt / 60;
      if (idle > IDLE_HINT_SEC) hintMove = findMove();
    }
  }

  // ───────────────────────── 렌더링: 보석 ─────────────────────────
  function aura(x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, r * .2, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }
  function drawHyper(x, y, sz, now) {
    const r = sz * .47;
    aura(x, y, r * 1.8, '190,150,255', .55 + .2 * Math.sin(now / 160));
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = '#12122e'; ctx.fill();
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a0 = i * Math.PI * 2 / n + now / 900;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * .9, a0, a0 + Math.PI * 2 / n); ctx.closePath();
      ctx.fillStyle = 'hsl(' + ((now / 6 + i * 45) % 360) + ',95%,58%)'; ctx.fill();
    }
    const g = ctx.createRadialGradient(-r * .25, -r * .3, 0, 0, 0, r);
    g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.45, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.beginPath(); ctx.arc(0, 0, r * .9, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * .1); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(0, 0, r * .96, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; star4(ctx, r * .35, r * .4, r * .28); ctx.fill();
    ctx.restore();
  }
  function drawFlameIcon(x, y, sz, now, ph) {
    const s = sz * .3 * (1 + .09 * Math.sin(now / 90 + ph));
    ctx.save(); ctx.translate(x, y + s * .08);
    const path = k => {
      ctx.beginPath(); ctx.moveTo(0, -s * 1.15 * k);
      ctx.quadraticCurveTo(s * .95 * k, -s * .15 * k, s * .55 * k, s * .62 * k);
      ctx.quadraticCurveTo(0, s * 1.1 * k, -s * .55 * k, s * .62 * k);
      ctx.quadraticCurveTo(-s * .95 * k, -s * .15 * k, 0, -s * 1.15 * k); ctx.closePath();
    };
    const g = ctx.createLinearGradient(0, -s, 0, s);
    g.addColorStop(0, '#fff6a8'); g.addColorStop(.5, '#ff9a1a'); g.addColorStop(1, '#e0300a');
    path(1); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = Math.max(1.5, s * .14); ctx.strokeStyle = 'rgba(80,10,0,.8)'; ctx.stroke();
    path(.5); ctx.fillStyle = '#fffbd0'; ctx.fill();
    ctx.restore();
  }
  function drawStarIcon(x, y, sz, now, ph) {
    const s = sz * .36;
    ctx.save(); ctx.translate(x, y); ctx.rotate(now / 700 + ph);
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = lowQ ? 0 : s * .8;
    ctx.fillStyle = '#ffffff'; star4(ctx, 0, 0, s * 1.15); ctx.fill();
    ctx.rotate(Math.PI / 4); star4(ctx, 0, 0, s * .8); ctx.fill();
    ctx.shadowBlur = 0; ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = 'rgba(80,100,255,.55)'; star4(ctx, 0, 0, s * .45); ctx.fill();
    ctx.restore();
  }
  function drawNovaIcon(x, y, sz, now, ph) {
    const s = sz * .42;
    aura(x, y, s * 2.2, '255,230,150', .6 + .25 * Math.sin(now / 120 + ph));
    ctx.save(); ctx.translate(x, y); ctx.rotate(now / 500);
    ctx.strokeStyle = 'rgba(255,250,220,.95)'; ctx.lineWidth = Math.max(1.5, s * .1);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * .35, Math.sin(a) * s * .35); ctx.lineTo(Math.cos(a) * s * 1.2, Math.sin(a) * s * 1.2); ctx.stroke(); }
    ctx.restore();
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * .75);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.6, '#ffe58a'); g.addColorStop(1, 'rgba(255,170,40,.2)');
    ctx.beginPath(); ctx.arc(x, y, s * .75, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1.5, s * .1); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, s * .9 + Math.sin(now / 150) * s * .08, 0, Math.PI * 2); ctx.stroke();
  }
  function drawClockIcon(x, y, sz, now) {
    const r = sz * .22;
    aura(x, y, sz * .7, '255,220,100', .5 + .2 * Math.sin(now / 200));
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fill();
    ctx.lineWidth = Math.max(2, r * .28); ctx.strokeStyle = '#e0a010'; ctx.stroke();
    ctx.lineWidth = Math.max(1.5, r * .2); ctx.strokeStyle = '#402800'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - r * .62); ctx.moveTo(x, y); ctx.lineTo(x + r * .45, y + r * .15); ctx.stroke();
  }
  function drawBombIcon(x, y, sz, now, n) {
    const r = sz * .27, pulse = .5 + .5 * Math.sin(now / (n <= 3 ? 90 : 220));
    aura(x, y, sz * .8, '255,50,40', (n <= 3 ? .7 : .4) * (.5 + pulse * .5));
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10,10,20,.92)'; ctx.fill();
    ctx.lineWidth = Math.max(2, r * .22); ctx.strokeStyle = 'rgba(255,' + (80 + pulse * 100 | 0) + ',60,1)'; ctx.stroke();
    txt(String(n), x, y + 1, { size: r * 1.3, align: 'center', shadow: false, color: n <= 3 ? '#ff9a9a' : '#ffffff' });
  }
  function drawFirefly(x, y, sz, now, ph) {
    const flap = .3 + .7 * Math.abs(Math.sin(now / 70 + ph)), s = sz * .4, pulse = .6 + .4 * Math.sin(now / 260 + ph);
    aura(x, y + s * .35, s * 1.8, '190,255,110', .5 * pulse + .2);
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(235,250,255,.8)'; ctx.strokeStyle = 'rgba(40,60,50,.7)'; ctx.lineWidth = Math.max(1, s * .07);
    for (const sd of [-1, 1]) { ctx.save(); ctx.scale(sd * flap, 1); ctx.beginPath(); ctx.ellipse(s * .55, -s * .42, s * .5, s * .8, -.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore(); }
    ctx.fillStyle = '#26301f'; ctx.beginPath(); ctx.ellipse(0, -s * .3, s * .22, s * .38, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(0, s * .5, 0, 0, s * .5, s * .6); g.addColorStop(0, '#f6ffc0'); g.addColorStop(.55, '#b8f060'); g.addColorStop(1, '#5aa020');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, s * .45, s * .34, s * .52, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#26301f'; ctx.lineWidth = Math.max(1.5, s * .08); ctx.beginPath(); ctx.moveTo(-s * .1, -s * .62); ctx.quadraticCurveTo(-s * .3, -s * .9, -s * .5, -s * .85); ctx.moveTo(s * .1, -s * .62); ctx.quadraticCurveTo(s * .3, -s * .9, s * .5, -s * .85); ctx.stroke();
    ctx.restore();
  }
  function drawGem(o, hb, extra, now) {
    const x = o.x + CS / 2, y = o.y + CS / 2, sz = GS * o.s * extra;
    if (sz < 1) return;
    const sq = o.land || 0, lw = 1 + .12 * sq, lh = 1 - .12 * sq;
    if (o.sp === 'flame') aura(x, y, sz * .95, '255,150,40', .5 + .2 * Math.sin(now / 120 + o.ph));
    else if (o.sp === 'star') aura(x, y, sz * .95, '255,255,255', .4 + .2 * Math.sin(now / 150 + o.ph));
    if (o.t === HYPER) drawHyper(x, y, sz, now);
    else {
      const spr = SPR[o.t] && SPR[o.t][(o.f || hb) ? 1 : 0];
      if (spr) ctx.drawImage(spr, x - sz * lw / 2, y + sz / 2 - sz * lh, sz * lw, sz * lh);
    }
    if (o.sp === 'flame') drawFlameIcon(x, y, sz, now, o.ph);
    else if (o.sp === 'star') drawStarIcon(x, y, sz, now, o.ph);
    else if (o.sp === 'nova') drawNovaIcon(x, y, sz, now, o.ph);
    if (o.time) drawClockIcon(x, y, sz, now);
    if (o.bomb > 0) drawBombIcon(x, y, sz, now, o.bomb);
    if (o.bf) drawFirefly(x, y, sz, now, o.ph);
  }

  // ───────────────────────── 렌더링: 게임 화면 ─────────────────────────
  function barTarget() {
    const c = G.cfg;
    if (c.timer === 'lightning') return clamp(G.time / 60, 0, 1);
    if (c.timer === 'action' || c.timer === 'hyper') return clamp(G.bar, 0, 1);
    if (c.quest && G.mission) return clamp(G.mission.prog / G.mission.target, 0, 1);
    return clamp(G.pts / (300 * G.level), 0, 1);
  }
  const fmt = n => Math.round(n).toLocaleString('en-US');

  // 클릭 영역 등록 + 눌림 상태
  function hitArea(id, x, y, w, h, fn, modal) {
    const btn = { id: id + '@' + Math.round(x) + ',' + Math.round(y), x, y, w, h, fn, modal: !!modal };
    uiButtons.push(btn);
    return !!(pressBtn && pressBtn.id === btn.id);
  }
  function addButton(x, y, w, h, label, fn, hue, modal, glowA) {
    const pressed = hitArea(label, x, y, w, h, fn, modal);
    glossBtn(x, y, w, h, pressed, hue, glowA);
    txt(label, x + w / 2, y + h / 2 + (pressed ? 2 : 1), { size: Math.min(h * .42, 20 * Math.max(.85, U), fitSize(label, w - 10, h * .42)), align: 'center' });
  }

  function drawTitleText(t, str, now) {
    const size = Math.round(Math.min(t.h * .8, fitSize(str, t.w, t.h * .8)));
    const y = t.y + t.h / 2;
    txt(str, t.x + t.w / 2, y, { size, align: 'center', color: gold(y, size), stroke: { w: size * .14, c: '#3a1a00' } });
    const tw = ctx.measureText(str).width;
    const p = (now / 1900) % 2;
    if (p < 1) {
      const gx = t.x + t.w / 2 - tw / 2 + p * tw, gr = size * .55 * Math.sin(Math.PI * p);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff'; star4(ctx, gx, y - size * .1, gr); ctx.fill(); ctx.restore();
    }
  }

  // ───────────────────────── HUD 부품 ─────────────────────────
  function circleBtn(x, y, d, pressed, glow) {
    const r = d / 2, c = [x + r, y + r + (pressed ? 1 : 0)];
    ctx.save();
    if (glow) { ctx.shadowColor = 'rgba(255,214,110,' + glow + ')'; ctx.shadowBlur = 20 * U; }
    ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
    const g = ctx.createLinearGradient(0, y, 0, y + d);
    g.addColorStop(0, pressed ? '#1e2766' : '#4455b8'); g.addColorStop(1, pressed ? '#3a49a8' : '#1a2060');
    ctx.fillStyle = g; ctx.fill(); ctx.restore();
    ctx.lineWidth = Math.max(2, d * .055); ctx.strokeStyle = glow ? '#ffd86a' : '#c9d3ff'; ctx.beginPath(); ctx.arc(c[0], c[1], r - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(c[0], c[1], r * .82, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    return c;
  }
  function gearIcon(x, y, r, col, hole) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = col;
    for (let i = 0; i < 8; i++) { ctx.save(); ctx.rotate(i * Math.PI / 4); ctx.fillRect(-r * .17, -r, r * .34, r * .5); ctx.restore(); }
    ctx.beginPath(); ctx.arc(0, 0, r * .72, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r * .3, 0, Math.PI * 2); ctx.fillStyle = hole; ctx.fill();
    ctx.restore();
  }
  function drawPlaqueP(p, text) {
    const { x, y, w, h } = p;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#4a5a9a'); g.addColorStop(.5, '#2a3470'); g.addColorStop(1, '#161c52');
    ctx.save(); ctx.shadowColor = 'rgba(150,150,255,.55)'; ctx.shadowBlur = lowQ ? 0 : 10 * U;
    rr(ctx, x, y, w, h, h * .38); ctx.fillStyle = g; ctx.fill(); ctx.restore();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#d6ddff'; rr(ctx, x, y, w, h, h * .38); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,150,255,.75)'; rr(ctx, x + 4, y + 4, w - 8, h - 8, h * .3); ctx.stroke();
    ctx.strokeStyle = '#cdd6ff'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    for (const sd of [-1, 1]) { const ex = sd < 0 ? x : x + w; ctx.beginPath(); ctx.moveTo(ex + sd * h * .02, y + h * .45); ctx.bezierCurveTo(ex + sd * h * .45, y + h * .05, ex + sd * h * .15, y - h * .2, ex + sd * h * .7, y - h * .12); ctx.stroke(); }
    ctx.save(); ctx.translate(x + w / 2, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#5ad2ff'; ctx.fillRect(-h * .09, -h * .09, h * .18, h * .18); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.strokeRect(-h * .09, -h * .09, h * .18, h * .18); ctx.restore();
    for (const sx of [x + h * .3, x + w - h * .3]) {
      ctx.save(); ctx.translate(sx, y + h / 2); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#7fd8ff'; ctx.fillRect(-h * .07, -h * .07, h * .14, h * .14); ctx.restore();
    }
    const s = fitSize(text, w - h * 1.1, h * .46);
    txt(text, x + w / 2, y + h / 2 + 1, { size: s, align: 'center', color: '#eef1ff' });
  }
  function drawCoinPillP(p, now) {
    const { x, y, w, h } = p, bump = G && G.coinBump ? G.coinBump : 0;
    glassPanel(x, y, w, h, 45);
    const r = h * .34 * (1 + .25 * bump), cxp = x + h * .55, cyp = y + h / 2;
    const g = ctx.createLinearGradient(0, cyp - r, 0, cyp + r); g.addColorStop(0, '#fff3a0'); g.addColorStop(.5, '#ffc83a'); g.addColorStop(1, '#c47a0c');
    ctx.beginPath(); ctx.arc(cxp, cyp, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * .16); ctx.strokeStyle = '#8a5200'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cxp, cyp, r * .58, 0, Math.PI * 2); ctx.lineWidth = Math.max(1, r * .12); ctx.strokeStyle = 'rgba(138,82,0,.7)'; ctx.stroke();
    const s = fitSize(fmt(save.coins), w - h * 1.05, h * .5);
    txt(fmt(save.coins), x + w - h * .22, cyp + 1, { size: s, align: 'right', color: bump ? '#fff6b0' : '#ffe27a' });
  }
  function drawHeartsRow(x, y, s, n, align) {
    for (let i = 0; i < 3; i++) heart(x + (align === 'right' ? -(2 - i) * s * 1.15 : i * s * 1.15), y, s, i < n ? '#ff4d6d' : 'rgba(255,255,255,.22)');
  }
  function mainStat() {
    const c = G.cfg;
    if (c.quest) return { label: 'MOVES:', value: String(G.mission ? G.mission.movesLeft : 0) };
    if (c.timer === 'lightning') return { label: 'TIME:', value: String(Math.max(0, Math.ceil(G.time))), warn: G.time <= 10 };
    return { label: 'LEVEL:', value: String(G.level) };
  }
  function hudInfo() {
    const c = G.cfg, best = { label: 'BEST', value: fmt(bestOf(c.id).score) };
    if (c.quest) return [{ label: 'MISSION', value: String(G.qn) }, { label: 'MOVES', value: String(G.mission ? G.mission.movesLeft : 0) }, { label: 'LIVES', hearts: G.lives }];
    if (c.timer === 'lightning') return [{ label: 'TIME', value: String(Math.max(0, Math.ceil(G.time))), warn: G.time <= 10 }, { label: 'SPEED', value: 'x' + G.spd, good: G.spd > 1 }, best];
    return [{ label: 'LEVEL', value: String(G.level) }, best];
  }
  function drawChips(r) {
    const items = hudInfo(), g = 6, w = (r.w - g * (items.length - 1)) / items.length;
    items.forEach((it, i) => {
      const x = r.x + i * (w + g);
      rr(ctx, x, r.y, w, r.h, r.h / 2); ctx.fillStyle = 'rgba(24,26,80,.8)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(170,160,255,.55)'; ctx.stroke();
      const ls = Math.max(9, r.h * .36);
      txt(it.label, x + r.h * .5, r.y + r.h / 2 + 1, { size: ls, color: '#aeb6ff', shadow: false });
      if (it.hearts !== undefined) drawHeartsRow(x + w - r.h * .5, r.y + r.h / 2, r.h * .34, it.hearts, 'right');
      else {
        const vs = fitSize(it.value, w - r.h - ctx.measureText(it.label).width, r.h * .5);
        txt(it.value, x + w - r.h * .5, r.y + r.h / 2 + 1, { size: vs, align: 'right', color: it.warn ? '#ff8a8a' : it.good ? '#7dffb0' : '#ffe27a', shadow: false });
      }
    });
  }
  function drawIcon(kind, x, y, s, now) {
    ctx.save(); ctx.translate(x, y);
    if (kind === 'star') {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rad = i % 2 ? s * .22 : s * .5; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
      ctx.closePath(); ctx.fillStyle = '#ffd23c'; ctx.fill(); ctx.lineWidth = Math.max(1, s * .06); ctx.strokeStyle = '#a8680c'; ctx.stroke();
    } else if (kind === 'clock') {
      ctx.beginPath(); ctx.arc(0, 0, s * .42, 0, Math.PI * 2); ctx.fillStyle = '#f4f6ff'; ctx.fill(); ctx.lineWidth = Math.max(1.5, s * .1); ctx.strokeStyle = '#e0a010'; ctx.stroke();
      ctx.strokeStyle = '#402800'; ctx.lineWidth = Math.max(1.5, s * .07); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * .26); ctx.moveTo(0, 0); ctx.lineTo(s * .17, s * .07); ctx.stroke();
    } else if (kind === 'heart') heart(0, 0, s * .5, '#ff4d6d');
    else if (kind === 'bolt') {
      ctx.beginPath(); ctx.moveTo(s * .1, -s * .5); ctx.lineTo(-s * .3, s * .08); ctx.lineTo(0, s * .08); ctx.lineTo(-s * .1, s * .5); ctx.lineTo(s * .3, -s * .1); ctx.lineTo(0, -s * .1); ctx.closePath();
      ctx.fillStyle = '#7fe8ff'; ctx.fill(); ctx.lineWidth = Math.max(1, s * .05); ctx.strokeStyle = '#0a5a7a'; ctx.stroke();
    } else if (kind === 'trophy') {
      ctx.fillStyle = '#ffd23c'; ctx.beginPath(); ctx.moveTo(-s * .3, -s * .4); ctx.lineTo(s * .3, -s * .4); ctx.quadraticCurveTo(s * .3, s * .1, 0, s * .15); ctx.quadraticCurveTo(-s * .3, s * .1, -s * .3, -s * .4); ctx.fill();
      ctx.fillRect(-s * .06, s * .12, s * .12, s * .2); ctx.fillRect(-s * .22, s * .32, s * .44, s * .1);
    }
    ctx.restore();
  }
  function goalRows() {
    const c = G.cfg, rows = [], best = { icon: 'trophy', text: 'BEST', sub: fmt(bestOf(c.id).score) };
    if (c.quest && G.mission) {
      const ms = G.mission;
      if (ms.kind === 'collect') rows.push({ gem: ms.color, text: 'x ' + Math.max(0, ms.target - ms.prog) });
      else rows.push({ icon: 'star', text: ms.desc, sub: Math.min(ms.prog, ms.target) + '/' + ms.target });
      rows.push({ icon: 'heart', text: 'LIVES', sub: 'x ' + G.lives });
    } else if (c.timer === 'lightning') {
      rows.push({ icon: 'bolt', text: 'SPEED', sub: 'x' + G.spd }); rows.push(best);
    } else {
      rows.push({ icon: 'star', text: 'LEVEL ' + G.level, sub: fmt(G.pts) + '/' + fmt(300 * G.level) }); rows.push(best);
    }
    return rows;
  }

  function drawProgP(pg, now) {
    const cfg = G.cfg;
    rr(ctx, pg.x, pg.y, pg.w, pg.h, pg.h / 2); ctx.fillStyle = '#080a2a'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#8f9cf0'; ctx.stroke();
    const p = clamp(G.dispBar, 0, 1);
    const timer = cfg.timer === 'lightning' || cfg.timer === 'action' || cfg.timer === 'hyper';
    const lowBar = timer && p < .22;
    if (p > 0.005) {
      const fw = Math.max(pg.h - 4, (pg.w - 6) * p);
      const g = ctx.createLinearGradient(0, pg.y, 0, pg.y + pg.h);
      if (lowBar) { const f = .5 + .5 * Math.sin(now / 90); g.addColorStop(0, f > .5 ? '#ffb0a0' : '#ff7060'); g.addColorStop(.5, '#ff3a2a'); g.addColorStop(1, '#9a1208'); }
      else if (timer) { g.addColorStop(0, '#9ff0ff'); g.addColorStop(.5, '#19b8e8'); g.addColorStop(1, '#0a6a9a'); }
      else if (cfg.quest) { g.addColorStop(0, '#ffe58a'); g.addColorStop(.5, '#f0b020'); g.addColorStop(1, '#9a6008'); }
      else { g.addColorStop(0, '#8fe8ff'); g.addColorStop(.5, '#3a8cff'); g.addColorStop(1, '#2438b8'); }
      ctx.save();
      if (p > .95 || lowBar) { ctx.shadowColor = lowBar ? '#ff5040' : '#7fb0ff'; ctx.shadowBlur = 14 * U; }
      rr(ctx, pg.x + 3, pg.y + 3, fw, pg.h - 6, (pg.h - 6) / 2); ctx.fillStyle = g; ctx.fill();
      ctx.restore();
      ctx.save(); rr(ctx, pg.x + 3, pg.y + 3, fw, pg.h - 6, (pg.h - 6) / 2); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = pg.h * .3;
      const off = (now / 30) % (pg.h * 1.2);
      for (let x = pg.x - pg.h + off; x < pg.x + fw + pg.h; x += pg.h * 1.2) { ctx.beginPath(); ctx.moveTo(x, pg.y + pg.h); ctx.lineTo(x + pg.h, pg.y); ctx.stroke(); }
      ctx.restore();
      rr(ctx, pg.x + 6, pg.y + pg.h * .26, Math.max(6, fw - 6), pg.h * .22, 2); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fill();
    }
    // 양 끝 보석 장식
    for (const [dx, col] of [[pg.x + pg.h * .1, '#4aa8ff'], [pg.x + pg.w - pg.h * .1, '#3be08a']]) {
      ctx.save(); ctx.translate(dx, pg.y + pg.h / 2); ctx.rotate(Math.PI / 4);
      const s = pg.h * .5; ctx.fillStyle = col; ctx.fillRect(-s / 2, -s / 2, s, s); ctx.lineWidth = 1.5; ctx.strokeStyle = '#e6ecff'; ctx.strokeRect(-s / 2, -s / 2, s, s); ctx.restore();
    }
    let cap = Math.round(p * 100) + '%';
    if (cfg.quest && G.mission) { const ms = G.mission; cap = ms.desc + '  ' + Math.min(ms.prog, ms.target) + '/' + ms.target; }
    else if (cfg.lvl) cap = 'LV ' + G.level + '  ·  ' + Math.round(p * 100) + '%' + (cfg.gravity ? '  ' + ['↓', '←', '↑', '→'][G.grav] : '');
    txt(cap, pg.x + pg.w / 2, pg.y + pg.h / 2 + 1, { size: fitSize(cap, pg.w - pg.h * 2, pg.h * .62), align: 'center', shadow: true });
  }

  function scoreText(r, gold_) {
    const lab = gold_ ? 'SCORE:' : 'SCORE:';
    const ls = Math.min(r.h * .3, 26), vs = Math.min(r.h * .5, fitSize(fmt(G.dispScore), r.w * .9, r.h * .5));
    txt(lab, r.x + r.w / 2, r.y + r.h * .24, { size: ls, align: 'center', weight: gold_ ? 'bold' : 'italic bold', color: gold_ ? '#ffd23c' : '#c79bff', shadow: false, font: gold_ ? null : 'Georgia,"Times New Roman",serif' });
    ctx.save(); ctx.translate(r.x + r.w / 2, r.y + r.h * .68); const sc = 1 + .12 * G.bump; ctx.scale(sc, sc);
    if (!lowQ) { ctx.shadowColor = gold_ ? 'rgba(255,220,120,.6)' : 'rgba(140,190,255,.95)'; ctx.shadowBlur = 16 * U; }
    const gg = ctx.createLinearGradient(0, -vs / 2, 0, vs / 2); gg.addColorStop(0, '#ffffff'); gg.addColorStop(1, '#bfcaff');
    txt(fmt(G.dispScore), 0, 0, { size: vs, align: 'center', color: gg, shadow: false });
    ctx.restore();
  }

  function drawHud(now) {
    const cfg = G.cfg, T = L.top;
    if (G.coinBump > 0) G.coinBump = Math.max(0, G.coinBump - .03);
    const gp = hitArea('gear', T.gear.x, T.gear.y, T.gear.d, T.gear.d, openPause);
    const c = circleBtn(T.gear.x, T.gear.y, T.gear.d, gp, 0);
    gearIcon(c[0], c[1], T.gear.d * .3, '#e6ecff', '#2a3480');
    drawPlaque(T.plaque, cfg.name);
    drawCoinPill(T.coin, now);
    drawProg(L.prog, now);
    if (!L.land) {
      scoreText(L.score, false);
      drawChips(L.chips);
    } else {
      drawPanel(now);
    }
  }

  // ───────────────────────── 부스터 버튼 ─────────────────────────
  function drawBoosterIcon(k, x, y, d, now) {
    ctx.save(); ctx.translate(x, y);
    if (k === 'wand') {
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#6a4a2a'; rr(ctx, -d * .035, -d * .12, d * .07, d * .42, d * .03); ctx.fill();
      ctx.fillStyle = '#ffffff'; rr(ctx, -d * .035, -d * .12, d * .07, d * .08, d * .02); ctx.fill();
      ctx.restore(); ctx.save(); ctx.translate(x + d * .17, y - d * .17);
      ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = lowQ ? 0 : 10 * U; ctx.fillStyle = '#fff0a0'; star4(ctx, 0, 0, d * .27 * (1 + .1 * Math.sin(now / 160))); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#ff9be8'; star4(ctx, -d * .22, -d * .12, d * .08); ctx.fill(); ctx.fillStyle = '#9be8ff'; star4(ctx, d * .06, d * .2, d * .07); ctx.fill();
    } else if (k === 'bomb') {
      const r = d * .24;
      const g = ctx.createRadialGradient(-r * .35, -r * .35, r * .1, 0, 0, r);
      g.addColorStop(0, '#6a708a'); g.addColorStop(.4, '#22263a'); g.addColorStop(1, '#07080f');
      ctx.beginPath(); ctx.arc(0, d * .05, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(-r * .4, d * .05 - r * .45, r * .22, r * .12, -.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#cfa56a'; ctx.lineWidth = Math.max(1.5, d * .035); ctx.beginPath(); ctx.moveTo(r * .35, d * .05 - r * .85); ctx.quadraticCurveTo(r * .9, d * .05 - r * 1.5, r * 1.15, d * .05 - r * 1.15); ctx.stroke();
      ctx.fillStyle = '#ffcf3a'; star4(ctx, r * 1.15, d * .05 - r * 1.15, d * .1 * (1 + .3 * Math.sin(now / 80))); ctx.fill();
    } else if (k === 'burst') {
      const s = d * .4;
      [[-.17, .06, 1], [.17, .06, 4], [0, -.12, 0]].forEach(([ox, oy, t]) => { const sp = SPR[t] && SPR[t][0]; if (sp) ctx.drawImage(sp, ox * d - s / 2, oy * d - s / 2, s, s); });
    } else {
      const r = d * .2;
      ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = lowQ ? 0 : 8 * U;
      const g = ctx.createRadialGradient(-r * .3, -r * .3, 0, 0, 0, r); g.addColorStop(0, '#fffbd0'); g.addColorStop(1, '#ffc83a');
      ctx.beginPath(); ctx.arc(0, -d * .04, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#c9d3ff'; rr(ctx, -r * .55, r * .85 - d * .04, r * 1.1, r * .7, r * .15); ctx.fill();
      ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = Math.max(1.5, d * .03);
      for (let i = -2; i <= 2; i++) { const a = -Math.PI / 2 + i * .55; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 1.3, -d * .04 + Math.sin(a) * r * 1.3); ctx.lineTo(Math.cos(a) * r * 1.65, -d * .04 + Math.sin(a) * r * 1.65); ctx.stroke(); }
    }
    ctx.restore();
  }
  function drawBoosters(now) {
    const ks = ['wand', 'bomb', 'burst', 'hint'];
    if (L.boostLabel) {
      const b = L.boostLabel;
      txt(armed ? BOOST[armed].tip : 'BOOSTERS', b.x + b.w / 2, b.y + b.h / 2, { size: fitSize(armed ? BOOST[armed].tip : 'BOOSTERS', b.w, b.h * .85), align: 'center', color: armed ? '#ffd86a' : '#c9d0ff', shadow: false });
    }
    ks.forEach((k, i) => {
      const b = L.boost[i];
      const fn = k === 'hint' ? showHint : () => useBooster(k);
      const pressed = hitArea('boost-' + k, b.x, b.y, b.d, b.d, fn);
      const on = armed === k, pulse = .5 + .5 * Math.sin(now / 160);
      const hintGlow = k === 'hint' && !G.busy && !G.over && !dlg && !hintMove && idle > 5 ? .5 + .5 * Math.sin(now / 200) : 0;
      const c = circleBtn(b.x, b.y, b.d, pressed, on ? .6 + .4 * pulse : hintGlow);
      drawBoosterIcon(k, c[0], c[1], b.d, now);
      if (k !== 'hint') {
        const n = save.boosters[k] | 0, br = b.d * .2, bx = b.x + b.d * .84, by = b.y + b.d * .84;
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fillStyle = n ? '#1a2060' : '#1c7a3a'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#c9d3ff'; ctx.stroke();
        txt(n ? 'x' + n : '+', bx, by + 1, { size: br * 1.05, align: 'center', shadow: false });
      }
    });
  }

  function drawSpider(x, y, s, now) {
    ctx.save(); ctx.translate(x, y + Math.sin(now / 300) * s * .1);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -y); ctx.lineTo(0, 0); ctx.stroke();
    ctx.strokeStyle = '#150a20'; ctx.lineWidth = Math.max(1.5, s * .12);
    for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sd * s * (.7 + i * .1), (i - 1.5) * s * .35 - s * .2); ctx.lineTo(sd * s * (1 + i * .1), (i - 1.5) * s * .5 + s * .3); ctx.stroke();
    }
    ctx.fillStyle = '#2a1238'; ctx.beginPath(); ctx.ellipse(0, 0, s * .5, s * .62, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff3a3a'; ctx.beginPath(); ctx.arc(-s * .16, -s * .15, s * .09, 0, Math.PI * 2); ctx.arc(s * .16, -s * .15, s * .09, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBoard(now) {
    let ox = 0, oy = 0;
    if (shake) {
      const t = (now - shake.t0) / shake.dur;
      if (t >= 1) shake = null;
      else { const m = shake.mag * (1 - t); ox = (Math.random() - .5) * 2 * m; oy = (Math.random() - .5) * 2 * m; }
    }
    const bw = CS * N, mx = BX + bw / 2, my = BY + bw / 2, z = 1 + punch * .045;
    ctx.save();
    ctx.translate(ox + mx, oy + my); ctx.scale(z, z); ctx.translate(-mx, -my);
    ctx.save();
    rr(ctx, BX, BY, bw, bw, 14 * U); ctx.clip();

    const pulse = .5 + .5 * Math.sin(now / 160);
    const hintOn = hintMove && (Math.floor(now / 260) % 2 === 0);
    const hq = hintMove && hintMove.quad;
    let danger = false;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const o = grid[r] && grid[r][c];
      if (!o) continue;
      let hb = false, ex = 1;
      if (hintMove && !hq && ((hintMove.a.r === r && hintMove.a.c === c) || (hintMove.b.r === r && hintMove.b.c === c))) {
        ex = 1 + .05 * pulse; aura(o.x + CS / 2, o.y + CS / 2, CS * .6, '255,120,220', .25 + .25 * pulse);
      }
      if (sel && sel.r === r && sel.c === c) { ex = 1.07 + .03 * pulse; aura(o.x + CS / 2, o.y + CS / 2, CS * .62, '90,210,255', .45); }
      if (o.bf && r <= 1) danger = true;
      drawGem(o, hb, ex, now);
    }
    if (G.cfg.bfly) {
      if (danger) { const lg = ctx.createLinearGradient(0, BY, 0, BY + CS * 2); lg.addColorStop(0, 'rgba(255,40,40,' + (.25 + .25 * pulse) + ')'); lg.addColorStop(1, 'rgba(255,40,40,0)'); ctx.fillStyle = lg; ctx.fillRect(BX, BY, bw, CS * 2); }
      drawSpider(BX + bw / 2, BY + CS * .28, CS * .22, now);
    }
    if (sel) brackets(cx(sel.c) + 3, cy(sel.r) + 3, CS - 6, CS - 6, '#5ad2ff', 1);
    if (hintMove && !hq && hintOn) for (const q of [hintMove.a, hintMove.b]) brackets(cx(q.c) + 3, cy(q.r) + 3, CS - 6, CS - 6, '#ff6fd8', 1);
    // Twist: 회전 커서 / 힌트
    const tq = hq ? hintMove.quad : twistSel;
    if (G.cfg.twist && tq) {
      const x = cx(tq.c - 1) + 3, y = cy(tq.r - 1) + 3;
      rr(ctx, x, y, CS * 2 - 6, CS * 2 - 6, 10 * U);
      ctx.lineWidth = Math.max(2, 3 * U); ctx.strokeStyle = hq ? 'rgba(255,236,140,' + (.5 + .5 * pulse) + ')' : 'rgba(255,255,255,.55)'; ctx.stroke();
      if (hq) { ctx.fillStyle = 'rgba(255,236,140,' + (.1 + .15 * pulse) + ')'; ctx.fill(); }
    }
    // 보석 위 반짝임
    ctx.globalCompositeOperation = 'lighter';
    for (let i = glints.length - 1; i >= 0; i--) {
      const gl = glints[i], p = (now - gl.t0) / gl.dur;
      if (p >= 1) { glints.splice(i, 1); continue; }
      const s = Math.sin(Math.PI * p) * CS * .34;
      ctx.fillStyle = '#fff'; star4(ctx, cx(gl.c) + CS * .32, cy(gl.r) + CS * .3, s); ctx.fill();
    }
    if (!lowQ && !G.busy) {
      const t = (now % 7000) / 7000;
      if (t < .22) {
        const p = t / .22, bx = BX + (p * 1.7 - .35) * bw;
        const lg = ctx.createLinearGradient(bx - bw * .16, BY, bx + bw * .16, BY + bw * .35);
        lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.5, 'rgba(255,255,255,.2)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = lg; ctx.fillRect(BX, BY, bw, bw);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();   // 보드 클립 해제
    drawFxBoard(now);
    ctx.restore();   // 줌/흔들림 해제

    for (const c of conf) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.globalAlpha = Math.min(1, c.life * 2);
      ctx.fillStyle = c.col; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.restore();
    }
    for (const p of popups) {
      const age = (now - p.t0) / 1000, sc = Math.min(1, .5 + age * 4), size = (p.big ? 32 : 26) * Math.max(.8, U);
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sc, sc); ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
      txt(p.txt, 0, 0, { size, align: 'center', color: gold(0, size), stroke: { w: size * .15, c: '#3a2200' } });
      ctx.restore();
    }
    if (praise) {
      const t = now - praise.t0;
      if (t > praise.dur) praise = null;
      else {
        const sc = t < 260 ? .3 + ease(t / 260) * .85 : (t < 380 ? 1.15 - (t - 260) / 120 * .15 : 1);
        const a = t > praise.dur - 350 ? Math.max(0, (praise.dur - t) / 350) : 1;
        const px = BX + bw / 2, py = BY + bw / 2 - CS * .35;
        if (!lowQ) {
          ctx.save(); ctx.translate(px, py); ctx.rotate(now / 2200); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * .5;
          const R = Math.max(W, H) * .5, rg = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
          rg.addColorStop(0, 'rgba(255,230,140,.55)'); rg.addColorStop(1, 'rgba(255,230,140,0)'); ctx.fillStyle = rg;
          for (let i = 0; i < 14; i++) { const a0 = i * Math.PI * 2 / 14; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); ctx.lineTo(Math.cos(a0 + .13) * R, Math.sin(a0 + .13) * R); ctx.fill(); }
          ctx.restore();
        }
        ctx.save(); ctx.translate(px, py); ctx.scale(sc, sc); ctx.globalAlpha = a;
        if (!lowQ) { ctx.shadowColor = 'rgba(255,200,60,.9)'; ctx.shadowBlur = 24 * U; }
        const ps = Math.min(praise.size, fitSize(praise.text, bw * .94 / sc, praise.size));
        txt(praise.text, 0, 0, { size: ps, align: 'center', color: gold(0, ps), stroke: { w: ps * .15, c: '#4a1a00' } });
        ctx.restore();
      }
    }
    if (flashT > 0) { ctx.fillStyle = 'rgba(255,250,220,' + (flashT * .55) + ')'; ctx.fillRect(0, 0, W, H); }
    // 시간이 거의 없을 때 화면 가장자리 경고
    if (G.cfg.timer && !G.over && barTarget() < .2) {
      const a = (.18 + .14 * Math.sin(now / 110));
      const rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .4, W / 2, H / 2, Math.max(W, H) * .75);
      rg.addColorStop(0, 'rgba(255,0,0,0)'); rg.addColorStop(1, 'rgba(255,30,30,' + a + ')');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }
  }

  function toggleSound() {
    sound = !sound; save.sound = sound; dirty = true; if (sound) { unlockAudio(); sfx('ui'); }
  }

  function drawVersion(v) {
    v = v || L.ver;
    try { ctx.letterSpacing = '1px'; } catch (e) {}
    txt('v' + VERSION + '  ·  ' + BUILD, v.x + v.w / 2, v.y + v.h / 2 - 1, { size: 11, align: 'center', color: '#6b70c4', weight: '600', shadow: false });
    try { ctx.letterSpacing = '0px'; } catch (e) {}
  }

  // ───────────────────────── 렌더링: 메뉴 / 보조 화면 ─────────────────────────
  function gridFit(n, area, gap, aspect) {
    let best = null;
    for (let cols = 1; cols <= 6; cols++) {
      const rows = Math.ceil(n / cols);
      const cw = (area.w - gap * (cols - 1)) / cols, ch = (area.h - gap * (rows - 1)) / rows;
      const sc = Math.min(cw / aspect, ch);
      if (!best || sc > best.sc) best = { cols, rows, cw: Math.floor(cw), ch: Math.floor(ch), sc };
    }
    return best;
  }

  function subHeader(title, now) {
    drawTitleText(SL.title, title, now);
    addButton(SL.back.x, SL.back.y, SL.back.w, SL.back.h, 'Back', () => { screen = 'menu'; }, HUE_BLUE);
    drawVersion(ML.ver);
  }

  function drawBadges(now) {
    subHeader('BADGES', now);
    const a = SL.area, g = Math.round(SL.gap * .8);
    const f = gridFit(BADGES.length, a, g, 2.4);
    BADGES.forEach((b, i) => {
      const row = Math.floor(i / f.cols), col = i % f.cols;
      const x = a.x + col * (f.cw + g), y = a.y + row * (f.ch + g), got = !!save.badges[b.id];
      glassPanel(x, y, f.cw, f.ch, got ? 48 : 230);
      if (!got) { ctx.fillStyle = 'rgba(0,0,10,.35)'; rr(ctx, x, y, f.cw, f.ch, 12 * U); ctx.fill(); }
      const ir = Math.min(f.ch * .32, f.cw * .13), ix = x + ir + f.cw * .04, iy = y + f.ch / 2;
      ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fillStyle = got ? gold(iy, ir * 2) : '#3a4070'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = got ? '#fff2a0' : '#6a70a8'; ctx.stroke();
      if (got) { ctx.fillStyle = '#fff'; star4(ctx, ix, iy, ir * .75); ctx.fill(); } else lockIcon(ix, iy - ir * .1, ir * .8, '#8a90c8');
      const tx = ix + ir + f.cw * .04, tw = x + f.cw - tx - 6;
      const ns = fitSize(b.name, tw, Math.min(f.ch * .3, 18)), ds = Math.max(9, Math.min(f.ch * .22, 13));
      txt(b.name, tx, iy - f.ch * .16, { size: ns, color: got ? '#ffe58a' : '#9aa0d8', shadow: false });
      const dl = wrapLines(b.desc, tw, ds, '600').slice(0, 2);
      dl.forEach((ln, k) => txt(ln, tx, iy + f.ch * .12 + k * ds * 1.15, { size: ds, color: got ? '#dfe4ff' : '#8a90c8', weight: '600', shadow: false }));
    });
  }

  function drawRecords(now) {
    subHeader('RECORDS', now);
    const a = SL.area, st = save.stats;
    const statLines = ['플레이 ' + st.plays + '회  ·  보석 ' + fmt(st.gems) + '개 제거  ·  최대 연쇄 ' + st.maxCombo,
      'Ember ' + st.flame + '  ·  Beacon ' + st.star + '  ·  Prism ' + st.hyper + '  ·  Aurora ' + st.nova];
    const sh = Math.min(34, a.h * .12) , rowsH = a.h - sh * 2 - SL.gap;
    const rh = Math.min(Math.floor(rowsH / (MODES.length + 1)), 44);
    const fs = Math.max(10, Math.min(rh * .5, 18));
    txt('MODE', a.x + 8, a.y + rh / 2, { size: fs * .8, color: '#8fd8ff', shadow: false });
    txt('BEST', a.x + a.w * .62, a.y + rh / 2, { size: fs * .8, color: '#8fd8ff', align: 'right', shadow: false });
    txt(cfgLabel(), a.x + a.w - 8, a.y + rh / 2, { size: fs * .8, color: '#8fd8ff', align: 'right', shadow: false });
    MODES.forEach((m, i) => {
      const y = a.y + (i + 1) * rh, unl = isUnlocked(m), b = bestOf(m.id);
      if (i % 2 === 0) { ctx.fillStyle = 'rgba(120,130,255,.12)'; ctx.fillRect(a.x, y, a.w, rh); }
      txt(m.name, a.x + 8, y + rh / 2, { size: fs, color: unl ? 'hsl(' + m.hue + ',90%,82%)' : '#6a70a8', shadow: false });
      txt(unl ? fmt(b.score) : '—', a.x + a.w * .62, y + rh / 2, { size: fs, align: 'right', color: unl ? '#ffd84a' : '#6a70a8', shadow: false });
      txt(unl ? String(b.level) : '', a.x + a.w - 8, y + rh / 2, { size: fs, align: 'right', color: '#dfe4ff', shadow: false });
    });
    const sy = a.y + (MODES.length + 1) * rh + SL.gap;
    statLines.forEach((ln, i) => txt(ln, a.x + a.w / 2, sy + sh * .5 + i * sh, { size: fitSize(ln, a.w - 10, Math.min(sh * .55, 14), '600'), align: 'center', color: '#9fd0ff', weight: '600', shadow: false }));
  }
  const cfgLabel = () => 'LV / MISSION';

  let helpPage = 0;
  const HELP = [
    [['기본 규칙', '인접한 두 보석을 탭-탭 또는 드래그로 바꿔 같은 색 3개 이상을 이으세요. 연쇄가 이어질수록 점수 배율이 올라갑니다. 힌트는 한동안 가만히 있으면 자동으로 나옵니다.'],
     ['특수 보석', '4개 일렬 → Ember: 주변 3×3 폭발\nL·T·十 모양 → Beacon: 가로·세로 줄 제거\n5개 일렬 → Prism: 바꾼 색을 전부 제거 (두 개를 맞바꾸면 판 전체)\n6개 이상 → Aurora: 3줄 십자 폭발'],
     ['특수 아이템', '시계 보석: 매치하면 시간 +5초 (SPRINT)\n폭탄 보석: 숫자가 0이 되기 전에 매치해 해체 (SWIRL)\n반딧불이: 맨 위(거미)에 닿기 전에 매치해서 구출 (FIREFLIES)']],
    MODES.map(m => [m.name, m.desc + (m.secret ? '   [해금: ' + m.unlock + ']' : '')])
  ];
  function drawHelp(now) {
    subHeader('HOW TO PLAY', now);
    const a = SL.area, pages = HELP.length, items = HELP[helpPage];
    const pgBtnW = 70, pgBtnH = Math.min(34, SL.back.h);
    addButton(a.x + a.w - pgBtnW, SL.title.y + SL.title.h * .5 - pgBtnH / 2, pgBtnW, pgBtnH, (helpPage + 1) + '/' + pages + ' ▶', () => { helpPage = (helpPage + 1) % pages; }, HUE_GOLD);
    let size = 17, total = 0, rows = [];
    for (; size >= 9; size -= 1) {
      rows = []; total = 0;
      for (const [h, body] of items) {
        rows.push({ h: true, s: h }); total += size * 1.5;
        for (const ln of wrapLines(body, a.w - 12, size, '600')) { rows.push({ s: ln }); total += size * 1.3; }
        total += size * .6;
      }
      if (total <= a.h) break;
    }
    let y = a.y + Math.max(0, (a.h - total) / 2);
    for (const r of rows) {
      if (r.h) { y += size * .3; txt(r.s, a.x + 6, y + size * .6, { size: size * 1.05, color: '#ffd84a', shadow: false }); y += size * 1.2; }
      else { txt(r.s, a.x + 6, y + size * .6, { size, color: '#dfe4ff', weight: '600', shadow: false }); y += size * 1.3; }
    }
  }

  // ───────────────────────── 렌더링: 토스트 / 대화상자 ─────────────────────────
  function drawToasts(now) {
    const t = toasts[0];
    if (!t || !t.t0) return;
    const age = now - t.t0, w = Math.min(W - 24, 380), h = Math.round(Math.max(48, Math.min(W, H) * .13));
    const slide = age < 260 ? ease(age / 260) : age > t.dur - 260 ? ease(Math.max(0, (t.dur - age) / 260)) : 1;
    const x = (W - w) / 2, y = -h + (h + 10) * slide;
    glassPanel(x, y, w, h, t.kind === 'badge' ? 48 : t.kind === 'unlock' ? 140 : 0);
    const ir = h * .3, ix = x + ir + 14, iy = y + h / 2;
    ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fillStyle = t.kind === 'lock' ? '#3a4070' : gold(iy, ir * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff2a0'; ctx.stroke();
    if (t.kind === 'lock') lockIcon(ix, iy - ir * .1, ir * .8, '#c9d0ff'); else { ctx.fillStyle = '#fff'; star4(ctx, ix, iy, ir * .8); ctx.fill(); }
    const tx = ix + ir + 12, tw = x + w - tx - 10;
    txt(t.kind === 'badge' ? 'BADGE  ' + t.title : t.title, tx, y + h * .36, { size: fitSize(t.kind === 'badge' ? 'BADGE  ' + t.title : t.title, tw, h * .3), color: '#ffe58a' });
    txt(t.sub, tx, y + h * .70, { size: fitSize(t.sub, tw, h * .24, '600'), color: '#dfe4ff', weight: '600', shadow: false });
  }

  function drawDialog() {
    if (!dlg) return;
    ctx.fillStyle = 'rgba(3,5,20,.7)'; ctx.fillRect(0, 0, W, H);
    const k = Math.max(.8, Math.min(1.3, U)), n = dlg.btns.length, stack = !!dlg.stack;
    const bh = 44 * k, bgap = 10 * k, btnsH = stack ? n * bh + (n - 1) * bgap : bh;
    const w = Math.min(W - 24, 330 * k), h = 66 * k + dlg.lines.length * 30 * k + 14 * k + btnsH + 22 * k;
    const x = (W - w) / 2, y = (H - h) / 2;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#34408f'); g.addColorStop(1, '#121850');
    ctx.save(); ctx.shadowColor = 'rgba(190,140,255,.7)'; ctx.shadowBlur = 26 * k;
    rr(ctx, x, y, w, h, 18 * k); ctx.fillStyle = g; ctx.fill(); ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = '#d9b45a'; rr(ctx, x, y, w, h, 18 * k); ctx.stroke();
    rr(ctx, x + 6, y + 6, w - 12, 44 * k, 12 * k); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill();
    txt(dlg.title, W / 2, y + 34 * k, { size: fitSize(dlg.title, w - 30, 28 * k), align: 'center', color: gold(y + 34 * k, 28 * k), stroke: { w: 4, c: '#3a2200' } });
    dlg.lines.forEach((ln, i) => txt(ln, W / 2, y + (82 + i * 30) * k, { size: fitSize(ln, w - 24, 19 * k), align: 'center' }));
    let by = y + h - 22 * k - btnsH;
    if (stack) {
      const bw = w - 60 * k;
      for (const b of dlg.btns) { addButton(x + 30 * k, by, bw, bh, b.label, b.fn, b.hue || HUE_BLUE, true); by += bh + bgap; }
    } else {
      const bw = Math.min(130 * k, (w - 30 * k - (n - 1) * 14) / n), gap = 14, total = n * bw + (n - 1) * gap;
      let bx = x + (w - total) / 2;
      for (const b of dlg.btns) { addButton(bx, by, bw, bh, b.label, b.fn, b.hue || HUE_BLUE, true); bx += bw + gap; }
    }
  }

  // ───────────────────────── 렌더링: 합성 ─────────────────────────
  function drawAmbient(now) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (!lowQ) {
      const blobs = [['255,80,200', 0], ['60,160,255', 2.1], ['120,255,200', 4.2]];
      for (const [col, ph] of blobs) {
        const bx = W * (.5 + .38 * Math.sin(now / 5200 + ph)), by = H * (.5 + .34 * Math.cos(now / 6300 + ph * 1.3));
        const rg = ctx.createRadialGradient(bx, by, 0, bx, by, W * .7);
        rg.addColorStop(0, 'rgba(' + col + ',' + (.10 + energy * .08) + ')'); rg.addColorStop(1, 'rgba(' + col + ',0)');
        ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      }
    }
    const FC = ['255,230,140', '140,255,230', '255,160,230', '170,190,255'];
    motes.forEach((m, i) => {
      const a = .25 + .6 * (.5 + .5 * Math.sin(now / 600 + m.ph)), r = m.r * 5 * Math.max(.7, U);
      const rg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, r);
      rg.addColorStop(0, 'rgba(' + FC[i % 4] + ',' + a + ')'); rg.addColorStop(1, 'rgba(' + FC[i % 4] + ',0)');
      ctx.fillStyle = rg; ctx.fillRect(m.x - r, m.y - r, r * 2, r * 2);
    });
    // 에너지가 높으면 중심에서 퍼지는 스피드 라인
    if (energy > .25 && !lowQ && screen === 'game') {
      const mx = BX + CS * N / 2, my = BY + CS * N / 2;
      ctx.globalAlpha = Math.min(.5, energy * .3); ctx.strokeStyle = 'rgba(200,210,255,.8)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * Math.PI * 2 + now / 3000, r0 = Math.max(W, H) * (.35 + .1 * Math.sin(now / 200 + i)), r1 = r0 + Math.max(W, H) * (.15 + energy * .2);
        ctx.beginPath(); ctx.moveTo(mx + Math.cos(a) * r0, my + Math.sin(a) * r0); ctx.lineTo(mx + Math.cos(a) * r1, my + Math.sin(a) * r1); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    uiButtons.length = 0;
    ensureBg();
    ctx.drawImage(bgCache.cv, 0, 0, W, H);
    drawAmbient(now); drawDust(now);
    if (screen === 'menu') drawMenu(now);
    else if (screen === 'badges') drawBadges(now);
    else if (screen === 'records') drawRecords(now);
    else if (screen === 'help') drawHelp(now);
    else if (screen === 'game' && G) { drawHud(now); drawBoard(now); drawBoosters(now); drawGameNav(now); drawVersion(); }
    drawToasts(now);
    drawDialog();
    drawCrt(now);
  }

  // ───────────────────────── 타이틀 / 메뉴 화면 ─────────────────────────
  function navIcon(kind, x, y, s, col) {
    const UIK = { trophy: 'trophy', shop: 'shop', chart: 'arrows' }[kind], uim = UIK && uiOk(UIK);
    if (uim) { const h = s * 1.08, w = h * uim.naturalWidth / uim.naturalHeight; ctx.drawImage(uim, x - w / 2, y - h / 2, w, h); return; }
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, s * .09); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (kind === 'home') {
      ctx.beginPath(); ctx.moveTo(0, -s * .46); ctx.lineTo(s * .5, 0); ctx.lineTo(s * .36, 0); ctx.lineTo(s * .36, s * .42); ctx.lineTo(-s * .36, s * .42); ctx.lineTo(-s * .36, 0); ctx.lineTo(-s * .5, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(10,12,50,.85)'; ctx.fillRect(-s * .1, s * .12, s * .2, s * .3);
    } else if (kind === 'shop') {
      rr(ctx, -s * .42, -s * .12, s * .84, s * .54, s * .08); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * .5, -s * .12); ctx.lineTo(-s * .38, -s * .44); ctx.lineTo(s * .38, -s * .44); ctx.lineTo(s * .5, -s * .12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(10,12,50,.8)'; ctx.fillRect(-s * .12, s * .08, s * .24, s * .34);
    } else if (kind === 'sound' || kind === 'mute') {
      ctx.beginPath(); ctx.moveTo(-s * .5, -s * .16); ctx.lineTo(-s * .26, -s * .16); ctx.lineTo(0, -s * .4); ctx.lineTo(0, s * .4); ctx.lineTo(-s * .26, s * .16); ctx.lineTo(-s * .5, s * .16); ctx.closePath(); ctx.fill();
      if (kind === 'sound') { ctx.beginPath(); ctx.arc(0, 0, s * .26, -.9, .9); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * .46, -.9, .9); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(s * .14, -s * .18); ctx.lineTo(s * .5, s * .18); ctx.moveTo(s * .5, -s * .18); ctx.lineTo(s * .14, s * .18); ctx.stroke(); }
    } else if (kind === 'gear') gearIcon(0, 0, s * .5, col, 'rgba(14,16,60,.95)');
    else if (kind === 'trophy') {
      ctx.beginPath(); ctx.moveTo(-s * .3, -s * .42); ctx.lineTo(s * .3, -s * .42); ctx.quadraticCurveTo(s * .3, s * .1, 0, s * .16); ctx.quadraticCurveTo(-s * .3, s * .1, -s * .3, -s * .42); ctx.fill();
      ctx.beginPath(); ctx.arc(-s * .3, -s * .24, s * .14, Math.PI * .5, Math.PI * 1.5); ctx.stroke(); ctx.beginPath(); ctx.arc(s * .3, -s * .24, s * .14, -Math.PI * .5, Math.PI * .5); ctx.stroke();
      ctx.fillRect(-s * .06, s * .14, s * .12, s * .2); ctx.fillRect(-s * .24, s * .34, s * .48, s * .1);
    } else if (kind === 'chart') {
      ctx.fillRect(-s * .42, s * .02, s * .2, s * .4); ctx.fillRect(-s * .1, -s * .2, s * .2, s * .62); ctx.fillRect(s * .22, -s * .44, s * .2, s * .86);
    } else if (kind === 'help') {
      ctx.beginPath(); ctx.arc(0, 0, s * .46, 0, Math.PI * 2); ctx.fill();
      txt('?', 0, s * .03, { size: s * .7, align: 'center', color: 'rgba(14,16,60,.95)', shadow: false });
    }
    ctx.restore();
  }
  function drawNav(r, items, now) {
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, 'rgba(48,42,122,.9)'); g.addColorStop(1, 'rgba(16,16,58,.94)');
    ctx.save(); ctx.shadowColor = 'rgba(150,120,255,.5)'; ctx.shadowBlur = lowQ ? 0 : 14 * U;
    rr(ctx, r.x, r.y, r.w, r.h, r.h * .3); ctx.fillStyle = g; ctx.fill(); ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(190,175,255,.75)'; rr(ctx, r.x, r.y, r.w, r.h, r.h * .3); ctx.stroke();
    const w = r.w / items.length;
    items.forEach((it, i) => {
      const x = r.x + i * w;
      const pressed = hitArea('nav-' + it.label, x, r.y, w, r.h, it.fn);
      if (pressed) { rr(ctx, x + 4, r.y + 4, w - 8, r.h - 8, r.h * .25); ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fill(); }
      const is = Math.min(r.h * .5, w * .5), icx = x + w / 2, icy = r.y + r.h * .4 + (pressed ? 1 : 0);
      navIcon(it.icon, icx, icy, is, it.col || '#ffd86a');
      txt(it.label, icx, r.y + r.h * .8, { size: fitSize(it.label, w - 6, Math.max(10, r.h * .19)), align: 'center', color: '#dfe4ff', weight: '600', shadow: false });
      if (it.badge) txt(it.badge, icx + is * .55, r.y + r.h * .2, { size: Math.max(9, r.h * .17), align: 'left', color: '#8fffb0', shadow: false });
    });
  }

  // 모드 아이콘 — 시안의 실제 보석 이미지를 조합해서 만든다
  function gimg(t, x, y, sz, rot) {
    const im = GEM_IMGS[t]; if (!(im && im.complete && im.naturalWidth)) return;
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
    if (!lowQ) { ctx.shadowColor = PAL[t].b; ctx.shadowBlur = sz * .16; }
    ctx.drawImage(im, -sz / 2, -sz / 2, sz, sz); ctx.restore();
  }
  function drawModeIcon(id, x, y, s, now, locked) {
    const bob = Math.sin(now / 700 + x * .01) * s * .02;
    ctx.save(); ctx.translate(x, y + bob); if (locked) ctx.globalAlpha = .4;
    if (id === 'classic') {
      aura(0, 0, s * .8, '255,120,230', .3); aura(-s * .2, s * .1, s * .6, '90,220,255', .3); aura(s * .2, -s * .1, s * .6, '255,230,120', .25);
      gimg(5, 0, 0, s * .98, 0);
      ctx.fillStyle = '#fff'; star4(ctx, s * .36, -s * .36, s * .16 * (1 + .2 * Math.sin(now / 250))); ctx.fill(); star4(ctx, -s * .4, s * .3, s * .1); ctx.fill();
    } else if (id === 'zen') {
      ctx.strokeStyle = 'rgba(120,220,255,.55)'; ctx.lineWidth = Math.max(1.5, s * .03);
      for (let i = 0; i < 2; i++) { ctx.globalAlpha *= .8; ctx.beginPath(); ctx.ellipse(0, s * .44, s * (.36 + i * .14), s * (.09 + i * .035), 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = locked ? .4 : 1;
      gimg(4, 0, s * .22, s * .6, 0); gimg(0, 0, -s * .1, s * .46, 0); gimg(3, 0, -s * .36, s * .3, 0);
    } else if (id === 'lightning') {
      aura(0, 0, s * .8, '90,150,255', .45);
      gimg(0, -s * .06, s * .04, s * .8, 0);
      ctx.beginPath(); ctx.moveTo(s * .3, -s * .56); ctx.lineTo(s * .0, -s * .02); ctx.lineTo(s * .17, -s * .02); ctx.lineTo(s * .02, s * .52); ctx.lineTo(s * .42, -s * .1); ctx.lineTo(s * .24, -s * .1); ctx.closePath();
      ctx.save(); ctx.shadowColor = '#ffd84a'; ctx.shadowBlur = lowQ ? 0 : s * .2; const bg = ctx.createLinearGradient(0, -s * .5, 0, s * .5); bg.addColorStop(0, '#fff7b0'); bg.addColorStop(1, '#ffb400'); ctx.fillStyle = bg; ctx.fill(); ctx.restore();
      ctx.lineWidth = Math.max(1.5, s * .035); ctx.strokeStyle = '#b86a00'; ctx.stroke();
      ctx.fillStyle = '#fff'; star4(ctx, -s * .4, -s * .36, s * .11); ctx.fill();
    } else if (id === 'action') {
      gimg(1, -s * .06, -s * .04, s * .76, 0);
      const cx_ = s * .22, cy_ = s * .24, r = s * .27;
      ctx.beginPath(); ctx.arc(cx_, cy_, r, 0, Math.PI * 2); ctx.fillStyle = '#f4f6ff'; ctx.fill(); ctx.lineWidth = Math.max(2, s * .07); ctx.strokeStyle = '#ff8a2a'; ctx.stroke();
      ctx.fillStyle = '#ff8a2a'; ctx.fillRect(cx_ - s * .04, cy_ - r - s * .09, s * .08, s * .08);
      ctx.fillStyle = 'rgba(255,138,42,.85)'; ctx.beginPath(); ctx.moveTo(cx_, cy_); ctx.arc(cx_, cy_, r * .8, -Math.PI / 2, -Math.PI / 2 + 1.3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2a2a50'; ctx.lineWidth = Math.max(1.5, s * .04); ctx.lineCap = 'round'; const a = now / 450; ctx.beginPath(); ctx.moveTo(cx_, cy_); ctx.lineTo(cx_ + Math.sin(a) * r * .7, cy_ - Math.cos(a) * r * .7); ctx.stroke();
    } else if (id === 'quest') {
      ctx.save(); ctx.rotate(-.12);
      rr(ctx, -s * .44, -s * .3, s * .88, s * .66, s * .06); const g = ctx.createLinearGradient(0, -s * .3, 0, s * .36); g.addColorStop(0, '#f8e6b4'); g.addColorStop(1, '#d6ad62'); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = Math.max(1.5, s * .035); ctx.strokeStyle = '#9a6a24'; ctx.stroke();
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * s * .44, s * .03, s * .07, s * .34, 0, 0, Math.PI * 2); ctx.fillStyle = '#e8c680'; ctx.fill(); ctx.stroke(); }
      ctx.setLineDash([s * .05, s * .045]); ctx.strokeStyle = '#b0501c'; ctx.beginPath(); ctx.moveTo(-s * .32, s * .2); ctx.quadraticCurveTo(-s * .1, -s * .1, s * .1, s * .12); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      gimg(2, s * .12, -s * .08, s * .6, .08);
      ctx.fillStyle = '#fff'; star4(ctx, s * .42, -s * .32, s * .12); ctx.fill();
    } else if (id === 'twist') {
      const q = s * .5;
      gimg(0, -q * .5, -q * .5, q, 0); gimg(1, q * .5, -q * .5, q, 0); gimg(4, q * .5, q * .5, q, 0); gimg(2, -q * .5, q * .5, q, 0);
      ctx.save(); if (!lowQ) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = s * .1; }
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = Math.max(2.5, s * .07); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, s * .5, -2.5, .5); ctx.stroke();
      const ax = Math.cos(.5) * s * .5, ay = Math.sin(.5) * s * .5; ctx.beginPath(); ctx.moveTo(ax + s * .02, ay - s * .13); ctx.lineTo(ax, ay); ctx.lineTo(ax - s * .13, ay - s * .03); ctx.stroke(); ctx.restore();
    } else if (id === 'endless') {
      const g = ctx.createLinearGradient(-s * .5, 0, s * .5, 0); g.addColorStop(0, '#5ae0ff'); g.addColorStop(.5, '#b070ff'); g.addColorStop(1, '#ff6fd8');
      ctx.save(); if (!lowQ) { ctx.shadowColor = '#b070ff'; ctx.shadowBlur = s * .14; }
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(3, s * .09); ctx.lineCap = 'round'; ctx.beginPath();
      for (let i = 0; i <= 56; i++) { const t = i / 56 * Math.PI * 2, d = 1 + Math.sin(t) * Math.sin(t); const px = Math.cos(t) / d * s * .54, py = Math.sin(t) * Math.cos(t) / d * s * .66; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke(); ctx.restore();
      gimg(0, -s * .27, 0, s * .3, 0); gimg(4, s * .27, 0, s * .3, 0);
    } else if (id === 'twilight') {
      ctx.save(); ctx.translate(-s * .05, 0); ctx.beginPath(); ctx.arc(0, 0, s * .46, -Math.PI / 2, Math.PI / 2, true); ctx.quadraticCurveTo(-s * .64, 0, 0, -s * .46);
      const mg = ctx.createLinearGradient(-s * .46, 0, s * .1, 0); mg.addColorStop(0, '#ffd86a'); mg.addColorStop(1, '#fff3c4');
      if (!lowQ) { ctx.shadowColor = '#ffe9a0'; ctx.shadowBlur = s * .18; } ctx.fillStyle = mg; ctx.fill(); ctx.restore();
      gimg(3, s * .2, s * .06, s * .52, .15);
      ctx.fillStyle = '#fff'; star4(ctx, s * .36, -s * .34, s * .13); ctx.fill(); star4(ctx, s * .06, -s * .42, s * .07); ctx.fill();
    } else if (id === 'hyper') {
      drawFlameIcon(0, s * .02, s * 1.8, now, 0);
      gimg(1, 0, s * .08, s * .54, 0);
    } else if (id === 'bfly') {
      drawFirefly(0, -s * .1, s * 1.6, now, 0);
    } else {
      navIcon('trophy', 0, 0, s * 1.05, '#ffd23c');
      gimg(5, 0, -s * .16, s * .34, 0);
    }
    ctx.restore();
  }

  function drawModeCard(id, c, now, big) {
    const m = modeById(id), unl = isUnlocked(m);
    const pressed = hitArea('mode-' + id, c.x, c.y, c.w, c.h, () => {
      if (unl) { unlockAudio(); newGame(id); }
      else { sfx('bad'); toast('lock', m.name + ' 잠김', '해금 조건: ' + m.unlock); }
    });
    const off = pressed ? 2 : 0, y = c.y + off;
    glassPanel(c.x, y, c.w, c.h, m.hue);
    if (unl && !lowQ) {   // 가장자리를 훑는 빛
      const p = ((now / 2600 + c.x * .001) % 1), px = c.x + p * (c.w + c.h) - c.h * .5;
      ctx.save(); rr(ctx, c.x, y, c.w, c.h, 12 * U); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
      const lg = ctx.createLinearGradient(px - c.h, 0, px + c.h * .3, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.7, 'rgba(255,255,255,.12)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg; ctx.fillRect(c.x, y, c.w, c.h); ctx.restore();
    }
    const pad = Math.max(8, c.h * .12), ir = c.h * (big ? .34 : .3), ix = c.x + pad + ir, iy = y + c.h / 2;
    if (unl) aura(ix, iy, ir * 1.5, '150,130,255', .35);
    drawModeIcon(id, ix, iy, ir * 2, now, !unl);
    const tx = ix + ir + pad, tw = c.x + c.w - tx - pad - (unl ? 0 : c.h * .3);
    const ns = Math.min(c.h * (big ? .3 : .27), fitSize(m.name, tw, c.h * (big ? .3 : .27)));
    const gg = ctx.createLinearGradient(0, y + c.h * .1, 0, y + c.h * .1 + ns);
    if (unl) { gg.addColorStop(0, 'hsl(' + m.hue + ',90%,88%)'); gg.addColorStop(1, 'hsl(' + ((m.hue + 25) % 360) + ',85%,64%)'); } else { gg.addColorStop(0, '#b8bde8'); gg.addColorStop(1, '#6a70a8'); }
    txt(m.name, tx, y + c.h * (big ? .3 : .28), { size: ns, color: gg });
    const ds = Math.max(9, Math.min(c.h * .17, tw * .085, 16));
    const lines = wrapLines(unl ? m.desc : m.name === '' ? '' : m.desc, tw, ds, '600').slice(0, unl ? 2 : 1);
    if (unl) lines.forEach((ln, k) => txt(ln, tx, y + c.h * (big ? .56 : .54) + k * ds * 1.25, { size: ds, color: '#cdd3ff', weight: '600', shadow: false }));
    else txt(m.unlock, tx, y + c.h * .74, { size: Math.max(9, Math.min(ds * 1.05, fitSize(m.unlock, tw, ds * 1.05))), color: '#ffd86a', weight: '600', shadow: false });
    if (unl) { const b = bestOf(id); if (b.score) txt('BEST ' + fmt(b.score), c.x + c.w - pad, y + c.h - Math.max(8, c.h * .13), { size: Math.max(9, Math.min(c.h * .15, 14)), align: 'right', color: '#ffd84a', shadow: false }); }
    else { lockIcon(c.x + c.w - pad - c.h * .12, y + c.h * .3, c.h * .26, '#c9c2ff'); ctx.fillStyle = 'rgba(0,0,12,.22)'; rr(ctx, c.x, y, c.w, c.h, 12 * U); ctx.fill(); }
  }

  // 로고: 보석 더미 + 입체 글자
  function drawLogo(r, now) {
    const cxp = r.x + r.w / 2;
    const fs = Math.min(r.h * .27, fitSize('REBOOT', r.w * .9, r.h * .3, 'bold'), r.w * .2);
    const cyp = r.y + r.h * .5, lineH = fs * 1.0;
    const rg = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, Math.max(r.w * .6, r.h * .6));
    rg.addColorStop(0, 'rgba(170,110,255,.38)'); rg.addColorStop(1, 'rgba(170,110,255,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rg; ctx.fillRect(r.x - r.w * .2, r.y - r.h * .2, r.w * 1.4, r.h * 1.4); ctx.restore();
    const s0 = Math.min(r.h * .3, r.w * .19);
    const gems = [
      [1, -2.0, -.15, .8, 0], [2, 2.0, -.15, .8, 1], [3, -2.7, .3, .55, 2], [4, 2.8, .25, .6, 3],
      [0, 0, -1.42, 1.15, 4], [1, -1.05, -1.18, .9, 5], [2, 1.05, -1.18, .9, 6], [5, -3.2, -.5, .48, 7], [4, 3.3, -.6, .5, 8],
      [4, -1.55, 1.55, .78, 9], [0, 1.6, 1.5, .8, 10], [5, 0, 1.75, .88, 11], [1, -.75, 1.3, .6, 12], [2, .85, 1.28, .6, 13], [3, -2.4, 1.15, .5, 14], [1, 2.5, 1.0, .46, 15]
    ];
    const dir = r.h < r.w * .6 ? .75 : 1;
    gems.sort((a, b) => a[3] - b[3]).forEach(([t, dx, dy, sc, ph]) => {
      const im = GEM_IMGS[t]; if (!(im && im.complete && im.naturalWidth)) return;
      const sz = s0 * sc * 1.1, gx = cxp + dx * s0 * 1.02 * dir, gy = cyp + dy * s0 * .9 * dir + Math.sin(now / 800 + ph) * s0 * .045;
      if (gx - sz / 2 < r.x - r.w * .05 || gx + sz / 2 > r.x + r.w * 1.05) return;
      ctx.save(); ctx.translate(gx, gy); ctx.rotate(Math.sin(now / 1300 + ph * 1.7) * .09 + (ph % 3 - 1) * .1);
      ctx.shadowColor = PAL[t].b; ctx.shadowBlur = lowQ ? 0 : sz * .22; ctx.drawImage(im, -sz / 2, -sz / 2, sz, sz); ctx.restore();
    });
    const lines = [['JEWEL', ['#ffffff', '#f2d8ff', '#b98cff']], ['REBOOT', ['#ffffff', '#cfe0ff', '#6d8bff']]];
    ctx.save();
    try { ctx.letterSpacing = Math.round(fs * .04) + 'px'; } catch (e) {}
    lines.forEach(([str, cols], i) => {
      const y = cyp + (i - .5) * lineH * 1.02;
      const fs2 = Math.min(fs, fitSize(str, r.w * .92, fs, 'bold'));
      ctx.font = 'bold ' + Math.round(fs2) + 'px Georgia,"Times New Roman",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.save(); ctx.shadowColor = 'rgba(140,90,255,.95)'; ctx.shadowBlur = lowQ ? 0 : fs2 * .35; ctx.lineWidth = fs2 * .26; ctx.strokeStyle = '#1c0a4a'; ctx.strokeText(str, cxp, y); ctx.restore();
      const og = ctx.createLinearGradient(0, y - fs2 / 2, 0, y + fs2 / 2); og.addColorStop(0, '#ffe9a0'); og.addColorStop(.5, '#e0a63a'); og.addColorStop(1, '#8a4a0c');
      ctx.lineWidth = fs2 * .13; ctx.strokeStyle = og; ctx.strokeText(str, cxp, y);
      const fg = ctx.createLinearGradient(0, y - fs2 / 2, 0, y + fs2 / 2); fg.addColorStop(0, cols[0]); fg.addColorStop(.45, cols[1]); fg.addColorStop(1, cols[2]);
      ctx.fillStyle = fg; ctx.fillText(str, cxp, y);
      const tw = ctx.measureText(str).width, p = ((now / 2100 + i * .35) % 2);
      if (p < 1) { const gx = cxp - tw / 2 + p * tw, gr = fs2 * .5 * Math.sin(Math.PI * p); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff'; star4(ctx, gx, y - fs2 * .12, gr); ctx.fill(); ctx.restore(); }
    });
    ctx.restore();
  }

  function drawMenu(now) {
    if (menuPage === 'more') {
      drawTitleText(SL.title, 'MORE MODES', now);
      ML.moreCards.forEach(c => drawModeCard(c.id, c, now, false));
      addButton(SL.back.x, SL.back.y, SL.back.w, SL.back.h, 'Back', () => { menuPage = 'main'; }, HUE_BLUE);
      drawVersion(ML.ver);
      return;
    }
    drawLogo(ML.logo, now);
    MAIN_IDS.forEach((id, i) => drawModeCard(id, ML.main[i], now, true));
    const mb = ML.more, others = MODES.filter(x => MAIN_IDS.indexOf(x.id) < 0), un = others.filter(isUnlocked).length;
    const pressed = hitArea('more', mb.x, mb.y, mb.w, mb.h, () => { menuPage = 'more'; sfx('ui'); });
    const g = ctx.createLinearGradient(mb.x, 0, mb.x + mb.w, 0); g.addColorStop(0, 'rgba(110,70,230,.92)'); g.addColorStop(1, 'rgba(210,70,190,.92)');
    ctx.save(); ctx.shadowColor = 'rgba(200,110,255,.6)'; ctx.shadowBlur = lowQ ? 0 : 14 * U; rr(ctx, mb.x, mb.y + (pressed ? 2 : 0), mb.w, mb.h, mb.h * .4); ctx.fillStyle = g; ctx.fill(); ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.55)'; rr(ctx, mb.x, mb.y + (pressed ? 2 : 0), mb.w, mb.h, mb.h * .4); ctx.stroke();
    const my = mb.y + mb.h / 2 + (pressed ? 2 : 0), gs = mb.h * .62;
    [0, 1, 3].forEach((t, i) => { const sp = SPR[t] && SPR[t][0]; if (sp) ctx.drawImage(sp, mb.x + mb.h * .25 + i * gs * .5, my - gs / 2, gs, gs); });
    const lx = mb.x + mb.h * .25 + gs * 2.1, lw = mb.x + mb.w - mb.h * .9 - lx, lcx = lx + lw / 2;
    const lab = 'MORE MODES', sub = un + '/' + others.length + ' unlocked';
    txt(lab, lcx, my - mb.h * .1, { size: fitSize(lab, lw, mb.h * .36), align: 'center' });
    txt(sub, lcx, my + mb.h * .27, { size: Math.max(9, Math.min(mb.h * .22, 14)), align: 'center', color: '#f0e0ff', weight: '600', shadow: false });
    txt('›', mb.x + mb.w - mb.h * .5, my - 1, { size: mb.h * .6, align: 'center' });
    const nb = Object.keys(save.badges).length;
    drawNav(ML.nav, [
      { label: 'Badges', icon: 'trophy', fn: () => { screen = 'badges'; }, badge: nb + '/' + BADGES.length },
      { label: 'Records', icon: 'chart', fn: () => { screen = 'records'; }, col: '#8fd8ff' },
      { label: 'Help', icon: 'help', fn: () => { helpPage = 0; screen = 'help'; }, col: '#8fffb0' },
      { label: 'Settings', icon: 'gear', fn: openSettings, col: '#e6ecff' }
    ], now);
    drawVersion(ML.ver);
  }

  // ───────────────────────── 게임 화면 하단 네비 / 상점 ─────────────────────────
  function shopDlg() {
    const mk = k => ({ label: BOOST[k].label + ' +1   (' + BOOST[k].cost + ')', fn: () => buyBooster(k), hue: HUE_GOLD });
    return { title: 'SHOP', lines: ['보유 코인  ' + fmt(save.coins), 'Wand ' + (save.boosters.wand | 0) + '  ·  Bomb ' + (save.boosters.bomb | 0) + '  ·  Burst ' + (save.boosters.burst | 0)],
      btns: [mk('wand'), mk('bomb'), mk('burst'), { label: 'Close', fn: () => { dlg = null; }, hue: HUE_BLUE }], stack: true };
  }
  function buyBooster(k) {
    if (save.coins >= BOOST[k].cost) { save.coins -= BOOST[k].cost; save.boosters[k] = (save.boosters[k] | 0) + 1; dirty = true; sfx('unlock'); dlg = shopDlg(); }
    else { sfx('bad'); buzz(25); toast('lock', '코인이 부족해요', BOOST[k].cost + ' 코인이 필요합니다'); }
  }
  function drawGameNav(now) {
    if (!L.nav) return;
    drawNav(L.nav, [
      { label: 'Menu', icon: 'home', fn: askQuit, col: '#9fd0ff' },
      { label: 'Shop', icon: 'shop', fn: () => { if (canAct()) { armed = null; dlg = shopDlg(); } }, col: '#ff9bd8' },
      { label: 'Sound', icon: sound ? 'sound' : 'mute', fn: toggleSound, col: sound ? '#8fffb0' : '#8a90c8' },
      { label: 'Settings', icon: 'gear', fn: openPause, col: '#e6ecff' }
    ], now);
  }

  // 선택/힌트 모서리 괄호 + 반짝이는 보석 가루
  function brackets(x, y, w, h, col, glow) {
    const l = Math.min(w, h) * .3, lw = Math.max(2, 3 * U);
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (!lowQ) { ctx.shadowColor = col; ctx.shadowBlur = 10 * U * (glow || 1); }
    ctx.beginPath();
    ctx.moveTo(x, y + l); ctx.lineTo(x, y); ctx.lineTo(x + l, y);
    ctx.moveTo(x + w - l, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + l);
    ctx.moveTo(x + w, y + h - l); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - l, y + h);
    ctx.moveTo(x + l, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - l);
    ctx.stroke(); ctx.restore();
  }
  const dust = Array.from({ length: 34 }, (_, i) => ({ x: (i * 7919 % 1000) / 1000, y: (i * 104729 % 1000) / 1000, sp: .012 + (i % 5) * .006, r: 2 + (i % 4), ph: i * 1.7, t: i % 6 }));
  function drawDust(now) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const d of dust) {
      const y = ((d.y + now * d.sp / 1000) % 1) * (H + 20) - 10, x = d.x * W + Math.sin(now / 1400 + d.ph) * 10;
      ctx.globalAlpha = (.3 + .5 * (.5 + .5 * Math.sin(now / 500 + d.ph))) * (lowQ ? .6 : 1);
      ctx.fillStyle = PAL[d.t % NT].l; star4(ctx, x, y, d.r * Math.max(.8, U) * 1.6); ctx.fill();
    }
    ctx.restore();
  }

  // ───────────────────────── 시안 이미지 기반 UI (01b-ui.js) ─────────────────────────
  // 가로 3분할: 양 끝(cap)은 높이에 맞춰 비율 유지, 가운데만 늘린다. ow/oh = 원본 이미지 크기, cap = 원본 좌표
  function slice3(k, ow, oh, capL, capR, x, y, w, h) {
    const im = uiOk(k); if (!im) return false;
    const kx = im.naturalWidth / ow, ky = im.naturalHeight / oh, s = h / oh;
    let cl = capL * s, cr = capR * s;
    if (cl + cr > w) { const f = w / (cl + cr); cl *= f; cr *= f; }
    ctx.drawImage(im, 0, 0, capL * kx, im.naturalHeight, x, y, cl + .5, h);
    ctx.drawImage(im, capL * kx, 0, im.naturalWidth - (capL + capR) * kx, im.naturalHeight, x + cl - .5, y, w - cl - cr + 1, h);
    ctx.drawImage(im, im.naturalWidth - capR * kx, 0, capR * kx, im.naturalHeight, x + w - cr - .5, y, cr + .5, h);
    return true;
  }

  function drawPlaque(p, text) {
    if (!slice3('plaque', 1334, 338, 170, 170, p.x, p.y, p.w, p.h)) return drawPlaqueP(p, text);
    const s = fitSize(text, p.w - p.h * 1.3, p.h * .5);
    const gg = ctx.createLinearGradient(0, p.y + p.h * .25, 0, p.y + p.h * .75); gg.addColorStop(0, '#ffffff'); gg.addColorStop(1, '#c4c9ee');
    txt(text, p.x + p.w / 2, p.y + p.h / 2 + 1, { size: s, align: 'center', color: gg, font: 'Georgia,"Times New Roman",serif', shadow: false });
  }
  function drawCoinPill(p, now) {
    const { x, y, w, h } = p, bump = G && G.coinBump ? G.coinBump : 0;
    if (!slice3('coinchip', 717, 249, 250, 110, x, y, w, h)) return drawCoinPillP(p, now);
    const s = h / 249, tx = x + w - 62 * s, tw = w - (250 + 70) * s;
    const str = fmt(save.coins);
    txt(str, tx, y + h * .5 + 1, { size: fitSize(str, tw, h * .5), align: 'right', color: bump ? '#fff6b0' : '#ffffff', shadow: false });
  }
  function drawProg(pg, now) {
    if (!uiOk('prog')) return drawProgP(pg, now);
    const cfg = G.cfg;
    slice3('prog', 2665, 292, 340, 337, pg.x, pg.y, pg.w, pg.h);
    const s = pg.h / 292, tx = pg.x + 340 * s, tw = pg.w - (340 + 337) * s, ty = pg.y + 68 * s, th = 178 * s;
    const fy = pg.y + 80 * s, fh = 154 * s, fx = tx + 6 * s, fmax = tw - 12 * s;
    const p = clamp(G.dispBar, 0, 1);
    const timer = cfg.timer === 'lightning' || cfg.timer === 'action' || cfg.timer === 'hyper';
    const lowBar = timer && p < .22;
    if (p > .005) {
      const fw = Math.max(fh, fmax * p), r = fh * .42;
      const v = lowBar ? 3 : timer ? 1 : cfg.quest ? 2 : 0, src = FILL_VAR[v] || UI.progfill;
      ctx.save();
      if (!lowBar && p > .95 && !lowQ) { ctx.shadowColor = '#7fd0ff'; ctx.shadowBlur = 10 * U; }
      rr(ctx, fx, fy, fw, fh, r); ctx.clip();
      ctx.drawImage(src, fx, fy, fw, fh);
      if (lowBar) { const f = .5 + .5 * Math.sin(now / 90); ctx.fillStyle = 'rgba(255,120,100,' + (.18 * f) + ')'; ctx.fillRect(fx, fy, fw, fh); }
      ctx.strokeStyle = 'rgba(255,255,255,.13)'; ctx.lineWidth = fh * .3;
      const off = (now / 30) % (fh * 1.2);
      for (let x = fx - fh + off; x < fx + fw + fh; x += fh * 1.2) { ctx.beginPath(); ctx.moveTo(x, fy + fh); ctx.lineTo(x + fh, fy); ctx.stroke(); }
      ctx.restore();
    }
    let cap = Math.round(p * 100) + '%';
    if (cfg.quest && G.mission) { const ms = G.mission; cap = ms.desc + '  ' + Math.min(ms.prog, ms.target) + '/' + ms.target; }
    else if (cfg.lvl) cap = 'LV ' + G.level + '  ·  ' + Math.round(p * 100) + '%' + (cfg.gravity ? '  ' + ['↓', '←', '↑', '→'][G.grav] : '');
    txt(cap, tx + tw / 2, ty + th / 2 + 1, { size: fitSize(cap, tw * .9, th * .66), align: 'center', shadow: true });
  }

  // 가로 화면 장식 패널 (시안의 금색 패널: 위 / 가운데(늘림) / 아래 3분할)
  function drawPanel(now) {
    const p = L.panel, s = p.s, im = uiOk('panel');
    if (!im) { drawPanelP(p); return; }
    const TOP = 560, BOT = 173, MID0 = 700, MID1 = 1000, W0 = 520, H0 = 1403;
    const th = TOP * s, bh = BOT * s, mh = Math.max(0, p.h - th - bh);
    ctx.drawImage(im, 0, 0, W0, TOP, p.x, p.y, p.w, th + .5);
    if (mh > 0) ctx.drawImage(im, 0, MID0, W0, MID1 - MID0, p.x, p.y + th - .5, p.w, mh + 1);
    ctx.drawImage(im, 0, H0 - BOT, W0, BOT, p.x, p.y + p.h - bh, p.w, bh);
    const cx0 = p.x + p.w / 2, gold = '#ead38c';
    // SCORE
    txt('SCORE:', cx0, p.y + 103 * s, { size: 44 * s, align: 'center', color: gold, shadow: false });
    const sv = fmt(G.dispScore), vs = fitSize(sv, 400 * s, 80 * s);
    ctx.save(); ctx.translate(cx0, p.y + 178 * s); const sc = 1 + .12 * G.bump; ctx.scale(sc, sc);
    txt(sv, 0, 0, { size: vs, align: 'center', color: '#ffffff', shadow: false }); ctx.restore();
    // LEVEL / MOVES / TIME
    const ms = mainStat();
    txt(ms.label, cx0, p.y + 315 * s, { size: 44 * s, align: 'center', color: gold, shadow: false });
    txt(ms.value, cx0, p.y + 393 * s, { size: 84 * s, align: 'center', color: ms.warn ? '#ff8a8a' : '#ffffff', shadow: false });
    // GOALS 판
    txt('GOALS', cx0, p.y + 495 * s, { size: 42 * s, align: 'center', color: '#5a3a10', shadow: false });
    // 목표 줄
    const rows = goalRows().slice(0, 3), top = p.y + 560 * s, bot = p.y + p.h - bh + 10 * s;
    const rh = Math.min(135 * s, (bot - top) / Math.max(1, rows.length)), y0 = top + ((bot - top) - rh * rows.length) / 2 + rh / 2;
    rows.forEach((r, i) => {
      const yy = y0 + i * rh, is = Math.min(rh * .86, 100 * s), ix = p.x + 120 * s;
      if (r.gem !== undefined) { const sp = SPR[r.gem] && SPR[r.gem][0]; if (sp) ctx.drawImage(sp, ix - is / 2, yy - is / 2, is, is); }
      else drawIcon(r.icon, ix, yy, is, now);
      const tx = p.x + 195 * s, rx = p.x + (520 - 60) * s, tw = rx - tx;
      if (r.sub) {
        txt(r.text, tx, yy - rh * .2, { size: Math.min(fitSize(r.text, tw, 56 * s), rh * .36), color: '#e4e8ff', shadow: false });
        txt(r.sub, tx, yy + rh * .22, { size: Math.min(fitSize(r.sub, tw, 56 * s), rh * .36), color: '#ffe27a', shadow: false });
      } else txt(r.text, tx, yy, { size: Math.min(fitSize(r.text, tw, 70 * s), rh * .56), color: '#ffffff', shadow: false });
    });
  }
  function drawPanelP(p) {
    const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    g.addColorStop(0, 'rgba(38,58,130,.94)'); g.addColorStop(1, 'rgba(14,20,66,.96)');
    rr(ctx, p.x, p.y, p.w, p.h, 14 * U); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#d9b45a'; ctx.stroke();
  }

  // ───────────────────────── 입력 ─────────────────────────
  function toLocal(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  function cellAt(p) {
    const c = Math.floor((p.x - BX) / CS), r = Math.floor((p.y - BY) / CS);
    return (r >= 0 && r < N && c >= 0 && c < N) ? { r, c } : null;
  }
  // Twist: 탭한 곳에서 가장 가까운 내부 꼭짓점 (2×2 의 중심)
  function vertexAt(p) {
    if (!cellAt(p)) return null;
    const vc = clamp(Math.round((p.x - BX) / CS), 1, N - 1), vr = clamp(Math.round((p.y - BY) / CS), 1, N - 1);
    return { r: vr, c: vc };
  }
  function hitButton(p) {
    for (let i = uiButtons.length - 1; i >= 0; i--) {
      const b = uiButtons[i];
      if (dlg && !b.modal) continue;
      if (p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h) return b;
    }
    return null;
  }
  const adjacent = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    unlockAudio();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    const p = toLocal(e);
    idle = 0;
    const b = hitButton(p);
    if (b) { pressBtn = b; sfx('ui'); return; }
    if (screen !== 'game' || !G || G.busy || G.over || dlg || !G.started) return;
    if (armed) { const cell0 = cellAt(p); if (cell0) applyBooster(armed, cell0); else armed = null; return; }
    if (G.cfg.twist) {
      const v = vertexAt(p);
      if (v) { hintMove = null; twistRotate(v.r, v.c); }
      return;
    }
    const cell = cellAt(p);
    if (!cell) return;
    hintMove = null;
    if (sel) {
      if (sel.r === cell.r && sel.c === cell.c) { sel = null; down = null; return; }
      if (adjacent(sel, cell)) { const s0 = sel; down = null; trySwap(s0, cell); return; }
    }
    sel = cell; sfx('sel');
    down = { x: p.x, y: p.y, cell };
  });
  canvas.addEventListener('pointermove', e => {
    if (!down || !G || G.busy || G.over || dlg) return;
    const p = toLocal(e);
    const dx = p.x - down.x, dy = p.y - down.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < CS * .42) return;
    const from = down.cell;
    const to = Math.abs(dx) > Math.abs(dy)
      ? { r: from.r, c: from.c + (dx > 0 ? 1 : -1) }
      : { r: from.r + (dy > 0 ? 1 : -1), c: from.c };
    down = null;
    if (to.r < 0 || to.r >= N || to.c < 0 || to.c >= N) return;
    trySwap(from, to);
  });
  const endPress = e => {
    down = null;
    if (pressBtn) {
      const pb = pressBtn; pressBtn = null;
      const b = hitButton(toLocal(e));
      if (b && b.id === pb.id) b.fn();
    }
  };
  canvas.addEventListener('pointerup', endPress);
  canvas.addEventListener('pointercancel', () => { down = null; pressBtn = null; });
  // 뒤로 가기 키 / ESC
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (armed) armed = null;
    else if (dlg) dlg = null;
    else if (screen === 'game') openPause();
    else if (screen !== 'menu') screen = 'menu';
    else if (menuPage === 'more') menuPage = 'main';
  });

  // ───────────────────────── 메인 루프 ─────────────────────────
  let last = performance.now(), emaDt = 1, slowFrames = 0, lastSave = 0;
  function update(dt, now) {
    updateFx(dt, now);
    if (screen === 'game') updateGame(dt, now);
    if (now - lastSave > 2500) { lastSave = now; if (dirty) persist(); saveRun(); }
  }
  // 프레임이 떨어지면 이펙트 품질을 자동으로 낮춘다
  function frame(now) {
    const dt = Math.min(3, Math.max(0, (now - last) / 16.667)); last = now;
    if (dt > 0) emaDt = emaDt * .95 + Math.min(dt, 4) * .05;
    if (!lowQ && emaDt > 1.7) { if (++slowFrames > 90) lowQ = true; } else slowFrames = 0;
    try { update(dt, now); draw(now); } catch (err) { if (window.console) console.error(err); }
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (G) noteBest(); persist(); saveRun(); } else last = performance.now(); });
  window.addEventListener('pagehide', () => { if (G) noteBest(); persist(); saveRun(); });

  // 리사이즈 / 회전 / 폴더블 접힘 대응
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => applyLayout()).observe(canvas);
  if (window.addEventListener) {
    window.addEventListener('resize', applyLayout);
    window.addEventListener('orientationchange', () => setTimeout(applyLayout, 150));
  }
  if (window.visualViewport && window.visualViewport.addEventListener) window.visualViewport.addEventListener('resize', applyLayout);

  // ───────────────────────── 테스트용 API ─────────────────────────
  window.__jewel = {
    VERSION,
    findMove, trySwap, twistRotate, newGame, useBooster, applyBooster, openPause, saveRun, restoreRun, get armed() { return armed; }, relayout: applyLayout, toMenu,
    get G() { return G; }, get screen() { return screen; }, get dlg() { return dlg; },
    get busy() { return !!(G && G.busy); }, get score() { return G ? G.score : 0; },
    get level() { return G ? G.level : 0; }, get over() { return !!(G && G.over); },
    get grid() { return grid; }, get save() { return save; },
    modes: () => MODES.map(m => m.id),
    setMenu: m => { menuPage = m; }, setSel: c => { sel = c; },
    openScreen: s => { screen = s; helpPage = 0; },
    unlockAll: () => { MODES.forEach(m => { if (m.secret) save.unlocked[m.id] = true; }); dirty = true; },
    layoutInfo: () => ({ W, H, CS, BX, BY, L, ML, SL }),
    cellCenter: (r, c) => ({ x: cx(c) + CS / 2, y: cy(r) + CS / 2 }),
    buttons: () => uiButtons.map(b => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h })),
    click: (x, y) => { const b = hitButton({ x, y }); if (b) b.fn(); return !!b; },
    // 특정 칸의 보석 종류/특수 속성을 강제로 바꾼다 (효과 확인용)
    setType: (r, c, t, sp) => { const g = grid[r] && grid[r][c]; if (g) { g.t = t; g.sp = sp || null; } return !!g; },
    setSp: (r, c, sp) => { const g = grid[r] && grid[r][c]; if (g) g.sp = sp; return !!g; },
    setFlag: (r, c, o) => { const g = grid[r] && grid[r][c]; if (g) Object.assign(g, o); return !!g; },
    setField: (k, v) => { if (G) G[k] = v; },
    addScore: n => addScore(n)
  };

  applyLayout();
  restoreRun();
  requestAnimationFrame(frame);
})();
