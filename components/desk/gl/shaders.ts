/**
 * Shaders.
 *
 * Two kinds of program:
 *
 * 1. Bake programs run once at start-up and write a material into two
 *    textures: albedo (colour) and relief (slope in RG, height in B). This is
 *    the procedural stand-in for scanned paper; a scan replaces these two
 *    textures and nothing else.
 *
 * 2. Draw programs run every frame and only do texture lookups plus lighting,
 *    so the frame stays cheap on a phone.
 *
 * Space: "world" is CSS pixels on the desk, x right, y down, z towards the
 * viewer. The lamp is a point light in that space.
 */

const NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
// Value noise that repeats every "per" cells, so baked textures tile.
float vnoise(vec2 p, vec2 per, float seed) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 i0 = mod(i, per);
  vec2 i1 = mod(i + 1.0, per);
  float a = hash12(i0 + seed);
  float b = hash12(vec2(i1.x, i0.y) + seed);
  float c = hash12(vec2(i0.x, i1.y) + seed);
  float d = hash12(i1 + seed);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p, vec2 per, float seed) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p, per, seed + float(i) * 19.7);
    p *= 2.0;
    per *= 2.0;
    a *= 0.5;
  }
  return s / 0.9375;
}
// Short stray fibres: one random segment per cell.
float fibres(vec2 uv, float freq, float seed) {
  vec2 p = uv * freq;
  vec2 cell = floor(p);
  float acc = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = cell + vec2(float(x), float(y));
      vec2 id = mod(c, freq) + seed;
      vec2 r = hash22(id);
      float ang = hash12(id + 7.3) * 3.14159;
      float len = 0.25 + 0.75 * hash12(id + 3.1);
      vec2 a = c + r;
      vec2 dir = vec2(cos(ang), sin(ang));
      vec2 pa = p - a;
      float t = clamp(dot(pa, dir), -len, len);
      float d = length(pa - dir * t);
      float w = 0.035 + 0.03 * hash12(id + 11.9);
      acc = max(acc, (1.0 - smoothstep(0.0, w, d)) * (0.4 + 0.6 * hash12(id + 5.5)));
    }
  }
  return acc;
}
`;

const SD_BOX = /* glsl */ `
float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
`;

/* ------------------------------------------------------------------ bake */

export const BAKE_VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/**
 * Paper generators.
 *   uKind 0: cream cotton card (felt-marked, toothy, visible fibres)
 *   uKind 1: thin typewriter bond (smooth, faint laid lines, light cockle)
 */
export const BAKE_PAPER_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uKind;
uniform float uTexel;
layout(location = 0) out vec4 oAlbedo;
layout(location = 1) out vec4 oRelief;
${NOISE}

float heightCarta(vec2 uv) {
  float h = 0.0;
  h += 0.60 * fbm(uv * 12.0, vec2(12.0), 1.0);          // felt marks
  h += 0.40 * fbm(uv * 80.0, vec2(80.0), 7.0);          // tooth
  h += 0.11 * vnoise(uv * 360.0, vec2(360.0), 13.0);    // fine grain
  h += 0.07 * fibres(uv, 22.0, 21.0);
  h += 0.045 * fibres(uv, 48.0, 37.0);
  return h;
}
float heightMaquina(vec2 uv) {
  float h = 0.0;
  h += 0.42 * fbm(uv * 5.0, vec2(5.0), 3.0);            // cockle of thin paper
  h += 0.16 * fbm(uv * 140.0, vec2(140.0), 9.0);        // fine tooth
  h += 0.045 * sin(uv.y * 6.28318 * 190.0);             // laid lines
  h += 0.03 * smoothstep(0.92, 1.0, sin(uv.x * 6.28318 * 7.0)); // chain lines
  h += 0.05 * fibres(uv, 40.0, 43.0);
  return h;
}
float heightAt(vec2 uv) {
  return uKind < 0.5 ? heightCarta(uv) : heightMaquina(uv);
}

vec3 albedoCarta(vec2 uv) {
  vec3 base = vec3(0.925, 0.885, 0.790);
  base *= 0.965 + 0.07 * fbm(uv * 5.0, vec2(5.0), 51.0);
  base = mix(base, base * vec3(1.0, 0.965, 0.90), 0.5 * fbm(uv * 3.0, vec2(3.0), 57.0));
  base *= 1.0 + 0.03 * fibres(uv, 22.0, 21.0);
  base *= 1.0 - 0.035 * fibres(uv, 48.0, 37.0);
  // Tiny dark inclusions in the pulp.
  vec2 g = uv * 520.0;
  float fleck = step(0.9982, hash12(mod(floor(g), 520.0) + 61.0));
  fleck *= 1.0 - smoothstep(0.1, 0.5, length(fract(g) - 0.5));
  base *= 1.0 - 0.3 * fleck;
  base *= 0.975 + 0.05 * vnoise(uv * 360.0, vec2(360.0), 13.0);
  return base;
}
vec3 albedoMaquina(vec2 uv) {
  vec3 base = vec3(0.900, 0.882, 0.828);
  base *= 0.97 + 0.06 * fbm(uv * 4.0, vec2(4.0), 71.0);
  // Foxing: sparse soft brown blooms.
  float fox = smoothstep(0.70, 0.86, fbm(uv * 9.0, vec2(9.0), 77.0));
  base = mix(base, base * vec3(0.93, 0.86, 0.72), 0.55 * fox);
  base *= 1.0 - 0.018 * (0.5 + 0.5 * sin(uv.y * 6.28318 * 190.0));
  base *= 1.0 + 0.03 * fibres(uv, 40.0, 43.0);
  base *= 0.98 + 0.04 * vnoise(uv * 300.0, vec2(300.0), 83.0);
  return base;
}

void main() {
  float e = uTexel;
  float h = heightAt(vUv);
  float hx = heightAt(vUv + vec2(e, 0.0)) - heightAt(vUv - vec2(e, 0.0));
  float hy = heightAt(vUv + vec2(0.0, e)) - heightAt(vUv - vec2(0.0, e));
  // Normalise the slope to the texel size so 1024 and 2048 bakes match.
  vec2 slope = vec2(hx, hy) * (1.0 / (e * 2048.0)) * 2.6;
  vec3 alb = uKind < 0.5 ? albedoCarta(vUv) : albedoMaquina(vUv);
  oAlbedo = vec4(alb, 1.0);
  oRelief = vec4(clamp(slope * 0.5 + 0.5, 0.0, 1.0), clamp(h, 0.0, 1.0), 1.0);
}
`;

