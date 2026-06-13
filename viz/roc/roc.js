/* Логика для «Метрики классификации и ROC».
   Генерирует два перекрывающихся распределения скоров (класс 0 и класс 1),
   считает матрицу ошибок и метрики при заданном пороге t,
   строит полную ROC-кривую (TPR vs FPR) и PR-кривую, считает AUC.

   Свой ГПСЧ (mulberry32) и Box–Muller — по образцу assets/js/datasets.js,
   чтобы визуализация была самодостаточной и воспроизводимой.            */
(function () {
  "use strict";

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r, mean, sd) {
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  /* Сгенерировать выборку.
     n          — число объектов
     posFrac    — доля положительного класса (класс 1), баланс
     separation — разделимость: 0 (полное перекрытие) .. 1 (далеко разведены)
     Возвращает { scores:[...], labels:[0/1,...] }, score ∈ [0,1].          */
  function generate(n, posFrac, separation, seed) {
    const r = rng(seed);
    const nPos = Math.max(1, Math.min(n - 1, Math.round(n * posFrac)));
    const nNeg = n - nPos;

    // Центры распределений расходятся от 0.5 с ростом разделимости.
    const gap = 0.06 + 0.40 * separation;   // расстояние между центрами
    const mu0 = 0.5 - gap / 2;               // класс 0 — ниже по score
    const mu1 = 0.5 + gap / 2;               // класс 1 — выше по score
    const sd = 0.085 + 0.075 * (1 - separation); // при слабой разделимости шире

    const scores = new Float64Array(n);
    const labels = new Int8Array(n);
    let k = 0;
    for (let i = 0; i < nNeg; i++) { scores[k] = clamp01(gauss(r, mu0, sd)); labels[k] = 0; k++; }
    for (let i = 0; i < nPos; i++) { scores[k] = clamp01(gauss(r, mu1, sd)); labels[k] = 1; k++; }
    return { scores: Array.from(scores), labels: Array.from(labels), nPos, nNeg };
  }

  /* Матрица ошибок при пороге t: объект считается положительным, если score >= t.
       TP — истинно положительный, FP — ложно положительный,
       FN — ложно отрицательный, TN — истинно отрицательный.               */
  function confusion(data, t) {
    let TP = 0, FP = 0, FN = 0, TN = 0;
    const s = data.scores, y = data.labels;
    for (let i = 0; i < s.length; i++) {
      const pred = s[i] >= t ? 1 : 0;
      if (y[i] === 1) { if (pred === 1) TP++; else FN++; }
      else { if (pred === 1) FP++; else TN++; }
    }
    return { TP, FP, FN, TN };
  }

  // Стандартные формулы метрик классификации (контроль качества, неделя 2).
  function metrics(cm) {
    const { TP, FP, FN, TN } = cm;
    const precision = TP + FP > 0 ? TP / (TP + FP) : 0;            // точность
    const recall = TP + FN > 0 ? TP / (TP + FN) : 0;              // полнота = TPR
    const specificity = TN + FP > 0 ? TN / (TN + FP) : 0;        // 1 − FPR
    const fpr = 1 - specificity;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    const accuracy = (TP + TN) / Math.max(1, TP + FP + FN + TN);
    return { precision, recall, specificity, fpr, tpr: recall, f1, accuracy };
  }

  /* ROC-кривая: проходим все пороги, на каждом — точка (FPR, TPR).
     Удобнее построить, отсортировав скоры по убыванию и двигая порог.
     Возвращает массив точек {t, fpr, tpr, precision, recall} от t=1 до t=0
     и значение AUC (площадь под ROC) по формуле трапеций.                 */
  function rocCurve(data) {
    const P = data.nPos, N = data.nNeg;
    const idx = data.scores.map((s, i) => i).sort((a, b) => data.scores[b] - data.scores[a]);

    const pts = [];
    // Точка при пороге выше всех скоров: ничего не положительно.
    pts.push({ t: 1.0001, fpr: 0, tpr: 0, precision: 1, recall: 0, tp: 0, fp: 0 });

    let tp = 0, fp = 0, i = 0;
    while (i < idx.length) {
      const thr = data.scores[idx[i]];
      // Сдвигаем все объекты с равным скором за один шаг (корректная ROC).
      while (i < idx.length && data.scores[idx[i]] === thr) {
        if (data.labels[idx[i]] === 1) tp++; else fp++;
        i++;
      }
      const tpr = P > 0 ? tp / P : 0;
      const fpr = N > 0 ? fp / N : 0;
      const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
      pts.push({ t: thr, fpr, tpr, precision, recall: tpr, tp, fp });
    }

    // AUC по трапециям вдоль FPR.
    let auc = 0;
    for (let j = 1; j < pts.length; j++) {
      const dx = pts[j].fpr - pts[j - 1].fpr;
      auc += dx * (pts[j].tpr + pts[j - 1].tpr) / 2;
    }
    return { pts, auc };
  }

  /* Плотности по score для гистограммы: bins одинаковой ширины [0,1],
     раздельно для класса 0 и 1. Возвращает {edges, c0, c1, maxCount}.    */
  function histogram(data, nbins) {
    nbins = nbins || 34;
    const c0 = new Array(nbins).fill(0);
    const c1 = new Array(nbins).fill(0);
    const s = data.scores, y = data.labels;
    for (let i = 0; i < s.length; i++) {
      let b = Math.floor(s[i] * nbins);
      if (b >= nbins) b = nbins - 1; if (b < 0) b = 0;
      if (y[i] === 1) c1[b]++; else c0[b]++;
    }
    let maxCount = 1;
    for (let b = 0; b < nbins; b++) { if (c0[b] > maxCount) maxCount = c0[b]; if (c1[b] > maxCount) maxCount = c1[b]; }
    return { nbins, c0, c1, maxCount };
  }

  window.RocModel = { generate, confusion, metrics, rocCurve, histogram };
})();
