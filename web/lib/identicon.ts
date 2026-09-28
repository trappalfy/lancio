/** Deterministic identicons in the brand palette. Pure functions — safe on server and client. */

const BGS = ["#2a2019", "#4c3a2b", "#1e1610", "#6a4f36", "#3a2e22"];
const FGS = ["#c9a058", "#e8dcc4", "#a07a4a", "#b08a4a", "#d8b878", "#8fa05a", "#b0493a"];

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: string) {
  let s = hash(seed.toLowerCase()) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** 5×5 mirrored grid (address avatars). */
export function identiconSvg(seed: string, size = 64): string {
  const r = rng(seed);
  const bg = BGS[Math.floor(r() * BGS.length)];
  const fg = FGS[Math.floor(r() * 5)];
  const cell = size / 6;
  const pad = cell / 2;
  let rects = "";
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if (r() < 0.5) continue;
      for (const xx of x === 2 ? [2] : [x, 4 - x]) {
        rects += `<rect x="${(pad + xx * cell).toFixed(2)}" y="${(pad + y * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" rx="${(cell / 4).toFixed(2)}"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${bg}"/><g fill="${fg}">${rects}</g></svg>`;
}

/** Emblem-style square image (mock token images): gradient field, sun disc, rays or rings. */
export function emblemSvg(seed: string): string {
  const r = rng(`emblem:${seed}`);
  const bg1 = BGS[Math.floor(r() * BGS.length)];
  const bg2 = BGS[Math.floor(r() * BGS.length)];
  const fg = FGS[Math.floor(r() * FGS.length)];
  const fg2 = FGS[Math.floor(r() * FGS.length)];
  const cx = 60 + r() * 80;
  const cy = 60 + r() * 80;
  const rad = 24 + r() * 36;
  const rays = 6 + Math.floor(r() * 10);
  let shapes = "";
  if (r() < 0.55) {
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const x2 = cx + Math.cos(a) * (rad + 40);
      const y2 = cy + Math.sin(a) * (rad + 40);
      shapes += `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${fg2}" stroke-width="${(3 + r() * 5).toFixed(1)}" stroke-linecap="round" opacity=".7"/>`;
    }
  } else {
    for (let i = 1; i <= 3; i++) {
      shapes += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(rad + i * 14).toFixed(1)}" fill="none" stroke="${fg2}" stroke-width="2" opacity="${(0.8 - i * 0.2).toFixed(2)}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/>${shapes}<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(1)}" fill="${fg}"/></svg>`;
}

export const svgDataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
