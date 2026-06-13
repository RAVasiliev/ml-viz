/* 3D-вид поверхности потерь L(u,v): сетка квадов с раскраской по высоте,
   сортировкой по глубине (painter's), траектория спуска поверх. Чистый canvas,
   без библиотек. Камера задаётся углами yaw (поворот) и elev (наклон). */
(function () {
  "use strict";

  function heatColor(t) {
    t = Math.max(0, Math.min(1, t));
    const stops = [
      [0.00, [49, 46, 129]], [0.45, [99, 102, 241]],
      [0.66, [199, 210, 254]], [0.82, [254, 243, 199]], [1.00, [245, 158, 11]],
    ];
    for (let s = 0; s < stops.length - 1; s++) {
      const a = stops[s], b = stops[s + 1];
      if (t >= a[0] && t <= b[0]) {
        const f = (t - a[0]) / (b[0] - a[0] || 1);
        return [Math.round(a[1][0] + f * (b[1][0] - a[1][0])), Math.round(a[1][1] + f * (b[1][1] - a[1][1])), Math.round(a[1][2] + f * (b[1][2] - a[1][2]))];
      }
    }
    return stops[stops.length - 1][1];
  }

  // Сетка: значения L по домену функции + нормированные координаты и высота 0..1.
  function buildGrid(fn, N) {
    const d = fn.domain;
    const L = new Float64Array((N + 1) * (N + 1));
    let lmin = Infinity, lmax = -Infinity;
    for (let j = 0; j <= N; j++) {
      const v = d.vmin + (j / N) * (d.vmax - d.vmin);
      for (let i = 0; i <= N; i++) {
        const u = d.umin + (i / N) * (d.umax - d.umin);
        const val = fn.L(u, v);
        L[j * (N + 1) + i] = val;
        if (val < lmin) lmin = val; if (val > lmax) lmax = val;
      }
    }
    const span = Math.max(1e-9, lmax - lmin);
    const hd = (val) => Math.log1p(9 * Math.max(0, Math.min(1, (val - lmin) / span))) / Math.log(10);
    return { N, L, lmin, lmax, span, hd, domain: d };
  }

  function project(x, y, z, cam) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
    const ce = Math.cos(cam.elev), se = Math.sin(cam.elev);
    const HS = 1.15;
    return { sx: x1, sy: y1 * se - z * HS * ce, depth: y1 * ce + z * HS * se };
  }

  function render(ctx, grid, fn, gd, cam, W, H) {
    const N = grid.N, L = grid.L, hd = grid.hd, d = grid.domain;
    const S = 0.40 * Math.min(W, H);
    const cx = W / 2, cyc = H * 0.56;
    const xn = (i) => (i / N) * 2 - 1;
    const scr = (x, y, z) => { const p = project(x, y, z, cam); return { X: cx + S * p.sx, Y: cyc + S * p.sy, depth: p.depth }; };

    // спроецировать все вершины
    const P = new Array((N + 1) * (N + 1));
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const z = hd(L[j * (N + 1) + i]);
      P[j * (N + 1) + i] = scr(xn(i), xn(j), z);
    }
    // квады с глубиной и высотой
    const quads = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = P[j * (N + 1) + i], b = P[j * (N + 1) + i + 1], c = P[(j + 1) * (N + 1) + i + 1], e = P[(j + 1) * (N + 1) + i];
      const zh = (hd(L[j * (N + 1) + i]) + hd(L[j * (N + 1) + i + 1]) + hd(L[(j + 1) * (N + 1) + i + 1]) + hd(L[(j + 1) * (N + 1) + i]) ) / 4;
      quads.push({ a, b, c, e, depth: (a.depth + b.depth + c.depth + e.depth) / 4, zh });
    }
    quads.sort((p, q) => q.depth - p.depth); // далёкие первыми

    for (const q of quads) {
      const col = heatColor(q.zh);
      // лёгкое затенение по высоте для объёма
      const sh = 0.78 + 0.22 * q.zh;
      ctx.fillStyle = `rgb(${Math.round(col[0] * sh)},${Math.round(col[1] * sh)},${Math.round(col[2] * sh)})`;
      ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(q.a.X, q.a.Y); ctx.lineTo(q.b.X, q.b.Y); ctx.lineTo(q.c.X, q.c.Y); ctx.lineTo(q.e.X, q.e.Y); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    // координаты функции → нормированные
    const xnu = (u) => (u - d.umin) / (d.umax - d.umin) * 2 - 1;
    const xnv = (v) => (v - d.vmin) / (d.vmax - d.vmin) * 2 - 1;
    const liftL = (u, v) => hd(fn.L(u, v)) + 0.02;

    // минимумы
    for (const m of fn.minima) {
      const s = scr(xnu(m.u), xnv(m.v), liftL(m.u, m.v));
      ctx.fillStyle = "#10b981"; ctx.beginPath(); ctx.arc(s.X, s.Y, 4.2, 0, 7); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6; ctx.stroke();
    }

    // траектория
    if (gd && gd.path.length) {
      ctx.strokeStyle = "rgba(239,68,68,.95)"; ctx.lineWidth = 2.4; ctx.lineJoin = "round"; ctx.beginPath();
      for (let i = 0; i < gd.path.length; i++) {
        const pt = gd.path[i]; const s = scr(xnu(pt.u), xnv(pt.v), liftL(pt.u, pt.v));
        if (i === 0) ctx.moveTo(s.X, s.Y); else ctx.lineTo(s.X, s.Y);
      }
      ctx.stroke();
      // старт
      const p0 = gd.path[0], s0 = scr(xnu(p0.u), xnv(p0.v), liftL(p0.u, p0.v));
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s0.X, s0.Y, 3.6, 0, 7); ctx.fill();
      ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2; ctx.stroke();
      // текущая
      const pl = gd.path[gd.path.length - 1], sl = scr(xnu(pl.u), xnv(pl.v), liftL(pl.u, pl.v));
      ctx.fillStyle = "rgba(239,68,68,.2)"; ctx.beginPath(); ctx.arc(sl.X, sl.Y, 9, 0, 7); ctx.fill();
      ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(sl.X, sl.Y, 5, 0, 7); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  window.GD3D = { buildGrid, render };
})();
