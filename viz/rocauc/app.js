/* ROC-кривая и AUC — как строится по таблице.
   Люди отсортированы по скору ↓. Опускаем порог: каждый включённый человек
   двигает точку — больной = шаг ВВЕРХ (TPR↑), здоровый = шаг ВПРАВО (FPR↑).
   Таблица ↔ строка ↔ точка кривой ↔ порог связаны подсветкой. Vanilla JS.
   Таблица строится один раз; при наведении только переключаются классы — так
   плавно работает и на сотнях строк. */
(function () {
  "use strict";

  const UP = "#0f9d58", RIGHT = "#dc2626", ACCENT = "#4f46e5";
  const $ = (s) => document.querySelector(s);

  const state = { count: 12, sep: 0.22, seed: 5, pinned: 0, hover: -1, timer: 0 };
  let DATA = [];      // sorted desc by score: [{sick, score, rank}]
  let PTS = [];       // points[0..N]: {tp,fp,fpr,tpr,tau,sick}
  let P = 0, Nn = 0, AUC = 0;
  let rowEls = [], predEls = [];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r, m, sd) {
    let u = 0, v = 0;
    while (u === 0) u = r(); while (v === 0) v = r();
    return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function generate() {
    const r = mulberry32(state.seed), n = state.count;
    let arr = [];
    for (let tries = 0; tries < 50; tries++) {
      arr = []; let np = 0;
      for (let i = 0; i < n; i++) {
        const sick = r() < 0.5; if (sick) np++;
        const score = clamp(gauss(r, sick ? 0.5 + state.sep : 0.5 - state.sep, 0.16), 0.01, 0.99);
        arr.push({ sick, score });
      }
      if (np >= 1 && np <= n - 1) break;
    }
    arr.forEach((d, i) => { d.score += i * 1e-7; });        // различимые скоры
    arr.sort((a, b) => b.score - a.score);
    arr.forEach((d, i) => { d.rank = i + 1; });
    DATA = arr;
    P = arr.filter((d) => d.sick).length; Nn = arr.length - P;
    computePoints();
    state.pinned = Math.round(arr.length / 2);
    state.hover = -1; resetView();
    if (state.timer) { clearInterval(state.timer); state.timer = 0; }
  }
  function computePoints() {
    PTS = [{ tp: 0, fp: 0, fpr: 0, tpr: 0, tau: Infinity, sick: null }];
    let tp = 0, fp = 0;
    for (let i = 0; i < DATA.length; i++) {
      const d = DATA[i]; if (d.sick) tp++; else fp++;
      PTS.push({ tp, fp, fpr: fp / Nn, tpr: tp / P, tau: d.score, sick: d.sick });
    }
    AUC = 0;
    for (let i = 1; i < PTS.length; i++) AUC += (PTS[i].fpr - PTS[i - 1].fpr) * (PTS[i].tpr + PTS[i - 1].tpr) / 2;
  }
  const cur = () => (state.hover >= 0 ? state.hover : state.pinned);

  // ---------- таблица (строим один раз) ----------
  function renderTable() {
    const tb = $("#tbody"); tb.innerHTML = ""; rowEls = []; predEls = [];
    DATA.forEach((d) => {
      const tr = document.createElement("tr");
      tr.className = "body"; tr.dataset.rank = d.rank;
      const fact = d.sick ? `<span class="badge-c b-sick">🔴 болен</span>` : `<span class="badge-c b-heal">🟢 здоров</span>`;
      const step = d.sick ? `<span class="step-up">↑ вверх</span>` : `<span class="step-right">→ вправо</span>`;
      tr.innerHTML = `<td>${d.rank}</td><td class="s">${d.score.toFixed(2)}</td><td>${fact}</td><td>${step}</td><td class="predcell"></td>`;
      tr.addEventListener("mouseenter", () => { state.hover = d.rank; renderAll(); });
      tr.addEventListener("mouseleave", () => { state.hover = -1; renderAll(); });
      tr.addEventListener("click", () => { stopAnim(); state.pinned = d.rank; state.hover = -1; renderAll(); });
      tb.appendChild(tr);
      rowEls.push(tr); predEls.push(tr.querySelector(".predcell"));
    });
  }
  // только переключаем классы и текст прогноза — без пересборки
  function updateTable() {
    const k = cur();
    for (let i = 0; i < DATA.length; i++) {
      const rank = i + 1;
      let cls = "body";
      if (rank <= k) cls += " pos";
      if (rank === k) cls += " cur";
      if (state.hover === rank) cls += " hl";
      rowEls[i].className = cls;
      predEls[i].innerHTML = rank <= k ? `<span class="pred sick">«болен»</span>` : `<span class="pred healthy">«здоров»</span>`;
    }
  }

  // ---------- ROC canvas ----------
  const canvas = $("#roc"), ctx = canvas.getContext("2d");
  let W = 0, H = 0;
  const PAD = { l: 50, r: 16, t: 16, b: 44 };
  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawROC();
  }
  const view = { x0: 0, x1: 1, y0: 0, y1: 1 };   // видимая область (зум)
  const plot = () => ({ x: PAD.l, y: PAD.t, w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b });
  const X = (fpr) => { const p = plot(); return p.x + (fpr - view.x0) / (view.x1 - view.x0) * p.w; };
  const Y = (tpr) => { const p = plot(); return p.y + p.h - (tpr - view.y0) / (view.y1 - view.y0) * p.h; };
  const fprAt = (Xp) => { const p = plot(); return view.x0 + (Xp - p.x) / p.w * (view.x1 - view.x0); };
  const tprAt = (Yp) => { const p = plot(); return view.y0 + (p.y + p.h - Yp) / p.h * (view.y1 - view.y0); };
  function resetView() { view.x0 = 0; view.x1 = 1; view.y0 = 0; view.y1 = 1; }
  function clampView() {
    const wx = view.x1 - view.x0, wy = view.y1 - view.y0;
    if (view.x0 < 0) { view.x0 = 0; view.x1 = wx; } if (view.x1 > 1) { view.x1 = 1; view.x0 = 1 - wx; }
    if (view.y0 < 0) { view.y0 = 0; view.y1 = wy; } if (view.y1 > 1) { view.y1 = 1; view.y0 = 1 - wy; }
  }

  function drawROC() {
    if (!W) return;
    const p = plot(), k = cur(), N = DATA.length;
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(20,23,28,.06)"; ctx.fillStyle = "#8a93a3"; ctx.font = "11px -apple-system, system-ui, sans-serif"; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const fx = view.x0 + (view.x1 - view.x0) * i / 4, fy = view.y0 + (view.y1 - view.y0) * i / 4;
      const gx = X(fx), gy = Y(fy);
      ctx.beginPath(); ctx.moveTo(gx, p.y); ctx.lineTo(gx, p.y + p.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x, gy); ctx.lineTo(p.x + p.w, gy); ctx.stroke();
      ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(fx.toFixed(2), gx, p.y + p.h + 6);
      ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(fy.toFixed(2), p.x - 7, gy);
    }
    ctx.fillStyle = "#5b6472"; ctx.font = "11.5px -apple-system, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("FPR — ложные тревоги", p.x + p.w / 2, p.y + p.h + 22);
    ctx.save(); ctx.translate(p.x - 36, p.y + p.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("TPR — Recall", 0, 0); ctx.restore();

    // клип под зум: всё содержимое поля рисуем внутри прямоугольника
    ctx.save(); ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip();

    // площадь под кривой
    ctx.beginPath(); ctx.moveTo(X(0), Y(0));
    for (const pt of PTS) ctx.lineTo(X(pt.fpr), Y(pt.tpr));
    ctx.lineTo(X(1), Y(0)); ctx.closePath();
    ctx.fillStyle = "rgba(79,70,229,.10)"; ctx.fill();

    // диагональ
    ctx.strokeStyle = "rgba(20,23,28,.28)"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(1), Y(1)); ctx.stroke(); ctx.setLineDash([]);

    // полная лесенка бледно
    ctx.strokeStyle = "rgba(20,23,28,.18)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(0), Y(0));
    for (const pt of PTS) ctx.lineTo(X(pt.fpr), Y(pt.tpr));
    ctx.stroke();

    // лесенка до среза — цветные шаги
    ctx.lineCap = "round";
    for (let i = 1; i <= k; i++) {
      const a = PTS[i - 1], b = PTS[i];
      ctx.strokeStyle = b.sick ? UP : RIGHT; ctx.lineWidth = N > 120 ? 2.4 : 3.4;
      ctx.beginPath(); ctx.moveTo(X(a.fpr), Y(a.tpr)); ctx.lineTo(X(b.fpr), Y(b.tpr)); ctx.stroke();
    }
    ctx.lineCap = "butt";

    // вершины: для небольших N или при зуме — все видимые; иначе только текущая
    const showAll = N <= 40 || (view.x1 - view.x0) < 0.55;
    if (showAll) {
      for (let i = 0; i < PTS.length; i++) {
        const vx = X(PTS[i].fpr), vy = Y(PTS[i].tpr);
        if (vx < p.x - 8 || vx > p.x + p.w + 8 || vy < p.y - 8 || vy > p.y + p.h + 8) continue;
        ctx.beginPath(); ctx.arc(vx, vy, i === k ? 7 : 3.3, 0, 7);
        ctx.fillStyle = i === k ? ACCENT : (i <= k ? "#94a3b8" : "#cbd5e1"); ctx.fill();
        if (i === k) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); }
      }
    } else {
      const pt = PTS[k];
      ctx.beginPath(); ctx.arc(X(pt.fpr), Y(pt.tpr), 7, 0, 7);
      ctx.fillStyle = ACCENT; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();  // снять клип
  }

  // ---------- статистика ----------
  function renderStats() {
    const k = cur(), pt = PTS[k];
    $("#aucVal").textContent = AUC.toFixed(3);
    $("#tprVal").textContent = pt.tpr.toFixed(2) + " (" + pt.tp + "/" + P + ")";
    $("#fprVal").textContent = pt.fpr.toFixed(2) + " (" + pt.fp + "/" + Nn + ")";
    $("#tauVal").textContent = k === 0 ? "> макс" : k === DATA.length ? "0 (все)" : pt.tau.toFixed(2);
    $("#tpVal").textContent = pt.tp; $("#tnVal").textContent = Nn - pt.fp;
    $("#fpVal").textContent = pt.fp; $("#fnVal").textContent = P - pt.tp;
    $("#kVal").textContent = k;

    const tauTxt = k === 0 ? "выше всех (никого)" : k === DATA.length ? "ниже всех (все)" : "≥ " + pt.tau.toFixed(2);
    $("#cutInfo").innerHTML = `Порог <b>τ = ${tauTxt}</b>: верхние <b>${k}</b> из ${DATA.length} → «болен». Точка кривой <b>#${k}</b> = (FPR ${pt.fpr.toFixed(2)}, TPR ${pt.tpr.toFixed(2)}).`;

    $("#note").innerHTML =
      `<b>AUC = ${AUC.toFixed(3)}</b> — площадь под лесенкой = вероятность, что случайный <b class="sick">больной</b> получит скор <b>выше</b> случайного <b class="healthy">здорового</b>. ` +
      `Двигай срез: каждый <b class="sick">красный</b> — шаг вверх (поймали), каждый <b class="healthy">зелёный</b> — шаг вправо (ложная тревога). ` +
      `Больше людей (ползунок «Людей») → лесенка мельче и кривая глаже.`;
  }

  function renderAll() { updateTable(); drawROC(); renderStats(); }

  // ---------- наведение / клик / зум-пан по кривой ----------
  function localXY(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function nearestPt(mx, my, rad) {
    let best = -1, bd = rad;
    for (let i = 0; i < PTS.length; i++) { const d = Math.hypot(mx - X(PTS[i].fpr), my - Y(PTS[i].tpr)); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  canvas.addEventListener("mousedown", (e) => { const [mx, my] = localXY(e); state.drag = { mx, my, v: { ...view }, moved: false }; });
  window.addEventListener("mousemove", (e) => {
    const [mx, my] = localXY(e), p = plot();
    if (state.drag) {                                   // перетаскивание = пан
      const dx = (mx - state.drag.mx) / p.w * (state.drag.v.x1 - state.drag.v.x0);
      const dy = (my - state.drag.my) / p.h * (state.drag.v.y1 - state.drag.v.y0);
      if (Math.abs(mx - state.drag.mx) + Math.abs(my - state.drag.my) > 4) state.drag.moved = true;
      view.x0 = state.drag.v.x0 - dx; view.x1 = state.drag.v.x1 - dx;
      view.y0 = state.drag.v.y0 + dy; view.y1 = state.drag.v.y1 + dy;
      clampView(); drawROC(); return;
    }
    if (mx < p.x || mx > p.x + p.w || my < p.y || my > p.y + p.h) { if (state.hover >= 0) { state.hover = -1; renderAll(); } return; }
    const best = nearestPt(mx, my, 16);
    if (best !== state.hover) { state.hover = best; renderAll(); }
  });
  window.addEventListener("mouseup", (e) => {
    if (state.drag && !state.drag.moved) {              // клик без движения = выбрать точку
      const [mx, my] = localXY(e), best = nearestPt(mx, my, 22);
      if (best >= 0) { stopAnim(); state.pinned = best; state.hover = -1; renderAll(); }
    }
    state.drag = null;
  });
  canvas.addEventListener("mouseleave", () => { if (!state.drag && state.hover >= 0) { state.hover = -1; renderAll(); } });
  canvas.addEventListener("wheel", (e) => {            // колесо = зум к курсору
    e.preventDefault();
    const [mx, my] = localXY(e), p = plot();
    const f = e.deltaY < 0 ? 0.82 : 1.22;
    const wx = clamp((view.x1 - view.x0) * f, 0.03, 1), wy = clamp((view.y1 - view.y0) * f, 0.03, 1);
    const fx = fprAt(mx), fy = tprAt(my);
    view.x0 = fx - (mx - p.x) / p.w * wx; view.x1 = view.x0 + wx;
    view.y0 = fy - (p.y + p.h - my) / p.h * wy; view.y1 = view.y0 + wy;
    clampView(); drawROC();
  }, { passive: false });
  canvas.addEventListener("dblclick", () => { resetView(); drawROC(); });

  // ---------- анимация ----------
  function stopAnim() { if (state.timer) { clearInterval(state.timer); state.timer = 0; } }
  function build() {
    stopAnim(); state.hover = -1; state.pinned = 0; renderAll();
    const N = DATA.length, per = Math.max(1, Math.round(N / 60));
    state.timer = setInterval(() => {
      if (state.pinned >= N) { stopAnim(); return; }
      state.pinned = Math.min(N, state.pinned + per); renderAll();
    }, 90);
  }

  // ---------- контролы ----------
  function rebuild() { generate(); renderTable(); renderAll(); }
  $("#count").addEventListener("input", (e) => { stopAnim(); state.count = +e.target.value; $("#countVal").textContent = e.target.value; rebuild(); });
  $("#sep").addEventListener("input", (e) => {
    stopAnim(); state.sep = +e.target.value;
    $("#sepVal").textContent = state.sep < 0.12 ? "слабый" : state.sep < 0.28 ? "ср." : "сильный";
    rebuild();
  });
  $("#newData").addEventListener("click", () => { stopAnim(); state.seed = (state.seed * 1103515245 + 12345) >>> 0; rebuild(); });
  $("#build").addEventListener("click", build);
  $("#zoomReset").addEventListener("click", () => { resetView(); drawROC(); });
  window.addEventListener("resize", resize);

  // ---------- старт ----------
  $("#sepVal").textContent = "ср.";
  generate(); renderTable(); resize(); renderAll();
})();
