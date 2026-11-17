/**
 * The two languages of the interface, and how a URL says which one is in use.
 *
 * Portuguese keeps the plain URLs (`/`, `/poema/<slug>`); English lives under
 * `/en`. `proxy.ts` sends every plain URL to the `pt` routes (or, for someone
 * who chose or whose browser asks for English, redirects it to `/en`).
 *
 * Only the interface changes: the poems are always Pessoa's Portuguese.
 */

export const LANGS = ["pt", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "pt";

/** Remembers a visitor's choice, so the server can answer in it. */
export const LANG_COOKIE = "arca-lingua";

export const isLang = (value: unknown): value is Lang =>
  typeof value === "string" && (LANGS as readonly string[]).includes(value);

const prefix = (lang: Lang) => (lang === DEFAULT_LANG ? "" : `/${lang}`);

export const homePath = (lang: Lang) => prefix(lang) || "/";
export const poemPath = (lang: Lang, slug: string) =>
  `${prefix(lang)}/poema/${slug}`;

/**
 * Where a reader is in a poem: which sheet is in front (0 for the first) and
 * whether the sheet is turned over to Laura's notes.
 */
export type Position = { slug: string; sheet: number; back: boolean };

/** The path segment for a sheet turned over. */
const BACK = "verso";

/**
 * Every reading position has its own URL. Sheets are numbered from 1, and
 * the first sheet's front is the poem's own URL:
 *
 *   /poema/<slug>            first sheet
 *   /poema/<slug>/2          second sheet
 *   /poema/<slug>/verso      first sheet, turned over
 *   /poema/<slug>/2/verso    second sheet, turned over
 */
export const positionPath = (lang: Lang, { slug, sheet, back }: Position) =>
  `${poemPath(lang, slug)}${sheet > 0 ? `/${sheet + 1}` : ""}${back ? `/${BACK}` : ""}`;

/**
 * The segments after the slug ([] or ["2"] or ["verso"] or ["2", "verso"])
 * as a sheet and side, or null when they name no position. Only the shape is
 * checked here; whether the poem has that many sheets is the caller's to say.
 * "/1" is not a position: the first sheet is the poem's own URL.
 */
export function parsePlace(segments: readonly string[]): Omit<Position, "slug"> | null {
  const parts = [...segments];
  const back = parts.at(-1) === BACK;
  if (back) parts.pop();
  if (parts.length === 0) return { sheet: 0, back };
  if (parts.length > 1 || !/^(?:[2-9]|[1-9]\d+)$/.test(parts[0])) return null;
  return { sheet: Number(parts[0]) - 1, back };
}

/** "/en/poema/isto/2/verso" → { slug: "isto", sheet: 1, back: true }; "/" → null. */
export function positionFromPath(pathname: string): Position | null {
  const match = /^(?:\/en)?\/poema\/([^/]+)((?:\/[^/]+)*)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    const place = parsePlace(match[2].split("/").filter(Boolean).map(decodeURIComponent));
    return place && { slug: decodeURIComponent(match[1]), ...place };
  } catch {
    return null; // A malformed escape names no poem.
  }
}

/** "/en/poema/isto" → "isto"; "/" → null. */
export const slugFromPath = (pathname: string): string | null =>
  positionFromPath(pathname)?.slug ?? null;

/** The same place in the other language. */
export function switchPath(pathname: string, to: Lang): string {
  const position = positionFromPath(pathname);
  return position ? positionPath(to, position) : homePath(to);
}

/**
 * Lines of verse in a URL fragment: `#v3` or `#v3-5`. Lines are numbered
 * from 1 across the whole poem, not per sheet, the way verse is cited; stanza
 * breaks and sheet breaks are not lines.
 */
export type Verses = { from: number; to: number };

export const versesHash = ({ from, to }: Verses) =>
  from === to ? `#v${from}` : `#v${from}-${to}`;

/** "#v3-5" → { from: 3, to: 5 }; anything else → null. */
export function versesFromHash(hash: string): Verses | null {
  const match = /^#v([1-9]\d*)(?:-([1-9]\d*))?$/.exec(hash);
  if (!match) return null;
  const a = Number(match[1]);
  const b = match[2] ? Number(match[2]) : a;
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

/**
 * English only when the browser ranks English above Portuguese; anyone else
 * (and any request that does not say) gets the site's own language.
 */
export function langFromAcceptLanguage(header: string | null): Lang {
  if (!header) return DEFAULT_LANG;
  const ranked = header
    .split(",")
    .map((part, order) => {
      const [tag, ...params] = part.trim().toLowerCase().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      return { base: tag.split("-")[0], q: q ? Number(q.slice(2)) || 0 : 1, order };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q || a.order - b.order);
  const first = ranked.find((entry) => isLang(entry.base));
  return first ? (first.base as Lang) : DEFAULT_LANG;
}

/** Called when a visitor picks a language with the switch. */
export function rememberLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}
