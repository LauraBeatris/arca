/**
 * Paper stocks.
 *
 * A paper is chosen by book, with an optional per-poem `paper:` override in
 * the poem's frontmatter.
 *
 * Each stock is a *material*: an albedo map (colour) and a relief map (slope +
 * height). Today both maps are generated procedurally in the shader
 * (`procedural`). When real paper is scanned, set `scan` to the two image URLs
 * and the renderer uses them instead; the lamp, shadows and per-sheet
 * variation code does not change.
 */

export type Book = "mensagem" | "cancioneiro";
export type PaperId = "carta" | "maquina";

export type PaperMaterial = {
  /** Which procedural generator bakes the maps (see gl/shaders.ts). */
  procedural: 0 | 1;
  /** Optional scanned maps. `relief` stores slope in RG, height in B. */
  scan?: { albedo: string; relief: string };
  /** How strongly the grain reacts to raking light. */
  relief: number;
  /** Roughness of the cut edge, in px. */
  deckle: number;
  /** How much the edge rounds over (thick card catches light on its edge). */
  bevel: number;
  /** Yellowing towards the edges. */
  age: number;
  /** Chance (0..1) that a sheet carries a fold line from being kept folded. */
  creaseChance: number;
  /** Average colour of the baked fallback paper (public/papel/), where the lamp reaches least. */
  fallback: string;
};

export const PAPERS: Record<PaperId, PaperMaterial> = {
  // Mensagem: cream cotton card, letterpress (ink pressed into the page).
  carta: {
    procedural: 0,
    relief: 1.0,
    deckle: 0.9,
    bevel: 0.55,
    age: 0.45,
    creaseChance: 0,
    fallback: "rgb(183 163 131)",
  },
  // Cancioneiro: thin typewriter paper, uneven ribbon ink.
  maquina: {
    procedural: 1,
    relief: 0.75,
    deckle: 0.3,
    bevel: 0.18,
    age: 0.9,
    creaseChance: 0.8,
    fallback: "rgb(177 163 140)",
  },
};

export const BOOK_PAPER: Record<Book, PaperId> = {
  mensagem: "carta",
  cancioneiro: "maquina",
};

/**
 * Each book's light in the room, set by the sheet on top of the pile (or the
 * one picked up). Both are multipliers on the shared lighting (1 = as is),
 * kept close to 1: the change should be felt rather than noticed.
 *
 * The lamp tints are balanced so the paper under the text never gets darker
 * (measured on every poem, on the pile and picked up): the ink keeps its
 * contrast. Only the desk around the pile is allowed to dim.
 */
export type Ambience = {
  /** Lamp colour, RGB multiplier. */
  lamp: [number, number, number];
  /** Desk colour and exposure, RGB multiplier. */
  desk: [number, number, number];
};

export const BOOK_AMBIENCE: Record<Book, Ambience> = {
  // Mensagem: the heraldic, epic book. A warmer, more golden lamp.
  mensagem: { lamp: [1.04, 1.0, 0.9], desk: [1.03, 1.0, 0.93] },
  // Cancioneiro: lyrical and intimate. A slightly cooler lamp, a dimmer desk.
  cancioneiro: { lamp: [0.98, 1.02, 1.06], desk: [0.92, 0.93, 0.96] },
};

export const BOOKS: Book[] = ["mensagem", "cancioneiro"];
export const PAPER_IDS = Object.keys(PAPERS) as PaperId[];