/**
 * An oak top made of planks running left to right, each sawn from a different
 * log: its own shade, its own grain, thin seams between boards and one butt
 * joint per board (which also hides where the tile repeats). The grain lives
 * mostly in the colour; the relief is kept shallow so the lamp shows the
 * seams and pores rather than ridges.
 */
export const BAKE_WOOD_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTexel;
layout(location = 0) out vec4 oAlbedo;
layout(location = 1) out vec4 oRelief;
${NOISE}

const float BOARDS = 5.0;     // boards per tile
const float RINGS = 22.0;     // growth rings across one board
const float TILE_PX = 1500.0; // see WOOD_TILE_PX in renderer.ts

// x: latewood (0..1), y: pores (0..1), z: fibre streaks (0..1),
// w: seam (1 on the joint between boards or at a board's butt end).
vec4 planks(vec2 uv) {
  float row = floor(uv.y * BOARDS);
  float by = fract(uv.y * BOARDS);
  float id = mod(row, BOARDS);
  float r1 = hash12(vec2(id, 3.0));
  float r2 = hash12(vec2(id, 9.0));
  // Lines stay nearly parallel and drift slowly along the board.
  float wander = 1.1 * vnoise(vec2(uv.x * 2.0, id * 5.0), vec2(2.0, 1000.0), 5.0)
               + 0.3 * vnoise(vec2(uv.x * 6.0, id * 5.0), vec2(6.0, 1000.0), 8.0);
  float t = by * RINGS * (0.8 + 0.4 * r1) + wander + r2 * 10.0;
  // Rings of uneven width (the tree grew faster some years).
  t += 0.9 * vnoise(vec2(t * 0.45, id * 3.0), vec2(1000.0), 41.0);
  float f = fract(t);
  float ring = floor(t);
  // Earlywood rises slowly into a thin dark latewood line, then breaks.
  float late = smoothstep(0.72, 0.95, f) * (1.0 - smoothstep(0.95, 1.0, f));
  late *= 0.3 + 0.7 * hash12(vec2(ring, id + 2.0));
  late *= 0.7 + 0.3 * vnoise(vec2(uv.x * 30.0, ring), vec2(30.0, 1000.0), 29.0);
  // Fine long fibres, the "silk" that follows the grain.
  float fib = fbm(vec2(uv.x * 3.0, uv.y * 300.0 + wander * 8.0), vec2(3.0, 300.0), 61.0 + id);
  // Pores: tiny needles, mostly in the earlywood.
  float p = vnoise(vec2(uv.x * 260.0, uv.y * 640.0), vec2(260.0, 640.0), 17.0 + id);
  p = smoothstep(0.9, 0.995, p) * 0.7 * (1.0 - 0.6 * late);
  // Seams, about 1.6 px wide.
  float px = 1.0 / TILE_PX;
  float seamY = 1.0 - smoothstep(0.0, 1.6 * px * BOARDS, min(by, 1.0 - by));
  float jx = fract(uv.x - hash12(vec2(id, 21.0)));
  float seamX = 1.0 - smoothstep(0.0, 1.6 * px, min(jx, 1.0 - jx));
  return vec4(late, p, fib, max(seamY, seamX));
}

