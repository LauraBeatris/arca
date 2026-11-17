/**
 * Bakes the paper and wood the server sends before WebGL draws them.
 *
 *   pnpm dev --port 3210
 *   pnpm papel                   # writes public/papel/*.webp
 *
 * The real paper is generated on the GPU (components/desk/gl/shaders.ts) and
 * only exists once the page's JavaScript runs. Until then each sheet is an
 * HTML box, and if that box is flat cream the sheet visibly changes when the
 * canvas takes over. This reads the generated textures out of the running
 * renderer, lights their grain the way the lamp at rest does, and measures
 * the real canvas so the baked paper ends up the same colour as the first
 * frame. The CSS in desk.css lays them under the sheets and the desk.
 *
 * Rerun it after changing the paper or wood generators, or the lighting.
 * Prints the desk's light falloff as gradient stops for `.mesa` in desk.css.
 * Needs a Mac: WebGL is drawn on the GPU through Metal.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.PAPEL_BASE ?? "http://localhost:3210";
const OUT = path.resolve("public/papel");
/** Output size of each tile, in px, and the css px it covers on the page. */
const TILES = {
  carta: { size: 1024, quality: 0.72 },
  maquina: { size: 1024, quality: 0.72 },
  madeira: { size: 750, quality: 0.8 },
};

const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
try {
  // A dense screen, so the renderer makes its larger bake, as most readers see it.
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  await page.goto(BASE);
  // Wait for the pile to settle: sheets still fading in show the desk through.
  await page.waitForFunction(() => document.querySelector(".mesa")?.dataset.papel === "on");
  await page.waitForTimeout(2500);
  const result = await page.evaluate(bake, TILES);
  await mkdir(OUT, { recursive: true });
  for (const [name, dataUrl] of Object.entries(result.images)) {
    const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
    await writeFile(path.join(OUT, `${name}.webp`), bytes);
    console.log(`public/papel/${name}.webp  ${(bytes.length / 1024).toFixed(1)} KB`);
  }
  console.log("\nmeasured on the canvas:", result.measured);
  console.log("\n.mesa light stops (multiply over the wood):");
  console.log(result.stops);
} finally {
  await browser.close();
}

