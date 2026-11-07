// Générateur pseudo-aléatoire reproductible (mulberry32).
// La même graine + les mêmes réglages redonnent la même partition.

export function newSeed() {
  return Math.floor(Math.random() * 900000) + 100000;
}

export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    /** items : [[valeur, poids], …] */
    weighted(items) {
      const total = items.reduce((s, [, w]) => s + Math.max(0, w), 0);
      if (total <= 0) return items.length ? items[0][0] : undefined;
      let r = next() * total;
      for (const [v, w] of items) {
        r -= Math.max(0, w);
        if (r <= 0) return v;
      }
      return items[items.length - 1][0];
    },
  };
  return rng;
}