// Each board its own shade, with soft streaks of colour running along it.
float boardTone(vec2 uv) {
  float id = mod(floor(uv.y * BOARDS), BOARDS);
  float streak = fbm(vec2(uv.x * 1.5, uv.y * BOARDS * 5.0), vec2(1.5, BOARDS * 5.0), 47.0);
  return clamp(0.6 * hash12(vec2(id, 13.0)) + 0.8 * (streak - 0.5) + 0.2, 0.0, 1.0);
}

vec3 albedoAt(vec2 uv) {
  vec4 w = planks(uv);
  float tone = boardTone(uv);
  vec3 early = mix(vec3(0.440, 0.320, 0.210), vec3(0.540, 0.400, 0.262), tone);
  vec3 lateC = vec3(0.330, 0.230, 0.145);
  vec3 alb = mix(early, lateC, 0.8 * w.x);
  alb *= 0.88 + 0.22 * w.z;
  alb *= 0.94 + 0.12 * fbm(uv * vec2(1.5, 4.0), vec2(1.5, 4.0), 31.0);
  alb *= 1.0 - 0.4 * w.y;
  alb *= 1.0 - 0.55 * w.w;
  return alb;
}
float heightAt(vec2 uv) {
  vec4 w = planks(uv);
  return 0.55 + 0.025 * w.x + 0.035 * w.z - 0.03 * w.y - 0.5 * w.w;
}

