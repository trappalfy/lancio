/**
 * Hero particle field (HERO_PARTICLES.md; port of reference/hero-particles/hero.html).
 * The painting is rebuilt from tens of thousands of WebGL points, one per sampled pixel and coloured by it.
 * The pointer drags and scatters them; each springs home at its own rate, so the picture settles back like dust.
 * CPU simulation on typed arrays + a single gl.POINTS draw per frame. No React, no libraries.
 */

/** Frame clear colour = --bg (#14100C), so the canvas edge never shows. */
const BG = [20 / 255, 16 / 255, 12 / 255] as const;
/** Below this canvas width (CSS px): phone budget, cursor radius and framing. */
const NARROW = 700;
/** Share of the free horizontal space left of the painting when it is cover-fitted. Hero.tsx frames the static image with the same values. */
export const FRAMING = { wide: 0.85, narrow: 0.62 } as const;

const BUDGET = { wide: 140_000, narrow: 42_000 };
const RADIUS = { wide: 140, narrow: 90 };
const DAMPING = 0.9;
/** Pointer velocity decay per frame: a still cursor stops dragging (it keeps a small radial push). */
const POINTER_DECAY = 0.86;

const VS = `
attribute vec2 p;
attribute vec4 c;
uniform vec2 r;
uniform float s;
varying vec4 v;
void main() {
  v = c;
  gl_Position = vec4(p / r * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y *= -1.0;
  gl_PointSize = s;
}`;

/** Round points, plain alpha blending (no additive: the painting must keep its values). */
const FS = `
precision mediump float;
varying vec4 v;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard;
  gl_FragColor = v;
}`;

export type ParticleField = {
  /** Resample the painting for the current canvas size. `intro`: start scattered around the picture and fly in. */
  build(intro: boolean): void;
  /** True while the canvas still has the size and pixel ratio of the last build. */
  fits(): boolean;
  /** Advance the simulation one frame. Returns the largest squared particle speed, (px/frame)². */
  step(): number;
  draw(): void;
  /** Put every particle at home and stop it (used once the field has come to rest). */
  settle(): void;
  /** Pointer position in canvas CSS px. The first move after a release sets the position without velocity. */
  pointerMove(x: number, y: number): void;
  pointerRelease(): void;
  readonly pointerActive: boolean;
  readonly count: number;
  destroy(): void;
};

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
}

