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
  /** Flat colour used before WebGL is ready and when it is unavailable. */
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
    fallback: "#e9dfc6",
  },
  // Cancioneiro: thin typewriter paper, uneven ribbon ink.
  maquina: {
    procedural: 1,
    relief: 0.75,
    deckle: 0.3,
    bevel: 0.18,
    age: 0.9,
    creaseChance: 0.8,
    fallback: "#e3ddcd",
  },
};

export const BOOK_PAPER: Record<Book, PaperId> = {
  mensagem: "carta",
  cancioneiro: "maquina",
};

export const BOOKS: Book[] = ["mensagem", "cancioneiro"];
export const PAPER_IDS = Object.keys(PAPERS) as PaperId[];
