'use strict';
/* Jewel Reboot v2 — 보석 매치-3 퍼즐 (독자 디자인, 캔버스 직접 렌더링)
 * 구성: [코어/세이브/모드/배지] [그리기 도구] [레이아웃] [이펙트/오디오] [게임 로직] [화면 렌더링] [입력/루프]
 */
(() => {
  const N = 8, NT = 6, HYPER = 6;
  const VERSION = '2.1.0', BUILD = '2026-10-29';   // 배포 시 sw.js 의 VERSION(캐시 이름)도 같이 올리세요
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
    { id: 'lightning', name: 'LIGHTNING', hue: 205, desc: '60초 승부! 시계 보석으로 시간 연장', timer: 'lightning', spec: 1, dead: 'shuffle', mult: 0 },
    { id: 'action', name: 'ACTION', hue: 345, desc: '매치로 타이머를 채워 버텨라', timer: 'action', lvl: 1, spec: 1, dead: 'shuffle', mult: 1, noReset: 1 },
    { id: 'quest', name: 'QUEST', hue: 140, desc: '미션을 깨고 유물을 모아라 (목숨 3개)', quest: 1, spec: 1, dead: 'shuffle', mult: 0 },
    { id: 'twist', name: 'TWIST', hue: 300, desc: '2×2 회전! 폭탄이 터지기 전에 해체', twist: 1, bombs: 1, lvl: 1, spec: 1, dead: 'none', mult: 1 },
    { id: 'endless', name: 'ENDLESS', hue: 225, desc: '종료 없음, 점수 배율 없음', lvl: 1, spec: 1, dead: 'shuffle', mult: 0, secret: 1,
      unlock: 'ZEN 3,000점', cond: () => bestOf('zen').score >= 3000 },
    { id: 'twilight', name: 'TWILIGHT', hue: 275, desc: '매 수마다 중력 방향이 바뀐다', gravity: 1, lvl: 1, spec: 1, dead: 'over', mult: 1, secret: 1,
      unlock: 'CLASSIC 레벨 5', cond: () => bestOf('classic').level >= 5 },
    { id: 'hyper', name: 'HYPER', hue: 355, desc: '더 빠르고 더 치열한 ACTION', timer: 'hyper', lvl: 1, spec: 1, dead: 'shuffle', mult: 1, noReset: 1, secret: 1,
      unlock: 'ACTION 레벨 4', cond: () => bestOf('action').level >= 4 },
    { id: 'bfly', name: 'BUTTERFLIES', hue: 120, desc: '거미가 닿기 전에 나비를 매치하라', bfly: 1, lvl: 1, spec: 1, dead: 'shuffle', mult: 1, secret: 1,
      unlock: 'QUEST 미션 5 클리어', cond: () => bestOf('quest').level >= 5 },
    { id: 'original', name: 'ORIGINAL', hue: 235, desc: '특수 보석 없는 순수 클래식', lvl: 1, spec: 0, dead: 'over', mult: 1, secret: 1,
      unlock: '배지 5개 획득', cond: () => Object.keys(save.badges).length >= 5 }
  ];
  const modeById = id => MODES.find(m => m.id === id);
  const isUnlocked = m => !m.secret || !!save.unlocked[m.id];

  const BADGES = [
    { id: 'flame', name: 'Fire Starter', desc: 'Flame 보석 만들기' },
    { id: 'star', name: 'Star Maker', desc: 'Star 보석 만들기' },
    { id: 'hyper', name: 'Cube Master', desc: 'Hypercube 만들기' },
    { id: 'nova', name: 'Supernova!', desc: '6개 이상 일렬 매치' },
    { id: 'combo5', name: 'Chain Reaction', desc: '5연쇄 달성' },
    { id: 'combo8', name: 'Cascade King', desc: '8연쇄 달성' },
    { id: 'big', name: 'High Roller', desc: '한 판에 5,000점' },
    { id: 'lightning', name: 'Lightning Bolt', desc: 'LIGHTNING 1,500점' },
    { id: 'quest5', name: 'Adventurer', desc: 'QUEST 미션 5 클리어' },
    { id: 'quest10', name: 'Relic Hunter', desc: 'QUEST 미션 10 클리어' },
    { id: 'zen', name: 'Zen Master', desc: 'ZEN 5분 플레이' },
    { id: 'twist', name: 'Twister', desc: 'TWIST 1,500점' },
    { id: 'butterfly', name: 'Butterfly Friend', desc: '나비 20마리 구하기 (누적)' },
    { id: 'bigbang', name: 'Big Bang', desc: 'Hypercube 두 개를 맞바꾸기' },
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
    const key = GS + '|' + DPR;
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

  // ───────────────────────── 공유 상태 ─────────────────────────
  let grid = [];                       // grid[r][c] = 보석 객체
  let G = null;                        // 현재 게임 상태 (메뉴에서는 null)
  let screen = 'menu';                 // menu | game | badges | records | help
  let dlg = null;                      // 모달 대화상자
  let sel = null, hintMove = null, idle = 0, twistSel = null, armed = null;
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
      const progH = Math.round(clamp(H * .03, 18, 26));
      const scoreH = Math.round(clamp(H * .095, 50, 92));
      const chipH = Math.round(clamp(H * .036, 24, 32));
      const bD = Math.round(clamp(Math.min(W * .17, H * .085), 44, 68));
      const bLab = 14;
      const fixed = topH + progH + scoreH + chipH + bLab + bD;
      CS = Math.max(20, Math.floor(Math.min((W - 2 * m) / N, (H - 2 * m - verH - fixed - g0 * 6) / N)));
      const bw = CS * N;
      const free = Math.max(0, H - 2 * m - verH - fixed - bw - g0 * 6);
      const g = g0 + Math.min(12, Math.floor(free / 9));
      const rest = Math.max(0, free - (g - g0) * 6);
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
      L.ver = { x: Math.round(W / 2) - 60, y: H - verH, w: 120, h: verH };
    } else {
      // 가로: 보드는 오른쪽, 왼쪽에 장식 패널(점수/정보/목표) + 부스터
      const mm = 4, cgap = Math.round(clamp(W * .012, 6, 14)), colMin = 200;
      CS = Math.max(20, Math.floor(Math.min((H - 2 * mm) / N, (W - 2 * mm - colMin - cgap) / N)));
      const bw = CS * N;
      BX = W - mm - bw; BY = Math.round((H - bw) / 2);
      const areaW = BX - cgap - mm, colW = Math.min(areaW, 330);
      const colX = mm + Math.round((areaW - colW) / 2);
      let f = clamp((H - 2 * mm) / 350, .55, 1.2), S;
      for (let it = 0; it < 8; it++) {
        S = {
          g: Math.round(5 * f), top: Math.round(34 * f), prog: Math.round(17 * f), score: Math.round(60 * f), main: Math.round(44 * f),
          goals: Math.round(86 * f), pad: Math.round(6 * f)
        };
        S.bD = Math.max(30, Math.min(Math.round(54 * f), Math.floor((colW - S.g * 3) / 4)));
        S.total = S.top + S.prog + S.score + S.main + S.goals + S.pad * 2 + S.bD + verH + S.g * 4;
        if (S.total <= H - 2 * mm) break;
        f *= .93;
      }
      let y = Math.max(mm, Math.round((H - S.total) / 2));
      const cw = Math.round(clamp(colW * .3, 64, 100));
      L.top = {
        gear: { x: colX, y, d: S.top },
        plaque: { x: colX + S.top + S.g, y, w: colW - S.top - cw - S.g * 2, h: S.top },
        coin: { x: colX + colW - cw, y: y + Math.round(S.top * .1), w: cw, h: Math.round(S.top * .8) }
      };
      y += S.top + S.g;
      L.prog = { x: colX, y, w: colW, h: S.prog }; y += S.prog + S.g;
      const ph = S.score + S.main + S.goals + S.pad * 2;
      L.panel = { x: colX, y, w: colW, h: ph };
      y += S.pad;
      L.score = { x: colX, y, w: colW, h: S.score }; y += S.score;
      L.main = { x: colX, y, w: colW, h: S.main }; y += S.main;
      L.goals = { x: colX, y, w: colW, h: S.goals }; y += S.goals + S.pad + S.g;
      const gap = Math.floor((colW - S.bD * 4) / 3);
      for (let i = 0; i < 4; i++) L.boost.push({ x: colX + i * (S.bD + gap), y, d: S.bD });
      y += S.bD + S.g;
      L.ver = { x: colX, y, w: colW, h: verH };
    }
    GS = Math.max(16, Math.round(CS * .95));
    U = Math.max(.55, CS / 56);
  }

  // ───────────────────────── 레이아웃 (메뉴 / 보조 화면) ─────────────────────────
  let ML = null, SL = null;
  function computeMenuLayout() {
    const land = W > H * 1.15;
    const m = Math.round(clamp(W * .04, 10, 22));
    const gap = Math.round(clamp(Math.min(W, H) * .016, 5, 10));
    const titleH = Math.round(land ? clamp(H * .15, 32, 54) : clamp(H * .095, 46, 80));
    const botH = Math.round(clamp(Math.min(W, H) * .1, 38, 52));
    const verH = 16;
    const topY = Math.round(m * .6);
    const areaY = topY + titleH + gap;
    const botY = H - Math.round(m * .5) - verH - botH;
    const areaH = botY - gap - areaY, areaW = W - 2 * m;
    const n = MODES.length;
    let best = null;
    for (let cols = 2; cols <= 5; cols++) {
      const rows = Math.ceil(n / cols);
      const cw = (areaW - gap * (cols - 1)) / cols, ch = (areaH - gap * (rows - 1)) / rows;
      const sc = Math.min(cw / 2.1, ch);
      if (!best || sc > best.sc) best = { cols, rows, cw: Math.floor(cw), ch: Math.floor(ch), sc };
    }
    const cards = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / best.cols), col = i % best.cols;
      const inRow = Math.min(best.cols, n - row * best.cols);
      const off = row === best.rows - 1 ? (best.cols - inRow) * (best.cw + gap) / 2 : 0;
      cards.push({ x: Math.round(m + col * (best.cw + gap) + off), y: areaY + row * (best.ch + gap), w: best.cw, h: best.ch });
    }
    const bw = Math.floor((areaW - gap * 3) / 4), bottom = [];
    for (let i = 0; i < 4; i++) bottom.push({ x: m + i * (bw + gap), y: botY, w: bw, h: botH });
    ML = { title: { x: m, y: topY, w: areaW, h: titleH }, cards, bottom, ver: { x: Math.round(W / 2) - 70, y: H - verH - Math.round(m * .3), w: 140, h: verH } };
    SL = { title: ML.title, area: { x: m, y: areaY, w: areaW, h: areaH }, back: { x: Math.round((W - Math.min(240, areaW)) / 2), y: botY, w: Math.min(240, areaW), h: botH }, gap, m };
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

  // 매치 모양 → 특수 보석 계획 (4개=Flame, L·T·十=Star, 5개=Hypercube, 6개+=Supernova)
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
      else { sfx('hyper'); showPraise('HYPERCUBE!', 52); }
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
        sfx('nova'); flashT = Math.max(flashT, .75); doShake(13, 560); doPunch(1.15); showPraise('SUPERNOVA!', 60); hold = Math.max(hold, 280);
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
          showPraise(c.sp === 'flame' ? 'FLAME GEM!' : c.sp === 'star' ? 'STAR GEM!' : c.sp === 'hyper' ? 'HYPERCUBE!' : 'SUPERNOVA GEM!', 44);
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
  const BOOST = { wand: { cost: 150, label: 'Wand', tip: '보석을 탭 → Flame/Star 로 변신' }, bomb: { cost: 200, label: 'Bomb', tip: '탭한 곳 3×3 폭파' }, burst: { cost: 120, label: 'Burst', tip: '탭한 색을 모두 제거' } };
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
        showPraise(g0.sp === 'flame' ? 'FLAME GEM!' : 'STAR GEM!', 40);
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
    btns.push({ label: 'CRT: ' + ['Off', 'Soft', 'Strong'][save.crt | 0], fn: () => { setCrt(((save.crt | 0) + 1) % 3); dlg = settingsDlg(title, inGame); }, hue: HUE_BLUE });
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
      if (ate) { sfx('boom'); doShake(10); await gameOver('GAME OVER', '나비가 거미에게 잡혔습니다'); return; }
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
    G = null; screen = 'menu'; grid = [];
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
  function drawButterfly(x, y, sz, now, ph, col) {
    const flap = .35 + .65 * Math.abs(Math.sin(now / 110 + ph)), s = sz * .4;
    ctx.save(); ctx.translate(x, y);
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(side * flap, 1);
      ctx.beginPath(); ctx.ellipse(s * .55, -s * .3, s * .6, s * .8, -.4, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = Math.max(1.5, s * .1); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(s * .45, s * .5, s * .38, s * .45, .5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(s * .6, -s * .4, s * .16, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#1a1020'; rr(ctx, -s * .1, -s * .8, s * .2, s * 1.6, s * .1); ctx.fill();
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
    if (o.bf) drawButterfly(x, y, sz, now, o.ph, o.t < HYPER ? PAL[o.t].l : '#fff');
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
  function drawPlaque(p, text) {
    const { x, y, w, h } = p;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#4a5a9a'); g.addColorStop(.5, '#2a3470'); g.addColorStop(1, '#161c52');
    ctx.save(); ctx.shadowColor = 'rgba(150,150,255,.55)'; ctx.shadowBlur = lowQ ? 0 : 10 * U;
    rr(ctx, x, y, w, h, h * .38); ctx.fillStyle = g; ctx.fill(); ctx.restore();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#d6ddff'; rr(ctx, x, y, w, h, h * .38); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,150,255,.75)'; rr(ctx, x + 4, y + 4, w - 8, h - 8, h * .3); ctx.stroke();
    for (const sx of [x + h * .3, x + w - h * .3]) {
      ctx.save(); ctx.translate(sx, y + h / 2); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#7fd8ff'; ctx.fillRect(-h * .07, -h * .07, h * .14, h * .14); ctx.restore();
    }
    const s = fitSize(text, w - h * 1.1, h * .46);
    txt(text, x + w / 2, y + h / 2 + 1, { size: s, align: 'center', color: '#eef1ff' });
  }
  function drawCoinPill(p, now) {
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

  function drawProg(pg, now) {
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
      const p = L.panel;
      const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      g.addColorStop(0, 'rgba(38,58,130,.94)'); g.addColorStop(1, 'rgba(14,20,66,.96)');
      ctx.save(); ctx.shadowColor = 'rgba(120,150,255,.45)'; ctx.shadowBlur = lowQ ? 0 : 12 * U;
      rr(ctx, p.x, p.y, p.w, p.h, 14 * U); ctx.fillStyle = g; ctx.fill(); ctx.restore();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#d9b45a'; rr(ctx, p.x, p.y, p.w, p.h, 14 * U); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,230,150,.35)'; rr(ctx, p.x + 4, p.y + 4, p.w - 8, p.h - 8, 11 * U); ctx.stroke();
      scoreText(L.score, true);
      const dv = (yy) => { ctx.strokeStyle = 'rgba(217,180,90,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x + 12, yy); ctx.lineTo(p.x + p.w - 12, yy); ctx.stroke(); };
      dv(L.main.y);
      const ms = mainStat(), m = L.main;
      txt(ms.label, m.x + m.w / 2, m.y + m.h * .27, { size: Math.min(m.h * .3, 22), align: 'center', color: '#ffd23c', shadow: false });
      txt(ms.value, m.x + m.w / 2, m.y + m.h * .7, { size: Math.min(m.h * .5, 34), align: 'center', color: ms.warn ? '#ff8a8a' : '#ffffff' });
      dv(L.goals.y);
      const gl = L.goals, rows = goalRows(), hh = gl.h * .24;
      rr(ctx, gl.x + gl.w * .25, gl.y + 2, gl.w * .5, hh, hh * .4); ctx.fillStyle = '#d9b45a'; ctx.fill();
      txt('GOALS', gl.x + gl.w / 2, gl.y + 2 + hh / 2 + 1, { size: hh * .62, align: 'center', color: '#3a2200', shadow: false });
      const ry0 = gl.y + hh + 4, rh = Math.min((gl.h - hh - 8) / Math.max(1, rows.length), gl.h * .34);
      rows.slice(0, 3).forEach((r, i) => {
        const yy = ry0 + i * rh + rh / 2, is = rh * .8, ix = gl.x + gl.w * .1 + is / 2;
        if (r.gem !== undefined) { const sp = SPR[r.gem] && SPR[r.gem][0]; if (sp) ctx.drawImage(sp, ix - is / 2, yy - is / 2, is, is); }
        else drawIcon(r.icon, ix, yy, is, now);
        const tx = ix + is / 2 + 8, tw = gl.x + gl.w - 14 - tx;
        if (r.sub) {
          const s1 = fitSize(r.text, tw * .55, rh * .5), s2 = fitSize(r.sub, tw * .5, rh * .5);
          txt(r.text, tx, yy, { size: Math.min(s1, rh * .5), color: '#dfe4ff', shadow: false });
          txt(r.sub, gl.x + gl.w - 14, yy, { size: Math.min(s2, rh * .5), align: 'right', color: '#ffe27a', shadow: false });
        } else txt(r.text, tx, yy, { size: fitSize(r.text, tw, rh * .62), color: '#ffffff', shadow: true });
      });
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
        hb = hintOn; ex = 1 + .08 * pulse; aura(o.x + CS / 2, o.y + CS / 2, CS * .62, '255,245,170', .35 + .3 * pulse);
      }
      if (sel && sel.r === r && sel.c === c) { ex = 1.08 + .04 * pulse; aura(o.x + CS / 2, o.y + CS / 2, CS * .65, '255,245,170', .55); }
      if (o.bf && r <= 1) danger = true;
      drawGem(o, hb, ex, now);
    }
    if (G.cfg.bfly) {
      if (danger) { const lg = ctx.createLinearGradient(0, BY, 0, BY + CS * 2); lg.addColorStop(0, 'rgba(255,40,40,' + (.25 + .25 * pulse) + ')'); lg.addColorStop(1, 'rgba(255,40,40,0)'); ctx.fillStyle = lg; ctx.fillRect(BX, BY, bw, CS * 2); }
      drawSpider(BX + bw / 2, BY + CS * .28, CS * .22, now);
    }
    if (sel) {
      rr(ctx, cx(sel.c) + 2, cy(sel.r) + 2, CS - 4, CS - 4, 8 * U);
      ctx.lineWidth = Math.max(2, 3 * U); ctx.strokeStyle = 'rgba(255,236,140,' + (.65 + .35 * pulse) + ')'; ctx.stroke();
    }
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

  function drawMenu(now) {
    drawTitleText(ML.title, 'JEWEL REBOOT', now);
    MODES.forEach((m, i) => {
      const c = ML.cards[i], unl = isUnlocked(m);
      const pressed = hitArea('mode-' + m.id, c.x, c.y, c.w, c.h, () => {
        if (unl) { unlockAudio(); newGame(m.id); }
        else { sfx('bad'); toast('lock', m.name + ' 잠김', '해금 조건: ' + m.unlock); }
      });
      const off = pressed ? 2 : 0;
      glassPanel(c.x, c.y + off, c.w, c.h, m.hue);
      const pad = Math.max(8, c.h * .1);
      const ns = Math.min(c.h * .26, fitSize(m.name, c.w - pad * 2 - (unl ? 0 : c.h * .3), c.h * .26));
      txt(m.name, c.x + pad, c.y + off + c.h * .26, { size: ns, color: unl ? 'hsl(' + m.hue + ',90%,82%)' : '#8a90c8', shadow: true });
      const ds = Math.max(9, Math.min(c.h * .16, c.w * .07));
      const lines = wrapLines(unl ? m.desc : '🔒 ' + m.unlock, c.w - pad * 2, ds, '600').slice(0, 2);
      lines.forEach((ln, k) => txt(ln.replace('🔒 ', ''), c.x + pad, c.y + off + c.h * .52 + k * ds * 1.2, { size: ds, color: unl ? '#c9d0ff' : '#8a90c8', weight: '600', shadow: false }));
      if (unl) {
        const b = bestOf(m.id);
        const s2 = Math.max(9, Math.min(c.h * .15, c.w * .07));
        txt(b.score ? 'BEST ' + fmt(b.score) : 'NEW', c.x + c.w - pad, c.y + off + c.h * .87, { size: s2, align: 'right', color: '#ffd84a', shadow: false });
      } else {
        lockIcon(c.x + c.w - pad - c.h * .1, c.y + off + c.h * .26, c.h * .22, '#8a90c8');
        ctx.fillStyle = 'rgba(0,0,10,.28)'; rr(ctx, c.x, c.y + off, c.w, c.h, 12 * U); ctx.fill();
      }
    });
    const bs = ML.bottom, nb = Object.keys(save.badges).length;
    addButton(bs[0].x, bs[0].y, bs[0].w, bs[0].h, 'Badges ' + nb + '/' + BADGES.length, () => { screen = 'badges'; }, HUE_GOLD);
    addButton(bs[1].x, bs[1].y, bs[1].w, bs[1].h, 'Records', () => { screen = 'records'; }, HUE_BLUE);
    addButton(bs[2].x, bs[2].y, bs[2].w, bs[2].h, 'Help', () => { helpPage = 0; screen = 'help'; }, HUE_GREEN);
    addButton(bs[3].x, bs[3].y, bs[3].w, bs[3].h, 'Settings', openSettings, HUE_GREEN);
    drawVersion(ML.ver);
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
      'Flame ' + st.flame + '  ·  Star ' + st.star + '  ·  Hypercube ' + st.hyper + '  ·  Supernova ' + st.nova];
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
     ['특수 보석', '4개 일렬 → Flame: 주변 3×3 폭발\nL·T·十 모양 → Star: 가로·세로 줄 제거\n5개 일렬 → Hypercube: 바꾼 색을 전부 제거 (두 개를 맞바꾸면 판 전체)\n6개 이상 → Supernova: 3줄 십자 폭발'],
     ['특수 아이템', '시계 보석: 매치하면 시간 +5초 (LIGHTNING)\n폭탄 보석: 숫자가 0이 되기 전에 매치해 해체 (TWIST)\n나비: 맨 위(거미)에 닿기 전에 매치해서 구출 (BUTTERFLIES)']],
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
    drawAmbient(now);
    if (screen === 'menu') drawMenu(now);
    else if (screen === 'badges') drawBadges(now);
    else if (screen === 'records') drawRecords(now);
    else if (screen === 'help') drawHelp(now);
    else if (screen === 'game' && G) { drawHud(now); drawBoard(now); drawBoosters(now); drawVersion(); }
    drawToasts(now);
    drawDialog();
    drawCrt(now);
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
  });

  // ───────────────────────── 메인 루프 ─────────────────────────
  let last = performance.now(), emaDt = 1, slowFrames = 0, lastSave = 0;
  function update(dt, now) {
    updateFx(dt, now);
    if (screen === 'game') updateGame(dt, now);
    if (dirty && now - lastSave > 2500) { lastSave = now; persist(); }
  }
  // 프레임이 떨어지면 이펙트 품질을 자동으로 낮춘다
  function frame(now) {
    const dt = Math.min(3, Math.max(0, (now - last) / 16.667)); last = now;
    if (dt > 0) emaDt = emaDt * .95 + Math.min(dt, 4) * .05;
    if (!lowQ && emaDt > 1.7) { if (++slowFrames > 90) lowQ = true; } else slowFrames = 0;
    try { update(dt, now); draw(now); } catch (err) { if (window.console) console.error(err); }
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (G) noteBest(); persist(); } else last = performance.now(); });
  window.addEventListener('pagehide', () => { if (G) noteBest(); persist(); });

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
    findMove, trySwap, twistRotate, newGame, useBooster, applyBooster, openPause, get armed() { return armed; }, relayout: applyLayout, toMenu,
    get G() { return G; }, get screen() { return screen; }, get dlg() { return dlg; },
    get busy() { return !!(G && G.busy); }, get score() { return G ? G.score : 0; },
    get level() { return G ? G.level : 0; }, get over() { return !!(G && G.over); },
    get grid() { return grid; }, get save() { return save; },
    modes: () => MODES.map(m => m.id),
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
  requestAnimationFrame(frame);
})();