/** Null when there is no hardware WebGL (the caller keeps the static painting). */
export function createParticleField(canvas: HTMLCanvasElement, img: HTMLImageElement): ParticleField | null {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    // software GL cannot move 140k points at 60 fps; the static painting is the better experience there
    failIfMajorPerformanceCaveat: true,
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VS);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const aP = gl.getAttribLocation(prog, "p");
  const aC = gl.getAttribLocation(prog, "c");
  const uR = gl.getUniformLocation(prog, "r");
  const uS = gl.getUniformLocation(prog, "s");
  const bP = gl.createBuffer();
  const bC = gl.createBuffer();
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(BG[0], BG[1], BG[2], 1);

  let n = 0;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let radius: number = RADIUS.wide;
  let home = new Float32Array(0);
  let pos = new Float32Array(0);
  let vel = new Float32Array(0);
  let k = new Float32Array(0);
  const m = { x: -1e4, y: -1e4, vx: 0, vy: 0, active: false };

  function build(intro: boolean) {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    n = 0;
    if (W < 1 || H < 1) return;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    gl!.viewport(0, 0, canvas.width, canvas.height);

    const narrow = W < NARROW;
    radius = narrow ? RADIUS.narrow : RADIUS.wide;

    // Cover-fit, weighted right so the left stays free for the headline.
    const ia = img.naturalWidth / img.naturalHeight;
    let dw = W;
    let dh = W / ia;
    if (dh < H) {
      dh = H;
      dw = H * ia;
    }
    const ox = (W - dw) * (narrow ? FRAMING.narrow : FRAMING.wide);
    const oy = (H - dh) * 0.5;

    // One grid cell → at most one particle, at a random spot inside the cell.
    const cell = Math.sqrt((W * H) / ((narrow ? BUDGET.narrow : BUDGET.wide) * 1.35));
    const gw = Math.ceil(W / cell);
    const gh = Math.ceil(H / cell);
    const off = document.createElement("canvas");
    off.width = gw;
    off.height = gh;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, gw, gh);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, ox / cell, oy / cell, dw / cell, dh / cell);
    const px = ctx.getImageData(0, 0, gw, gh).data;

    // Density and opacity fall off towards the left edge, under the headline.
    const fadeFrom = narrow ? 0 : 0.12;
    const fadeWidth = narrow ? 0.5 : 0.42;
    const homes = new Float32Array(gw * gh * 2);
    const colors = new Uint8Array(gw * gh * 4);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = (y * gw + x) * 4;
        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
        if (lum < 0.06) continue; // black background
        const sx = (x + Math.random()) * cell;
        const sy = (y + Math.random()) * cell;
        const fx = Math.min(1, Math.max(0, (sx / W - fadeFrom) / fadeWidth));
        if (Math.random() > Math.min(1, 0.25 + lum * 1.6) * (0.3 + 0.7 * fx)) continue;
        homes[2 * n] = sx;
        homes[2 * n + 1] = sy;
        colors[4 * n] = Math.min(255, r * 1.15);
        colors[4 * n + 1] = Math.min(255, g * 1.15);
        colors[4 * n + 2] = Math.min(255, b * 1.15);
        colors[4 * n + 3] = (0.45 + 0.55 * fx) * 255;
        n++;
      }
    }

    home = homes.slice(0, 2 * n);
    pos = new Float32Array(2 * n);
    vel = new Float32Array(2 * n);
    k = new Float32Array(n);
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < n; i++) {
      cx += home[2 * i];
      cy += home[2 * i + 1];
    }
    cx /= n || 1;
    cy /= n || 1;
    const spread = Math.max(W, H);
    for (let i = 0; i < n; i++) {
      k[i] = 0.012 + Math.random() * 0.03;
      if (intro) {
        // scattered on a ring around the centre of the picture
        const a = Math.random() * Math.PI * 2;
        const rr = spread * (0.35 + Math.random() * 0.6);
        pos[2 * i] = cx + Math.cos(a) * rr;
        pos[2 * i + 1] = cy + Math.sin(a) * rr;
      } else {
        pos[2 * i] = home[2 * i];
        pos[2 * i + 1] = home[2 * i + 1];
      }
    }

    gl!.bindBuffer(gl!.ARRAY_BUFFER, bC);
    gl!.bufferData(gl!.ARRAY_BUFFER, colors.subarray(0, 4 * n), gl!.STATIC_DRAW);
    gl!.enableVertexAttribArray(aC);
    gl!.vertexAttribPointer(aC, 4, gl!.UNSIGNED_BYTE, true, 0, 0);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, bP);
    gl!.bufferData(gl!.ARRAY_BUFFER, pos, gl!.DYNAMIC_DRAW);
    gl!.enableVertexAttribArray(aP);
    gl!.vertexAttribPointer(aP, 2, gl!.FLOAT, false, 0, 0);
    gl!.uniform2f(uR, W, H);
    gl!.uniform1f(uS, Math.max(1.4, cell * 0.95) * dpr);
  }

  function step() {
    m.vx *= POINTER_DECAY;
    m.vy *= POINTER_DECAY;
    const mx = m.x;
    const my = m.y;
    const mvx = m.vx * 0.8;
    const mvy = m.vy * 0.8;
    const R = radius;
    const R2 = R * R;
    const push = (0.8 + Math.hypot(m.vx, m.vy) * 0.12) * 3.2;
    let maxV2 = 0;
    for (let i = 0, j = 0; i < n; i++, j += 2) {
      const px = pos[j];
      const py = pos[j + 1];
      // spring towards home, own stiffness per particle
      let vx = vel[j] + (home[j] - px) * k[i];
      let vy = vel[j + 1] + (home[j + 1] - py) * k[i];
      const dx = px - mx;
      const dy = py - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < R2) {
        // drag along the pointer's path + push outward, both falling off as (1 − d/R)²
        const d = Math.sqrt(d2) + 0.001;
        const f = 1 - d / R;
        const f2 = f * f;
        const out = (push * f2) / d;
        vx += mvx * f2 + dx * out;
        vy += mvy * f2 + dy * out;
      }
      vx *= DAMPING;
      vy *= DAMPING;
      pos[j] = px + vx;
      pos[j + 1] = py + vy;
      vel[j] = vx;
      vel[j + 1] = vy;
      const v2 = vx * vx + vy * vy;
      if (v2 > maxV2) maxV2 = v2;
    }
    return maxV2;
  }

  function draw() {
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    if (!n) return;
    gl!.bindBuffer(gl!.ARRAY_BUFFER, bP);
    gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, pos);
    gl!.drawArrays(gl!.POINTS, 0, n);
  }

  return {
    build,
    fits() {
      const r = canvas.getBoundingClientRect();
      return Math.abs(r.width - W) < 1 && Math.abs(r.height - H) < 1 && Math.min(window.devicePixelRatio || 1, 2) === dpr;
    },
    step,
    draw,
    settle() {
      pos.set(home);
      vel.fill(0);
    },
    pointerMove(x, y) {
      if (m.active) {
        m.vx = m.vx * 0.5 + (x - m.x) * 0.5;
        m.vy = m.vy * 0.5 + (y - m.y) * 0.5;
      }
      m.x = x;
      m.y = y;
      m.active = true;
    },
    pointerRelease() {
      m.active = false;
      m.x = m.y = -1e4;
      m.vx = m.vy = 0;
    },
    get pointerActive() {
      return m.active;
    },
    get count() {
      return n;
    },
    destroy() {
      gl.deleteBuffer(bP);
      gl.deleteBuffer(bC);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      n = 0;
    },
  };
}
