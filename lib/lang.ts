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

/** "/en/poema/isto" → "isto"; "/" → null. */
export function slugFromPath(pathname: string): string | null {
  const match = /^(?:\/en)?\/poema\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

/** The same place in the other language. */
export function switchPath(pathname: string, to: Lang): string {
  const slug = slugFromPath(pathname);
  return slug ? poemPath(to, slug) : homePath(to);
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