void main() {
  float e = uTexel;
  float hx = heightAt(vUv + vec2(e, 0.0)) - heightAt(vUv - vec2(e, 0.0));
  float hy = heightAt(vUv + vec2(0.0, e)) - heightAt(vUv - vec2(0.0, e));
  vec2 slope = vec2(hx, hy) * (1.0 / (e * 2048.0)) * 2.0;
  oAlbedo = vec4(albedoAt(vUv), 1.0);
  oRelief = vec4(clamp(slope * 0.5 + 0.5, 0.0, 1.0), clamp(heightAt(vUv), 0.0, 1.0), 1.0);
}
`;

/* ------------------------------------------------------------------ draw */

const LIGHT = /* glsl */ `
uniform vec3 uLight;      // lamp position, world px
uniform float uLampOn;    // 0..1, the lamp warming up
uniform float uFalloff;   // px at which the lamp has halved
uniform vec3 uCandle;     // candle flame position, world px
uniform float uCandleOn;  // 0..1, flickers
uniform vec3 uLampTint;   // the book on top's lamp colour (lib/papers.ts)
const vec3 AMBIENT = vec3(0.33, 0.35, 0.40);
const vec3 LAMP = vec3(1.0, 0.925, 0.80);
const vec3 CANDLE = vec3(1.0, 0.58, 0.24);
// The candle is small, low and close: its light is warm, falls off fast and
// rakes hard across whatever is next to it.
vec3 candleLight(vec3 pos, vec3 n, vec3 nf, float gain) {
  vec3 cv = uCandle - pos;
  float cd = length(cv);
  vec3 cl = cv / cd;
  float att = 1.0 / (1.0 + (cd * cd) / (175.0 * 175.0));
  float flatL = max(dot(nf, cl), 0.0);
  float det = dot(n, cl) - dot(nf, cl);
  return CANDLE * max(mix(0.75, flatL, 0.5) + det * gain, 0.0) * att * uCandleOn;
}
`;

export const DESK_VERT = BAKE_VERT;

export const DESK_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uViewport;   // css px
uniform float uDpr;
uniform sampler2D uAlbedo;
uniform sampler2D uRelief;
uniform float uTilePx;
uniform float uDim;
uniform vec3 uDeskTint;   // the book on top's desk tone (lib/papers.ts)
${LIGHT}
out vec4 o;
${NOISE}
void main() {
  vec2 px = vec2(gl_FragCoord.x, uViewport.y * uDpr - gl_FragCoord.y) / uDpr;
  vec2 uv = px / uTilePx;
  vec3 alb = texture(uAlbedo, uv).rgb;
  vec2 slope = (texture(uRelief, uv).xy * 2.0 - 1.0) * 0.55;
  vec3 n = normalize(vec3(-slope, 1.0));
  vec3 lv = uLight - vec3(px, 0.0);
  float dist = length(lv);
  vec3 l = lv / dist;
  float att = 1.0 / (1.0 + (dist * dist) / (uFalloff * uFalloff));
  float flatL = l.z;
  float det = dot(n, l) - flatL;
  float diffuse = max(mix(1.0, flatL, 0.5) + det * 1.1, 0.0);
  // A faint sheen from the varnish.
  vec3 hv = normalize(l + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, hv), 0.0), 18.0) * 0.045;
  vec3 light = AMBIENT * 1.05 + LAMP * uLampTint * (diffuse * 0.92 + spec * 6.0) * att * uLampOn;
  light += candleLight(vec3(px, 0.0), n, vec3(0.0, 0.0, 1.0), 1.1) * 0.95;
  vec3 col = alb * light * uDim * uDeskTint;
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}
`;

/** Shared by sheets and their shadows. */
export const QUAD_VERT = /* glsl */ `#version 300 es
in vec2 aPos;
uniform vec2 uHalf;       // half size of the sheet, local px
uniform float uMargin;    // extra border for soft edges
uniform mat4 uScreen;     // local → css px, perspective included
uniform mat4 uWorld;      // local → world px
uniform vec2 uViewport;
out vec2 vLocal;
out vec3 vWorld;
void main() {
  vec2 lp = aPos * (uHalf + uMargin);
  vLocal = lp;
  vWorld = (uWorld * vec4(lp, 0.0, 1.0)).xyz;
  vec4 s = uScreen * vec4(lp, 0.0, 1.0);
  gl_Position = vec4(s.x * 2.0 / uViewport.x - s.w, s.w - s.y * 2.0 / uViewport.y, 0.0, s.w);
}
`;

