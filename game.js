'use strict';
/* Jewel Swap — 글로시 보석 매치-3 퍼즐 (독자 디자인)
 * - 뷰포트 크기를 읽어 레이아웃을 동적으로 계산 (갤럭시 20:9, 컷아웃, 폴더블, 가로 모드)
 * - 모든 보석/이펙트는 캔버스 코드로 직접 그린다.
 */
(() => {
  const N = 8, NT = 7;
  const LEVEL_GOAL = l => 300 * l;
  const IDLE_HINT_SEC = 9;

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d', { alpha: false });

  // 동적 레이아웃 값 (applyLayout에서 계산)
  let W = 0, H = 0, DPR = 1, CS = 40, GS = 37, BX = 0, BY = 0, U = 1;
  let L = { btns: [] };
  let lowQ = false;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const rnd = n => Math.floor(Math.random() * n);
  const ease = p => p * p * (3 - 2 * p);
  const cx = c => BX + c * CS;
  const cy = r => BY + r * CS;
  const FONT = '"Trebuchet MS","Malgun Gothic","Apple SD Gothic Neo",Tahoma,sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ───────────────────────── 보석 스프라이트 ─────────────────────────
  const PAL = [
    { d: '#7f8fb5', b: '#dfe8f8', l: '#ffffff' },
    { d: '#7a0010', b: '#e3203a', l: '#ff8a98' },
    { d: '#005a2a', b: '#1fb85a', l: '#8af0b0' },
    { d: '#8a6200', b: '#f2c312', l: '#fff2a0' },
    { d: '#0a2a8a', b: '#2a6af0', l: '#9cc4ff' },
    { d: '#4a0e78', b: '#a43cd8', l: '#e6a8ff' },
    { d: '#8a3200', b: '#f2801a', l: '#ffcf9a' }
  ];
  const ring = (n, fx, fy) => Array.from({ length: n }, (_, i) => {
    const a = i / n * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(a) * fx, Math.sin(a) * fy];
  });
  const superEllipse = (n, r, p) => Array.from({ length: n }, (_, i) => {
    const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    return [Math.sign(c) * Math.pow(Math.abs(c), p) * r, Math.sign(s) * Math.pow(Math.abs(s), p) * r];
  });
  const SHAPES = [
    () => [[-.92, -.3], [-.5, -.9], [.5, -.9], [.92, -.3], [0, .96]],
    () => ring(20, .94, .94),
    () => [[-.5, -.92], [.5, -.92], [.92, -.5], [.92, .5], [.5, .92], [-.5, .92], [-.92, .5], [-.92, -.5]],
    () => [[0, -.95], [.96, .82], [-.96, .82]],
    () => ring(6, .96, .96),
    () => ring(20, .8, .96),
    () => superEllipse(24, .9, .45)
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
    const k = Math.max(1, DPR * 1.4);
    const px = Math.max(8, Math.round(GS * k));
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const g = cv.getContext('2d');
    g.scale(px / GS, px / GS);
    const w = GS / 52;
    const pc = PAL[t], pts = SHAPES[t](), c = GS / 2, R = GS / 2 - 3 * w;
    const P = pts.map(([u, v]) => [c + u * R, c + v * R]);
    let mx = 0, my = 0;
    P.forEach(p => { mx += p[0]; my += p[1]; });
    mx /= P.length; my /= P.length;
    const Q = P.map(p => [mx + (p[0] - mx) * .56, my + (p[1] - my) * .56]);
    const path = A => { g.beginPath(); A.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };

    // 색 번짐 그림자(블링)
    g.save(); g.shadowColor = pc.b; g.shadowBlur = 5 * w; g.shadowOffsetY = 1.5 * w;
    path(P); g.fillStyle = pc.d; g.fill(); g.restore();

    let gr = g.createLinearGradient(c - R, c - R, c + R, c + R);
    gr.addColorStop(0, pc.l); gr.addColorStop(.45, pc.b); gr.addColorStop(1, pc.d);
    path(P); g.fillStyle = gr; g.fill();

    for (let i = 0; i < P.length; i++) {
      const j = (i + 1) % P.length;
      g.beginPath();
      g.moveTo(P[i][0], P[i][1]); g.lineTo(P[j][0], P[j][1]); g.lineTo(Q[j][0], Q[j][1]); g.lineTo(Q[i][0], Q[i][1]);
      g.closePath();
      const dx = (P[i][0] + P[j][0] + Q[i][0] + Q[j][0]) / 4 - mx;
      const dy = (P[i][1] + P[j][1] + Q[i][1] + Q[j][1]) / 4 - my;
      const L_ = Math.hypot(dx, dy) || 1, d = (-dx - dy) / L_ * .7071;
      g.fillStyle = d > 0 ? 'rgba(255,255,255,' + (d * .6) + ')' : 'rgba(0,0,0,' + (-d * .5) + ')';
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = .6 * w; g.stroke();
    }

    gr = g.createLinearGradient(mx - R * .5, my - R * .5, mx + R * .5, my + R * .5);
    gr.addColorStop(0, pc.l); gr.addColorStop(1, pc.b);
    path(Q); g.fillStyle = gr; g.fill();
    const rg = g.createRadialGradient(mx, my, 0, mx, my, R * .6);
    rg.addColorStop(0, 'rgba(255,255,255,.4)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    path(Q); g.fillStyle = rg; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = .8 * w; g.stroke();

    path(P); g.lineWidth = 1.5 * w; g.strokeStyle = 'rgba(0,0,0,.6)'; g.stroke();
    path(P); g.lineWidth = .8 * w; g.strokeStyle = 'rgba(255,255,255,.25)'; g.stroke();

    g.save(); g.translate(mx - R * .36, my - R * .42); g.rotate(-.7);
    g.fillStyle = 'rgba(255,255,255,.92)';
    g.beginPath(); g.ellipse(0, 0, R * .2, R * .09, 0, 0, Math.PI * 2); g.fill(); g.restore();
    g.fillStyle = 'rgba(255,255,255,.9)'; star4(g, mx + R * .34, my + R * .36, R * .2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.beginPath(); g.arc(mx + R * .05, my - R * .62, 1.2 * w, 0, Math.PI * 2); g.fill();

    if (bright) {
      g.save(); path(P); g.clip();
      g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(0, 0, GS, GS); g.restore();
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
    r = Math.min(r, w / 2, h / 2);
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
    ctx.font = (o.weight || 'bold') + ' ' + Math.round(size) + 'px ' + FONT;
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (o.stroke) { ctx.lineWidth = o.stroke.w; ctx.strokeStyle = o.stroke.c; ctx.strokeText(s, x, y); }
    if (o.shadow !== false) { const so = Math.max(1, size * .06); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(s, x + so, y + so * 1.3); }
    ctx.fillStyle = o.color || '#fff';
    ctx.fillText(s, x, y);
  }
  function glassPanel(x, y, w, h) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(76,90,205,.92)'); g.addColorStop(1, 'rgba(18,24,76,.95)');
    ctx.save();
    ctx.shadowColor = 'rgba(140,150,255,.7)'; ctx.shadowBlur = lowQ ? 0 : 10 * U;
    rr(ctx, x, y, w, h, 12 * U); ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = '#9aa6f4'; rr(ctx, x, y, w, h, 12 * U); ctx.stroke();
    rr(ctx, x + 3, y + 3, w - 6, h / 2 - 3, 9 * U); ctx.fillStyle = 'rgba(255,255,255,.13)'; ctx.fill();
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

  // ───────────────────────── 레이아웃 ─────────────────────────
  function computeLayout() {
    const land = W > H * 1.15;
    const m = Math.round(clamp(W * .035, 8, 18));
    const gap = Math.round(clamp(Math.min(W, H) * .02, 6, 14));
    L = { btns: [], land, title: null };

    if (!land) {
      const panelH = Math.round(clamp(H * .09, 56, 92));
      const progH = Math.round(clamp(H * .026, 14, 24));
      const btnH = Math.round(clamp(H * .065, 40, 58));
      const fixed = panelH + progH + btnH + gap * 3;
      const avail = H - 2 * m - fixed;
      CS = Math.max(20, Math.floor(Math.min((W - 2 * m) / N, avail / N)));
      const bw = CS * N;
      const content = panelH + gap + progH + gap + bw + gap + btnH;
      const extra = Math.max(0, H - 2 * m - content);
      const titleH = extra >= 50 ? Math.min(52, Math.round(extra * .55)) : 0;
      let y = m + Math.round((extra - titleH) * .4);
      BX = Math.round((W - bw) / 2);
      if (titleH) { L.title = { x: BX, y, w: bw, h: titleH }; y += titleH; }
      const pw = Math.floor((bw - gap) / 2);
      L.score = { x: BX, y, w: pw, h: panelH };
      L.level = { x: BX + bw - pw, y, w: pw, h: panelH };
      y += panelH + gap;
      L.prog = { x: BX, y, w: bw, h: progH };
      y += progH + gap;
      BY = y;
      y += bw + gap;
      const wts = [1.2, 1, 1.35], tot = wts.reduce((a, b) => a + b, 0), avw = bw - gap * 2;
      let bx = BX;
      wts.forEach(wt => { const w_ = Math.floor(avw * wt / tot); L.btns.push({ x: bx, y, w: w_, h: btnH }); bx += w_ + gap; });
    } else {
      const colMin = 190;
      CS = Math.max(20, Math.floor(Math.min((H - 2 * m) / N, (W - 2 * m - colMin - m) / N)));
      const bw = CS * N;
      BX = m; BY = Math.round((H - bw) / 2);
      const x0 = BX + bw + m * 1.5, colW = Math.max(120, W - x0 - m);
      const ph = Math.round(clamp(H * .15, 46, 66)), pg = Math.round(clamp(H * .02, 5, 10));
      const progH = 16, btnH = Math.round(clamp(H * .11, 34, 46));
      const titleH = H >= 420 ? 40 : 0;
      const stack = (titleH ? titleH + pg : 0) + ph * 2 + pg * 2 + progH + pg + btnH * 3 + pg * 2;
      let y = Math.max(m, Math.round((H - stack) / 2));
      if (titleH) { L.title = { x: x0, y, w: colW, h: titleH }; y += titleH + pg; }
      L.score = { x: x0, y, w: colW, h: ph }; y += ph + pg;
      L.level = { x: x0, y, w: colW, h: ph }; y += ph + pg;
      L.prog = { x: x0, y, w: colW, h: progH }; y += progH + pg;
      for (let i = 0; i < 3; i++) { L.btns.push({ x: x0, y, w: colW, h: btnH }); y += btnH + pg * (i < 2 ? 1 : 0); }
    }
    GS = Math.max(16, Math.round(CS * .93));
    U = Math.max(.55, CS / 56);
  }

  let bg = null;
  function buildBg() {
    bg = document.createElement('canvas');
    bg.width = Math.round(W * DPR); bg.height = Math.round(H * DPR);
    const b = bg.getContext('2d');
    b.scale(DPR, DPR);
    const grd = b.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#2c1a74'); grd.addColorStop(.45, '#121852'); grd.addColorStop(1, '#050818');
    b.fillStyle = grd; b.fillRect(0, 0, W, H);
    const rg = b.createRadialGradient(W / 2, H * .45, 20, W / 2, H * .45, Math.max(W, H) * .75);
    rg.addColorStop(0, 'rgba(130,95,255,.28)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = rg; b.fillRect(0, 0, W, H);
    // 위에서 내려오는 빛줄기
    for (let i = 0; i < 7; i++) {
      const a0 = Math.PI / 2 + (i - 3) * .22, a1 = a0 + .07, R = H * 1.2;
      const lg = b.createLinearGradient(W / 2, -H * .1, W / 2 + Math.cos(a0) * R, -H * .1 + Math.sin(a0) * R);
      lg.addColorStop(0, 'rgba(190,170,255,.10)'); lg.addColorStop(1, 'rgba(190,170,255,0)');
      b.fillStyle = lg; b.beginPath(); b.moveTo(W / 2, -H * .1);
      b.lineTo(W / 2 + Math.cos(a0) * R, -H * .1 + Math.sin(a0) * R);
      b.lineTo(W / 2 + Math.cos(a1) * R, -H * .1 + Math.sin(a1) * R); b.fill();
    }
    // 프레임 없이 셀 판만: 은은한 글로우 + 체커
    const bw = CS * N;
    b.save();
    b.shadowColor = 'rgba(120,110,255,.55)'; b.shadowBlur = 26 * U;
    rr(b, BX, BY, bw, bw, 10 * U); b.fillStyle = '#0b0f30'; b.fill();
    b.restore();
    b.save(); rr(b, BX, BY, bw, bw, 10 * U); b.clip();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const x = cx(c), y = cy(r);
      const cg = b.createLinearGradient(x, y, x, y + CS);
      if ((r + c) & 1) { cg.addColorStop(0, '#1e2a66'); cg.addColorStop(1, '#151e4c'); }
      else { cg.addColorStop(0, '#162052'); cg.addColorStop(1, '#0e163c'); }
      b.fillStyle = cg; b.fillRect(x, y, CS, CS);
      b.fillStyle = 'rgba(255,255,255,.05)'; b.fillRect(x, y, CS, 1); b.fillRect(x, y, 1, CS);
    }
    b.restore();
  }

  function applyLayout() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(200, Math.floor(rect.width)), h = Math.max(260, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (w === W && h === H && dpr === DPR) return;
    W = w; H = h; DPR = dpr;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    computeLayout();
    buildSprites();
    buildBg();
    for (let r = 0; r < grid.length; r++) for (let c = 0; c < N; c++) {
      const o = grid[r] && grid[r][c];
      if (o && o.x !== undefined) { o.x = cx(c); o.y = cy(r); o.vy = 0; }
    }
    parts.length = 0; rings.length = 0; popups.length = 0; bolts.length = 0; conf.length = 0; glints.length = 0;
    for (const m of motes) { m.x = Math.random() * W; m.y = Math.random() * H; }
  }

  // ───────────────────────── 게임 상태 ─────────────────────────
  let grid = [];
  let score = 0, level = 1, levelPts = 0, dispScore = 0, dispProg = 0, bump = 0;
  let best = parseInt(store.get('js_best', '0'), 10) || 0;
  let sound = store.get('js_sound', '1') !== '0';
  let busy = false, over = false;
  let sel = null, hintMove = null, idle = 0;
  let dlg = null, praise = null, shake = null, flashT = 0;
  const parts = [], rings = [], popups = [], bolts = [], conf = [], glints = [];
  const motes = Array.from({ length: 30 }, () => ({ x: Math.random() * 400, y: Math.random() * 800, r: Math.random() * 1.8 + .8, sp: Math.random() * .25 + .08, ph: Math.random() * 6 }));

  const mk = (t, r, c) => ({ t, x: cx(c), y: cy(r), vy: 0, s: 1, f: 0, land: 0 });
  const tAt = (r, c) => { const g = grid[r] && grid[r][c]; return g ? g.t : -1; };

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

  function findMove() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const r2 = r + dr, c2 = c + dc;
        if (r2 >= N || c2 >= N) continue;
        const a = { r, c }, b = { r: r2, c: c2 };
        swapT(a, b);
        const ok = matchAt(r, c) || matchAt(r2, c2);
        swapT(a, b);
        if (ok) return { a, b };
      }
    }
    return null;
  }

  function findMatches() {
    const cells = new Set(), groups = [];
    for (let r = 0; r < N; r++) {
      let c = 0;
      while (c < N) {
        const t = tAt(r, c); let k = c + 1;
        while (t >= 0 && k < N && tAt(r, k) === t) k++;
        if (t >= 0 && k - c >= 3) {
          const g = [];
          for (let i = c; i < k; i++) { g.push(r * N + i); cells.add(r * N + i); }
          groups.push({ cells: g, len: k - c });
        }
        c = k;
      }
    }
    for (let c = 0; c < N; c++) {
      let r = 0;
      while (r < N) {
        const t = tAt(r, c); let k = r + 1;
        while (t >= 0 && k < N && tAt(k, c) === t) k++;
        if (t >= 0 && k - r >= 3) {
          const g = [];
          for (let i = r; i < k; i++) { g.push(i * N + c); cells.add(i * N + c); }
          groups.push({ cells: g, len: k - r });
        }
        r = k;
      }
    }
    return { cells, groups };
  }

  function genTypes() {
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
      if (findMove()) return T;
    }
  }

  // ───────────────────────── 애니메이션 ─────────────────────────
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

  function settle() {
    return new Promise(res => {
      let last = performance.now();
      (function step(now) {
        const dt = Math.min(3, Math.max(0.2, (now - last) / 16.667)); last = now;
        let moving = false;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const o = grid[r][c]; if (!o) continue;
          const ty = cy(r);
          if (o.y < ty) {
            o.vy += 1.1 * U * dt;
            o.y = Math.min(ty, o.y + o.vy * dt);
            if (o.y >= ty) { if (o.vy > 3 * U) o.land = 1; o.vy = 0; } else moving = true;
          } else if (o.y > ty) o.y = ty;
          o.x = cx(c);
        }
        if (moving) requestAnimationFrame(step); else res();
      })(last);
    });
  }

  // ───────────────────────── 이펙트 ─────────────────────────
  const q = () => lowQ ? .5 : 1;
  function burst(x, y, color, n) {
    const cnt = Math.round((n || 12) * q());
    for (let i = 0; i < cnt; i++) {
      const a = Math.random() * Math.PI * 2, sp = (1.2 + Math.random() * 4) * U;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - U, life: 1, dec: .018 + Math.random() * .02,
        col: Math.random() < .35 ? '#ffffff' : color, size: (3 + Math.random() * 5) * U, rot: Math.random() * 3, grav: .12 * U });
    }
    rings.push({ x, y, r: 6 * U, life: 1, col: color });
  }
  const FW = ['#ffd23c', '#ff6ad5', '#6ad7ff', '#ffffff', '#9dff6a', '#ff9a3c'];
  function firework(x, y) {
    const cnt = Math.round(30 * q());
    for (let i = 0; i < cnt; i++) {
      const a = Math.random() * Math.PI * 2, sp = (2 + Math.random() * 5) * U;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, dec: .012 + Math.random() * .008,
        col: FW[rnd(FW.length)], size: (3 + Math.random() * 4) * U, rot: Math.random() * 3, grav: .07 * U });
    }
    rings.push({ x, y, r: 8 * U, life: 1, col: '#ffe680' });
  }
  function confettiRain() {
    const cols = ['#ff4d6d', '#ffd23c', '#4dd2ff', '#7dff6a', '#c77dff', '#ffffff'];
    const cnt = Math.round(70 * q());
    for (let i = 0; i < cnt; i++)
      conf.push({ x: Math.random() * W, y: -Math.random() * H * .3, vx: (Math.random() - .5) * 1.6 * U, vy: (1 + Math.random() * 2.4) * U,
        w: (5 + Math.random() * 5) * U, h: (3 + Math.random() * 4) * U, rot: Math.random() * 6, vr: (Math.random() - .5) * .3, col: cols[rnd(cols.length)], life: 1 });
  }
  function addBolt(x1, y1, x2, y2) {
    const pts = [], segs = 9, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, off = (i === 0 || i === segs) ? 0 : (Math.random() - .5) * CS * .5;
      pts.push([x1 + dx * t + nx * off, y1 + dy * t + ny * off]);
    }
    bolts.push({ pts, life: 1 });
  }
  function doShake(mag) { shake = { t0: performance.now(), mag: mag * U, dur: 380 }; }
  function showPraise(text, size) { praise = { text, size: (size || 54) * U, t0: performance.now(), dur: 1300 }; }
  function buzz(p) { if (!sound) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

  // ───────────────────────── 사운드 ─────────────────────────
  let AC = null;
  function unlockAudio() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
    if (AC && AC.state === 'suspended') AC.resume();
  }
  function beep(f, d, type, vol, delay) {
    if (!sound || !AC) return;
    const t = AC.currentTime + (delay || 0);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(vol || .07, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(AC.destination);
    o.start(t); o.stop(t + d + .02);
  }
  function sfx(n, k) {
    k = k || 1;
    switch (n) {
      case 'sel': beep(880, .06, 'sine', .06); break;
      case 'bad': beep(170, .14, 'sawtooth', .07); beep(120, .18, 'sawtooth', .07, .1); break;
      case 'match': {
        const base = [523, 587, 659, 698, 784, 880, 988, 1047][Math.min(k - 1, 7)];
        beep(base, .12, 'triangle', .08); beep(base * 1.5, .16, 'sine', .06, .07); beep(base * 2, .2, 'sine', .04, .14); break;
      }
      case 'level': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => beep(f, .2, 'triangle', .07, i * .09)); break;
      case 'over': [440, 392, 349, 294].forEach((f, i) => beep(f, .24, 'triangle', .08, i * .18)); break;
      case 'ui': beep(660, .05, 'sine', .05); break;
    }
  }

  // ───────────────────────── 게임 진행 ─────────────────────────
  function addScore(n) {
    score += n; levelPts += n; bump = 1;
    if (score > best) { best = score; store.set('js_best', String(best)); }
  }

  async function fillFall() {
    const T = genTypes();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const o = mk(T[r][c], r, c);
      o.y = cy(r) - N * CS - c * CS * .3;
      grid[r][c] = o;
    }
    await settle();
  }

  async function fall() {
    for (let c = 0; c < N; c++) {
      let w = N - 1;
      for (let r = N - 1; r >= 0; r--) {
        if (grid[r][c]) {
          if (r !== w) { grid[w][c] = grid[r][c]; grid[r][c] = null; }
          w--;
        }
      }
      for (let r = w; r >= 0; r--) {
        const o = mk(rnd(NT), r, c);
        o.y = BY - (w - r + 1) * CS;
        grid[r][c] = o;
      }
    }
    await settle();
  }

  const PRAISE = ['', '', 'Good!', 'Great!', 'Superb!', 'Amazing!'];

  async function resolve() {
    let combo = 0;
    for (;;) {
      const m = findMatches();
      if (!m.cells.size) break;
      combo++;
      let gain = 0, big = 0;
      for (const g of m.groups) {
        gain += g.len >= 5 ? 100 : g.len === 4 ? 60 : 30; big = Math.max(big, g.len);
        if (g.len >= 4) {
          const a = g.cells[0], b = g.cells[g.cells.length - 1];
          addBolt(cx(a % N) + CS / 2, cy((a / N) | 0) + CS / 2, cx(b % N) + CS / 2, cy((b / N) | 0) + CS / 2);
        }
      }
      gain *= combo;
      sfx('match', combo);
      buzz(10 + combo * 6);
      if (combo >= 2) showPraise(PRAISE[Math.min(combo, 5)], 50 + Math.min(combo, 5) * 3);
      else if (big >= 4) showPraise(big >= 5 ? 'Wow!' : 'Nice!', 48);
      const cells = [...m.cells].map(i => ({ r: (i / N) | 0, c: i % N }));
      await tween(240, p => { const f = (Math.floor(p * 6) % 2 === 0) ? 1 : 0; for (const q_ of cells) grid[q_.r][q_.c].f = f; });
      for (const q_ of cells) { const o = grid[q_.r][q_.c]; burst(o.x + CS / 2, o.y + CS / 2, PAL[o.t].b, 12); }
      if (combo >= 3 || big >= 5) doShake(4 + combo * 1.5);
      if (combo >= 4) { flashT = .6; confettiRain(); }
      await tween(160, p => { for (const q_ of cells) grid[q_.r][q_.c].s = 1 + p * .25 - p * p * 1.25; });
      let sx = 0, sy = 0;
      for (const q_ of cells) { sx += cx(q_.c) + CS / 2; sy += cy(q_.r) + CS / 2; grid[q_.r][q_.c] = null; }
      popups.push({ txt: '+' + gain, x: sx / cells.length, y: sy / cells.length, life: 1, t0: performance.now() });
      addScore(gain);
      await fall();
    }
    return combo;
  }

  async function levelUp() {
    level++; levelPts = 0;
    sfx('level'); buzz([30, 40, 60, 40, 90]);
    showPraise('LEVEL ' + level, 64);
    flashT = 1; confettiRain();
    for (let i = 0; i < 6; i++) setTimeout(() => firework(BX + Math.random() * CS * N, BY + Math.random() * CS * N * .8), i * 170);
    await tween(300, p => { const f = (Math.floor(p * 6) % 2 === 0) ? 1 : 0; for (const row of grid) for (const o of row) if (o) o.f = f; });
    for (const row of grid) for (const o of row) if (o) burst(o.x + CS / 2, o.y + CS / 2, PAL[o.t].b, 8);
    doShake(8);
    await tween(220, p => { for (const row of grid) for (const o of row) if (o) o.s = 1 - p; });
    await fillFall();
  }

  async function gameOver() {
    over = true; sel = null; hintMove = null;
    sfx('over');
    await wait(400);
    dlg = {
      title: 'Game Over',
      lines: ['No more moves!', 'Score: ' + score, 'Best: ' + best],
      btns: [{ label: 'New Game', fn: newGame, hue: HUE_GOLD }]
    };
  }

  async function trySwap(a, b) {
    if (busy || over || dlg) return;
    busy = true; sel = null; hintMove = null; idle = 0;
    try {
      const A_ = grid[a.r][a.c], B_ = grid[b.r][b.c];
      const ax = cx(a.c), ay = cy(a.r), bx = cx(b.c), by = cy(b.r);
      await tween(150, p => {
        p = ease(p);
        A_.x = ax + (bx - ax) * p; A_.y = ay + (by - ay) * p;
        B_.x = bx + (ax - bx) * p; B_.y = by + (ay - by) * p;
      });
      grid[a.r][a.c] = B_; grid[b.r][b.c] = A_;
      if (!matchAt(a.r, a.c) && !matchAt(b.r, b.c)) {
        sfx('bad'); buzz(25);
        await tween(150, p => {
          p = ease(p);
          A_.x = bx + (ax - bx) * p; A_.y = by + (ay - by) * p;
          B_.x = ax + (bx - ax) * p; B_.y = ay + (by - ay) * p;
        });
        grid[a.r][a.c] = A_; grid[b.r][b.c] = B_;
      } else {
        await resolve();
        if (levelPts >= LEVEL_GOAL(level)) await levelUp();
        if (!findMove()) await gameOver();
      }
    } finally {
      busy = false; idle = 0;
    }
  }

  async function newGame() {
    dlg = null; over = false; score = 0; level = 1; levelPts = 0; dispScore = 0; dispProg = 0;
    sel = null; hintMove = null; idle = 0; praise = null; shake = null;
    parts.length = 0; rings.length = 0; popups.length = 0; bolts.length = 0; conf.length = 0; glints.length = 0;
    busy = true;
    try { await fillFall(); } finally { busy = false; }
  }

  function askNewGame() {
    if (busy) return;
    if (over || score === 0) { newGame(); return; }
    dlg = {
      title: 'New Game',
      lines: ['Start a new game?', 'Current progress will be lost.'],
      btns: [{ label: 'Yes', fn: newGame, hue: HUE_GREEN }, { label: 'No', fn: () => { dlg = null; }, hue: HUE_BLUE }]
    };
  }
  function showHint() {
    if (busy || over || dlg) return;
    hintMove = findMove(); idle = 0;
  }

  // ───────────────────────── 입력 ─────────────────────────
  const uiButtons = [];
  let pressBtn = null, down = null;

  function toLocal(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  function cellAt(p) {
    const c = Math.floor((p.x - BX) / CS), r = Math.floor((p.y - BY) / CS);
    return (r >= 0 && r < N && c >= 0 && c < N) ? { r, c } : null;
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
    if (busy || over || dlg) return;
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
    if (!down || busy || over || dlg) return;
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

  // ───────────────────────── 렌더링 ─────────────────────────
  function addButton(x, y, w, h, label, fn, hue, modal, glowA) {
    const btn = { id: label + '@' + Math.round(x) + ',' + Math.round(y), x, y, w, h, label, fn, modal: !!modal };
    uiButtons.push(btn);
    const pressed = !!(pressBtn && pressBtn.id === btn.id);
    glossBtn(x, y, w, h, pressed, hue, glowA);
    txt(label, x + w / 2, y + h / 2 + (pressed ? 2 : 1), { size: Math.min(h * .42, 20 * Math.max(.85, U)), align: 'center' });
  }

  function drawTitle(now) {
    const t = L.title;
    const size = Math.round(Math.min(t.h * .8, t.w * .11));
    const y = t.y + t.h / 2;
    txt('JEWEL SWAP', t.x + t.w / 2, y, { size, align: 'center', color: gold(y, size), stroke: { w: size * .14, c: '#3a1a00' } });
    const tw = ctx.measureText('JEWEL SWAP').width;
    const p = (now / 1900) % 2;
    if (p < 1) {
      const gx = t.x + t.w / 2 - tw / 2 + p * tw, gr = size * .55 * Math.sin(Math.PI * p);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff'; star4(ctx, gx, y - size * .1, gr); ctx.fill(); ctx.restore();
    }
  }

  function drawHud(now) {
    if (L.title) drawTitle(now);
    const s = L.score, l = L.level;
    glassPanel(s.x, s.y, s.w, s.h); glassPanel(l.x, l.y, l.w, l.h);
    const lab = Math.max(11, Math.round(s.h * .2)), val = Math.round(s.h * .46), pad = Math.round(s.h * .22);
    txt('SCORE', s.x + pad, s.y + s.h * .28, { size: lab, color: '#b8c4ff', shadow: false });
    ctx.save(); ctx.translate(s.x + pad, s.y + s.h * .66); const sc = 1 + .14 * bump; ctx.scale(sc, sc);
    txt(String(Math.round(dispScore)), 0, 0, { size: val, color: gold(0, val), stroke: { w: val * .09, c: '#3a2200' } });
    ctx.restore();
    txt('LEVEL', l.x + pad, l.y + l.h * .28, { size: lab, color: '#b8c4ff', shadow: false });
    txt(String(level), l.x + pad, l.y + l.h * .66, { size: val, color: gold(l.y + l.h * .66, val), stroke: { w: val * .09, c: '#3a2200' } });
    txt('BEST ' + best, l.x + l.w - pad * .8, l.y + l.h * .28, { size: lab, color: '#b8c4ff', align: 'right', shadow: false });

    const pg = L.prog;
    rr(ctx, pg.x, pg.y, pg.w, pg.h, pg.h / 2); ctx.fillStyle = '#080c28'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#9aa6f4'; ctx.stroke();
    const p = Math.min(1, dispProg);
    if (p > 0.005) {
      const fw = Math.max(pg.h - 4, (pg.w - 6) * p);
      const g = ctx.createLinearGradient(0, pg.y, 0, pg.y + pg.h);
      g.addColorStop(0, '#9dffb0'); g.addColorStop(.5, '#22c860'); g.addColorStop(1, '#0a7a3a');
      ctx.save();
      if (p > .95) { ctx.shadowColor = '#7dff9a'; ctx.shadowBlur = 14 * U; }
      rr(ctx, pg.x + 3, pg.y + 3, fw, pg.h - 6, (pg.h - 6) / 2); ctx.fillStyle = g; ctx.fill();
      ctx.restore();
      ctx.save(); rr(ctx, pg.x + 3, pg.y + 3, fw, pg.h - 6, (pg.h - 6) / 2); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = pg.h * .3;
      const off = (now / 30) % (pg.h * 1.2);
      for (let x = pg.x - pg.h + off; x < pg.x + fw + pg.h; x += pg.h * 1.2) { ctx.beginPath(); ctx.moveTo(x, pg.y + pg.h); ctx.lineTo(x + pg.h, pg.y); ctx.stroke(); }
      ctx.restore();
      rr(ctx, pg.x + 6, pg.y + pg.h * .26, Math.max(6, fw - 6), pg.h * .22, 2); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff';
      star4(ctx, pg.x + 3 + fw, pg.y + pg.h / 2, pg.h * (.7 + .25 * Math.sin(now / 120))); ctx.fill(); ctx.restore();
    }
  }

  function drawGem(o, hb, extra) {
    const spr = SPR[o.t] && SPR[o.t][(o.f || hb) ? 1 : 0];
    if (!spr) return;
    const sz = GS * o.s * (extra || 1);
    if (sz < 1) return;
    const lw = 1 + .12 * (o.land || 0), lh = 1 - .12 * (o.land || 0);
    const w_ = sz * lw, h_ = sz * lh;
    ctx.drawImage(spr, o.x + CS / 2 - w_ / 2, o.y + CS / 2 + sz / 2 - h_, w_, h_);
  }

  function glow(x, y, r, a) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, 'rgba(255,245,170,' + a + ')'); g.addColorStop(1, 'rgba(255,245,170,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function drawBoard(now) {
    let ox = 0, oy = 0;
    if (shake) {
      const t = (now - shake.t0) / shake.dur;
      if (t >= 1) shake = null;
      else { const m = shake.mag * (1 - t); ox = (Math.random() - .5) * 2 * m; oy = (Math.random() - .5) * 2 * m; }
    }
    const bw = CS * N;
    ctx.save();
    ctx.translate(ox, oy);
    rr(ctx, BX, BY, bw, bw, 10 * U); ctx.clip();

    const pulse = .5 + .5 * Math.sin(now / 160);
    const hintOn = hintMove && (Math.floor(now / 260) % 2 === 0);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const o = grid[r] && grid[r][c];
      if (!o) continue;
      let hb = false, ex = 1;
      if (hintMove && ((hintMove.a.r === r && hintMove.a.c === c) || (hintMove.b.r === r && hintMove.b.c === c))) {
        hb = hintOn; ex = 1 + .08 * pulse; glow(o.x + CS / 2, o.y + CS / 2, CS * .62, .35 + .3 * pulse);
      }
      if (sel && sel.r === r && sel.c === c) { ex = 1.08 + .04 * pulse; glow(o.x + CS / 2, o.y + CS / 2, CS * .65, .55); }
      drawGem(o, hb, ex);
    }
    if (sel) {
      rr(ctx, cx(sel.c) + 2, cy(sel.r) + 2, CS - 4, CS - 4, 8 * U);
      ctx.lineWidth = Math.max(2, 3 * U); ctx.strokeStyle = 'rgba(255,236,140,' + (.65 + .35 * pulse) + ')'; ctx.stroke();
    }

    // 보석 위를 지나가는 반짝임(글린트)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = glints.length - 1; i >= 0; i--) {
      const gl = glints[i], p = (now - gl.t0) / gl.dur;
      if (p >= 1) { glints.splice(i, 1); continue; }
      const s = Math.sin(Math.PI * p) * CS * .34;
      ctx.fillStyle = '#fff'; star4(ctx, cx(gl.c) + CS * .32, cy(gl.r) + CS * .3, s); ctx.fill();
    }
    // 주기적으로 판 위를 가로지르는 빛
    if (!lowQ && !busy) {
      const t = (now % 7000) / 7000;
      if (t < .22) {
        const p = t / .22, bx = BX + (p * 1.7 - .35) * bw;
        const lg = ctx.createLinearGradient(bx - bw * .16, BY, bx + bw * .16, BY + bw * .35);
        lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.5, 'rgba(255,255,255,.2)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = lg; ctx.fillRect(BX, BY, bw, bw);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // ── 보드 밖까지 퍼지는 이펙트 ──
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of rings) {
      ctx.lineWidth = (1 + 4 * r.life) * U; ctx.strokeStyle = r.col; ctx.globalAlpha = Math.max(0, r.life) * .8;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    }
    for (const b of bolts) {
      ctx.globalAlpha = Math.max(0, b.life);
      for (const pass of [[10 * U, 'rgba(120,200,255,.35)'], [3 * U, '#ffffff']]) {
        ctx.lineWidth = pass[0]; ctx.strokeStyle = pass[1]; ctx.lineJoin = 'round';
        ctx.beginPath(); b.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
      }
    }
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
      ctx.fillStyle = p.col; star4(ctx, p.x, p.y, p.size * (.4 + p.life * .6)); ctx.fill();
    }
    ctx.restore();

    for (const c of conf) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.globalAlpha = Math.min(1, c.life * 2);
      ctx.fillStyle = c.col; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.restore();
    }
    for (const p of popups) {
      const age = (now - p.t0) / 1000, sc = Math.min(1, .5 + age * 4), size = 26 * Math.max(.8, U);
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
        txt(praise.text, 0, 0, { size: praise.size, align: 'center', color: gold(0, praise.size), stroke: { w: praise.size * .15, c: '#4a1a00' } });
        ctx.restore();
      }
    }
    if (flashT > 0) { ctx.fillStyle = 'rgba(255,250,220,' + (flashT * .55) + ')'; ctx.fillRect(0, 0, W, H); }
  }

  function drawMenu(now) {
    const b = L.btns;
    const hintGlow = (!busy && !over && !dlg && !hintMove && idle > 5) ? .5 + .5 * Math.sin(now / 200) : 0;
    addButton(b[0].x, b[0].y, b[0].w, b[0].h, 'New Game', askNewGame, HUE_BLUE);
    addButton(b[1].x, b[1].y, b[1].w, b[1].h, 'Hint', showHint, HUE_GOLD, false, hintGlow);
    addButton(b[2].x, b[2].y, b[2].w, b[2].h, 'Sound: ' + (sound ? 'On' : 'Off'), () => {
      sound = !sound; store.set('js_sound', sound ? '1' : '0'); if (sound) { unlockAudio(); sfx('ui'); }
    }, HUE_GREEN);
  }

  function drawDialog() {
    if (!dlg) return;
    ctx.fillStyle = 'rgba(3,5,20,.68)'; ctx.fillRect(0, 0, W, H);
    const k = Math.max(.8, Math.min(1.3, U));
    const w = Math.min(W - 24, 340 * k), h = (70 + dlg.lines.length * 30 + 80) * k;
    const x = (W - w) / 2, y = (H - h) / 2;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#3a4ab8'); g.addColorStop(1, '#141c5c');
    ctx.save(); ctx.shadowColor = 'rgba(255,200,90,.6)'; ctx.shadowBlur = 24 * k;
    rr(ctx, x, y, w, h, 18 * k); ctx.fillStyle = g; ctx.fill(); ctx.restore();
    ctx.lineWidth = 4; ctx.strokeStyle = '#e6b04a'; rr(ctx, x, y, w, h, 18 * k); ctx.stroke();
    rr(ctx, x + 6, y + 6, w - 12, 44 * k, 12 * k); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill();
    txt(dlg.title, W / 2, y + 34 * k, { size: 28 * k, align: 'center', color: gold(y + 34 * k, 28 * k), stroke: { w: 4, c: '#3a2200' } });
    dlg.lines.forEach((ln, i) => txt(ln, W / 2, y + (82 + i * 30) * k, { size: 19 * k, align: 'center' }));
    const bw = 130 * k, gap = 14, total = dlg.btns.length * bw + (dlg.btns.length - 1) * gap;
    let bx = x + (w - total) / 2;
    for (const b of dlg.btns) { addButton(bx, y + h - 64 * k, bw, 44 * k, b.label, b.fn, b.hue || HUE_BLUE, true); bx += bw + gap; }
  }

  function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    uiButtons.length = 0;
    ctx.drawImage(bg, 0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (!lowQ) {
      const blobs = [['rgba(255,80,200,', 0, 0], ['rgba(60,160,255,', 2.1, 1], ['rgba(120,255,200,', 4.2, 2]];
      for (const [col, ph] of blobs) {
        const bx = W * (.5 + .38 * Math.sin(now / 5200 + ph)), by = H * (.5 + .34 * Math.cos(now / 6300 + ph * 1.3));
        const rg = ctx.createRadialGradient(bx, by, 0, bx, by, W * .7);
        rg.addColorStop(0, col + '.10)'); rg.addColorStop(1, col + '0)');
        ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      }
    }
    for (const m of motes) {
      const a = .2 + .6 * (.5 + .5 * Math.sin(now / 600 + m.ph));
      ctx.globalAlpha = a; ctx.fillStyle = '#cfd6ff'; star4(ctx, m.x, m.y, m.r * 2.2 * Math.max(.7, U)); ctx.fill();
    }
    ctx.restore();
    drawHud(now); drawBoard(now); drawMenu(now); drawDialog();
  }

  function update(dt, now) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= p.dec * dt; p.rot += .08 * dt;
      if (p.life <= 0) parts.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.r += 2.6 * U * dt; r.life -= .045 * dt;
      if (r.life <= 0) rings.splice(i, 1);
    }
    for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].life -= .06 * dt; if (bolts[i].life <= 0) bolts.splice(i, 1); }
    for (let i = conf.length - 1; i >= 0; i--) {
      const c = conf[i]; c.vy += .05 * U * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt; c.life -= .004 * dt;
      if (c.y > H + 20 || c.life <= 0) conf.splice(i, 1);
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.y -= .7 * U * dt; p.life -= .014 * dt;
      if (p.life <= 0) popups.splice(i, 1);
    }
    for (const m of motes) { m.y -= m.sp * dt; if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; } }
    if (flashT > 0) flashT = Math.max(0, flashT - .03 * dt);
    if (bump > 0) bump = Math.max(0, bump - .06 * dt);
    const d = score - dispScore;
    dispScore = Math.abs(d) < 1 ? score : dispScore + d * Math.min(1, .18 * dt);
    const tp = Math.min(1, levelPts / LEVEL_GOAL(level));
    dispProg += (tp - dispProg) * Math.min(1, .15 * dt);
    if (Math.abs(tp - dispProg) < .002) dispProg = tp;

    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const o = grid[r] && grid[r][c];
      if (!o) continue;
      if (o.land) { o.land *= Math.pow(.86, dt); if (o.land < .02) o.land = 0; }
      if (!busy && o.x !== undefined) { o.x = cx(c); o.y = cy(r); }
    }
    if (!busy && !over && !dlg && glints.length < (lowQ ? 2 : 5) && Math.random() < .035 * dt)
      glints.push({ r: rnd(N), c: rnd(N), t0: now, dur: 420 });
    if (!busy && !over && !dlg && !hintMove) {
      idle += dt / 60;
      if (idle > IDLE_HINT_SEC) hintMove = findMove();
    }
  }

  // 프레임이 떨어지면 이펙트 품질을 자동으로 낮춘다
  let last = performance.now(), emaDt = 1, slowFrames = 0;
  function frame(now) {
    const dt = Math.min(3, Math.max(0, (now - last) / 16.667)); last = now;
    if (dt > 0) emaDt = emaDt * .95 + Math.min(dt, 4) * .05;
    if (!lowQ && emaDt > 1.7) { if (++slowFrames > 90) lowQ = true; } else slowFrames = 0;
    update(dt, now); draw(now);
    requestAnimationFrame(frame);
  }

  // 리사이즈 / 회전 / 폴더블 접힘 대응
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => applyLayout()).observe(canvas);
  if (window.addEventListener) {
    window.addEventListener('resize', applyLayout);
    window.addEventListener('orientationchange', () => setTimeout(applyLayout, 150));
  }
  if (window.visualViewport && window.visualViewport.addEventListener) window.visualViewport.addEventListener('resize', applyLayout);

  window.__jewel = {
    findMove, trySwap, newGame, relayout: applyLayout,
    get busy() { return busy; }, get score() { return score; }, get level() { return level; },
    get over() { return over; }, get grid() { return grid; },
    layoutInfo: () => ({ W, H, CS, BX, BY, L }),
    cellCenter: (r, c) => ({ x: cx(c) + CS / 2, y: cy(r) + CS / 2 }),
    buttons: () => uiButtons.map(b => ({ label: b.label, x: b.x, y: b.y, w: b.w, h: b.h }))
  };

  applyLayout();
  newGame();
  requestAnimationFrame(frame);
})();
