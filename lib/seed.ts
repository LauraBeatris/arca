/**
 * Deterministic per-sheet randomness, shared by the server (CSS fallback
 * layout) and the client engine so a sheet never jumps when the engine takes
 * over.
 */

/** FNV-1a string hash mapped to [0, 1). */
export function hash01(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export type Jitter = {
  /** Resting rotation on the pile, in degrees. */
  rot: number;
  /** Resting offset on the pile, in px. */
  dx: number;
  dy: number;
};

/** How a sheet happens to lie on the pile. */
export function jitterFor(slug: string): Jitter {
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    rot: round((hash01(slug + ":rot") - 0.5) * 6.4),
    dx: round((hash01(slug + ":dx") - 0.5) * 22),
    dy: round((hash01(slug + ":dy") - 0.5) * 14),
  };
}

/** Sheets held by a clip fan out a little around it. */
export const FAN = {
  /** Degrees of extra rotation per sheet below the first. */
  rot: 0.85,
  /** Px of slip per sheet below the first. */
  dx: 2.4,
  dy: 1.8,
};