/** Runs in the page. */
function bake(tiles) {
  const engine = window.__arca;
  const r = engine.renderer;
  const gl = r.gl;
  const dpr = r.dpr;

  // 1. What the canvas really shows: the top sheet's far corner, away from
  //    both lamp and candle (desk.css adds their glow on top as gradients),
  //    and the desk just beside the pile. Drawn and read in the same task,
  //    before the browser presents (and clears) the frame.
  const top = document.querySelector('.poema[data-rank="topo"] .folha');
  const box = top.getBoundingClientRect();
  const readMean = (cx, cy, half) => {
    const w = Math.round(half * 2 * dpr);
    const x = Math.round((cx - half) * dpr);
    const y = Math.round(gl.drawingBufferHeight - (cy + half) * dpr);
    const px = new Uint8Array(w * w * 4);
    gl.readPixels(x, y, w, w, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const sum = [0, 0, 0];
    for (let i = 0; i < px.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += px[i + c];
    return sum.map((v) => v / (w * w) / 255);
  };
  engine.draw();
  const sheetLit = readMean(box.x + box.width * 0.92, box.y + box.height * 0.06, 12);
  const deskAt = [box.x - 120, box.y + box.height / 2];
  const deskLit = readMean(deskAt[0], deskAt[1], 30);

  // 2. Light the grain of each texture as the lamp at rest does, into a
  //    small framebuffer, and read it back.
  const vert = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
  const frag = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAlbedo;
uniform sampler2D uRelief;
uniform vec3 uL;        // direction to the lamp
uniform float uK;       // how strongly the grain answers it
uniform float uReliefK;
uniform vec3 uAmb;      // light that ignores the grain
uniform vec3 uLamp;     // the lamp's share, which the grain shades
out vec4 o;
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec3 alb = texture(uAlbedo, uv).rgb;
  vec2 slope = (texture(uRelief, uv).xy * 2.0 - 1.0) * uReliefK;
  vec3 n = normalize(vec3(-slope, 1.0));
  float flatL = uL.z;
  float diffuse = max(mix(1.0, flatL, 0.5) + (dot(n, uL) - flatL) * uK, 0.0);
  vec3 shade = (uAmb + uLamp * diffuse) / (uAmb + uLamp * mix(1.0, flatL, 0.5));
  o = vec4(alb * shade, 1.0);
}`;
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vert));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  const u = (name) => gl.getUniformLocation(program, name);

  // The lamp at rest is up and to the left of the pile, 300px above the desk.
  const lampDir = (() => {
    const v = [-330, -270, 300];
    const len = Math.hypot(...v);
    return v.map((c) => c / len);
  })();

  const lit = (material, size, k, reliefK, amb, lamp) => {
    const target = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, size, size);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, size, size);
    gl.disable(gl.BLEND);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, material.albedo);
    gl.uniform1i(u("uAlbedo"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, material.relief);
    gl.uniform1i(u("uRelief"), 1);
    gl.uniform3fv(u("uL"), lampDir);
    gl.uniform1f(u("uK"), k);
    gl.uniform1f(u("uReliefK"), reliefK);
    gl.uniform3fv(u("uAmb"), amb);
    gl.uniform3fv(u("uLamp"), lamp);
    gl.bindVertexArray(r.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const px = new Uint8Array(size * size * 4);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(target);
    return px;
  };

  const mean = (px) => {
    const sum = [0, 0, 0];
    for (let i = 0; i < px.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += px[i + c];
    return sum.map((v) => v / (px.length / 4) / 255);
  };

  /** Scales each channel by `gain`, flips rows (GL reads bottom-up), encodes. */
  const encode = (px, size, gain, quality) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const from = ((size - 1 - y) * size + x) * 4;
        const to = (y * size + x) * 4;
        for (let c = 0; c < 3; c++) {
          image.data[to + c] = Math.min(255, Math.round(px[from + c] * gain[c]));
        }
        image.data[to + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/webp", quality);
  };

  // The lighting constants of shaders.ts, and the lamp's reach at the pile.
  const AMBIENT = [0.33, 0.35, 0.4];
  const LAMP = [1.0, 0.925, 0.8];
  const falloff = Math.max(620, Math.min(innerWidth, innerHeight) * 0.95);
  const [lx, ly] = engine.restLamp();
  const sheetD = Math.hypot(box.x + box.width / 2 - lx, box.y + box.height / 2 - ly, 300);
  const sheetAtt = 1 / (1 + (sheetD * sheetD) / (falloff * falloff));
  const paperLamp = LAMP.map((c) => c * 0.86 * sheetAtt);

  const images = {};
  // `relief` of each stock in lib/papers.ts.
  const PAPERS_RELIEF = { carta: 1.0, maquina: 0.75 };
  const litPaper = (id, size) =>
    lit(r.papers.get(id), size, 1.7, PAPERS_RELIEF[id], AMBIENT, paperLamp);
  // Each paper keeps its own colour; the lamp's brightness and warmth come
  // from the canvas (measured on the paper that was on top).
  const topPaper = top.closest(".poema").className.includes("papel-carta") ? "carta" : "maquina";
  const ref = mean(litPaper(topPaper, 64));
  const gain = sheetLit.map((v, c) => v / ref[c]);
  for (const id of ["carta", "maquina"]) {
    const { size, quality } = tiles[id];
    images[id] = encode(litPaper(id, size), size, gain, quality);
  }

  // 3. The desk: the wood's grain at full lamp, and the lamp's falloff as a
  //    radial gradient to multiply over it (the same formula as DESK_FRAG).
  const light = (d) => {
    const dist = Math.hypot(d, 300);
    const lz = 300 / dist;
    const att = 1 / (1 + (dist * dist) / (falloff * falloff));
    return AMBIENT.map((a, c) => a * 1.05 + LAMP[c] * (1 + lz) * 0.5 * 0.92 * att);
  };
  const L0 = light(0);
  const deskAmb = AMBIENT.map((c) => c * 1.05);
  const deskLamp = LAMP.map((c) => c * 0.92);
  const woodPx = lit(r.wood, tiles.madeira.size, 1.1, 0.55, deskAmb, deskLamp);
  // Check against the canvas beside the pile, where the desk tint and dim apply.
  const dDesk = Math.hypot(deskAt[0] - lx, deskAt[1] - ly);
  const woodMean = mean(lit(r.wood, 64, 1.1, 0.55, deskAmb, deskLamp));
  const predicted = light(dDesk).map((v, c) => v * woodMean[c]);
  const correction = deskLit.map((v, c) => v / predicted[c]);
  images.madeira = encode(
    woodPx,
    tiles.madeira.size,
    L0.map((v, c) => v * correction[c]),
    tiles.madeira.quality,
  );
  const stops = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]
    .map((k) => {
      const rgb = light(k * falloff).map((v, c) => Math.round((v / L0[c]) * 255));
      const at = k === 0 ? "0" : `calc(var(--luz) * ${k})`;
      return `    rgb(${rgb.join(" ")}) ${at}`;
    })
    .join(",\n");

  return {
    images,
    stops,
    measured: { sheetLit, deskLit, predicted, correction, falloff, gain },
  };
}