export const SHEET_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vLocal;
in vec3 vWorld;
uniform vec2 uHalf;
uniform sampler2D uAlbedo;
uniform sampler2D uRelief;
uniform vec4 uUv;         // xy: offset, z: 1 / tile px, w: +1 or -1 (sheet turned end for end)
uniform vec3 uTint;
uniform mat3 uNrm;        // rotation part of uWorld
uniform float uDim;
uniform float uAlpha;
uniform float uBack;      // 1 when we are looking at the back of the sheet
uniform float uReliefK;
uniform float uDeckle;
uniform float uBevel;
uniform float uAge;
uniform float uSeed;
uniform float uCandleK;   // how much candle light reaches this sheet
uniform vec4 uCrease;     // x: y of a horizontal fold, y: its depth, z: x of a vertical fold, w: its depth
${LIGHT}
out vec4 o;
${NOISE}
${SD_BOX}
void main() {
  float d = sdBox(vLocal, uHalf, 1.5);
  d += (vnoise(vLocal * 0.2 + uSeed * 91.0, vec2(8192.0), 3.0) - 0.5) * 2.0 * uDeckle;
  float cover = clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0);
  if (cover <= 0.0) discard;

  vec2 uv = vLocal * uUv.w * uUv.z + uUv.xy;
  vec3 alb = texture(uAlbedo, uv).rgb * uTint;
  vec2 slope = (texture(uRelief, uv).xy * 2.0 - 1.0) * uUv.w * uReliefK;

  // Fold lines: one side of the crease catches the lamp, the other falls away.
  float cy = (vLocal.y - uCrease.x) / 2.2;
  slope.y += uCrease.y * cy * exp(-cy * cy);
  float cx = (vLocal.x - uCrease.z) / 2.2;
  slope.x += uCrease.w * cx * exp(-cx * cx);
  alb *= 1.0 - 0.05 * abs(uCrease.y) * exp(-cy * cy * 3.0) - 0.05 * abs(uCrease.w) * exp(-cx * cx * 3.0);

  // The cut edge rounds over, so thick card shows a lit and a shaded edge.
  vec2 q = abs(vLocal) - uHalf;
  vec2 outward = sign(vLocal) * (q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  slope -= outward * smoothstep(-3.0, 0.0, d) * uBevel;

  float side = 1.0 - 2.0 * uBack;
  vec3 n = normalize(vec3(-slope, 1.0));
  n.z *= side;
  vec3 N = normalize(uNrm * n);
  vec3 Nf = normalize(uNrm * vec3(0.0, 0.0, side));

  vec3 lv = uLight - vWorld;
  float dist = length(lv);
  vec3 l = lv / dist;
  float att = 1.0 / (1.0 + (dist * dist) / (uFalloff * uFalloff));
  float flatL = max(dot(Nf, l), 0.0);
  float det = dot(N, l) - dot(Nf, l);
  float diffuse = max(mix(1.0, flatL, 0.5) + det * 1.7, 0.0);
  vec3 light = AMBIENT + LAMP * uLampTint * diffuse * att * uLampOn * 0.86;
  light += candleLight(vWorld, N, Nf, 1.7) * uCandleK;

  // Age: paper yellows from the edges inwards.
  float tone = smoothstep(-80.0, 0.0, d);
  alb *= mix(vec3(1.0), vec3(0.95, 0.91, 0.82), tone * tone * uAge);
  alb *= 1.0 - 0.12 * smoothstep(-1.5, 0.5, d);

  vec3 col = alb * light * uDim;
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  float a = cover * uAlpha;
  o = vec4(col * a, a);
}
`;

export const SHADOW_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vLocal;
in vec3 vWorld;
uniform vec2 uHalf;
uniform float uBlur;
uniform float uStrength;
out vec4 o;
${SD_BOX}
void main() {
  float d = sdBox(vLocal, uHalf, 2.0);
  float a = uStrength * (1.0 - smoothstep(-uBlur, uBlur, d));
  o = vec4(0.0, 0.0, 0.0, a);
}
`;
