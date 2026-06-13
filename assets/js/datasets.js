/* Генераторы датасетов для визуализаций.
   Все точки нормализованы в [0,1] x [0,1]. y растёт вниз (как на canvas). */
(function () {
  // Детерминированный ГПСЧ (mulberry32) — чтобы "Новые данные" давали
  // воспроизводимую, но разную картинку при смене seed.
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Нормальное распределение через Box–Muller.
  function gauss(r, mean, sd) {
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp = (x) => Math.max(0.04, Math.min(0.96, x));
  const P = (x, y) => ({ x: clamp(x), y: clamp(y) });

  // Смайлик: контур лица, два глаза, улыбка + немного шума.
  function smiley(n, r) {
    const pts = [];
    const face = Math.floor(n * 0.42);
    for (let i = 0; i < face; i++) {
      const a = r() * Math.PI * 2, rad = 0.40 + gauss(r, 0, 0.012);
      pts.push(P(0.5 + rad * Math.cos(a), 0.5 + rad * Math.sin(a)));
    }
    const eye = Math.floor(n * 0.11);
    for (let i = 0; i < eye; i++) pts.push(P(gauss(r, 0.37, 0.028), gauss(r, 0.38, 0.028)));
    for (let i = 0; i < eye; i++) pts.push(P(gauss(r, 0.63, 0.028), gauss(r, 0.38, 0.028)));
    const mouth = Math.floor(n * 0.24);
    for (let i = 0; i < mouth; i++) {
      const t = Math.PI * (0.18 + 0.64 * (i / mouth)); // нижняя дуга — улыбка
      pts.push(P(0.5 + 0.26 * Math.cos(t) * -1 + gauss(r, 0, 0.01), 0.50 + 0.24 * Math.sin(t) + gauss(r, 0, 0.01)));
    }
    const noise = n - pts.length;
    for (let i = 0; i < noise; i++) pts.push(P(r(), r()));
    return pts;
  }

  // Концентрические кольца (DBSCAN ловит их там, где K-Means ломается).
  function circles(n, r) {
    const pts = [];
    const rings = [0.16, 0.32, 0.46];
    const total = rings.reduce((s, x) => s + x, 0);
    rings.forEach((rad) => {
      const cnt = Math.floor(n * rad / total);
      for (let i = 0; i < cnt; i++) {
        const a = r() * Math.PI * 2, rr = rad + gauss(r, 0, 0.012);
        pts.push(P(0.5 + rr * Math.cos(a), 0.5 + rr * Math.sin(a)));
      }
    });
    return pts;
  }

  // Несколько гауссовых сгустков.
  function blobs(n, r, k) {
    k = k || 4;
    const centers = [];
    for (let i = 0; i < k; i++) centers.push({ x: 0.22 + r() * 0.56, y: 0.22 + r() * 0.56 });
    const pts = [];
    for (let i = 0; i < n; i++) {
      const c = centers[i % k];
      pts.push(P(gauss(r, c.x, 0.055), gauss(r, c.y, 0.055)));
    }
    return pts;
  }

  // Две переплетённые полудуги (классический make_moons).
  function moons(n, r) {
    const pts = [];
    const half = Math.floor(n / 2);
    for (let i = 0; i < half; i++) {
      const t = Math.PI * (i / half);
      pts.push(P(0.30 + 0.34 * Math.cos(t) + gauss(r, 0, 0.02),
                 0.62 - 0.34 * Math.sin(t) + gauss(r, 0, 0.02)));
    }
    for (let i = 0; i < n - half; i++) {
      const t = Math.PI * (i / (n - half));
      pts.push(P(0.50 + 0.34 * Math.cos(t) + gauss(r, 0, 0.02),
                 0.40 + 0.34 * Math.sin(t) + gauss(r, 0, 0.02)));
    }
    return pts;
  }

  // Равномерный шум + пара слабых сгустков — много "noise" для наглядности.
  function uniform(n, r) {
    const pts = [];
    const blob = Math.floor(n * 0.35);
    for (let i = 0; i < blob; i++) pts.push(P(gauss(r, 0.35, 0.06), gauss(r, 0.6, 0.06)));
    for (let i = 0; i < n - blob; i++) pts.push(P(r(), r()));
    return pts;
  }

  const GENERATORS = { smiley, circles, blobs, moons, uniform };

  window.Datasets = {
    list: [
      { id: "smiley",  name: "Смайлик" },
      { id: "circles", name: "Кольца" },
      { id: "blobs",   name: "Сгустки" },
      { id: "moons",   name: "Полумесяцы" },
      { id: "uniform", name: "Шум + сгусток" },
    ],
    generate(id, n, seed) {
      const gen = GENERATORS[id] || blobs;
      return gen(n, rng(seed));
    },
  };
})();
