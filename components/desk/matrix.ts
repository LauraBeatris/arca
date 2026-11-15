/**
 * 4×4 matrices, column-major: the same layout CSS `matrix3d()` and WebGL use,
 * so one matrix positions both the HTML text and the paper drawn under it.
 * Conventions follow CSS transforms (x right, y down, z towards the viewer).
 */

export type Mat4 = number[];

export const translate = (x: number, y: number, z = 0): Mat4 => [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1,
];

export const scale = (s: number): Mat4 => [
  s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
];

export const rotZ = (a: number): Mat4 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
};

export const rotY = (a: number): Mat4 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
};

export const rotX = (a: number): Mat4 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
};

/** CSS `perspective(d)`. */
export const perspective = (d: number): Mat4 => [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1 / d, 0, 0, 0, 1,
];

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

/** a · b · c · … (the rightmost matrix applies to the point first). */
export function chain(...matrices: Mat4[]): Mat4 {
  return matrices.reduce(multiply);
}

/** Where the point (x, y, 0) lands on screen. */
export function project(m: Mat4, x: number, y: number): [number, number] {
  const w = m[3] * x + m[7] * y + m[15];
  return [(m[0] * x + m[4] * y + m[12]) / w, (m[1] * x + m[5] * y + m[13]) / w];
}

export function toCss(m: Mat4): string {
  let out = "matrix3d(";
  for (let i = 0; i < 16; i++) {
    out += (i ? "," : "") + (Math.round(m[i] * 1e8) / 1e8).toString();
  }
  return out + ")";
}
