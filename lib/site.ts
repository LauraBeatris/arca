import { DEFAULT_LANG, LANGS, type Lang } from "@/lib/lang";

/**
 * The site's own address, for canonical links, hreflang, the sitemap and
 * structured data. On Vercel it is the primary production domain, the one
 * the others redirect to (www.arcadepessoa.com, set in the Vercel dashboard);
 * running locally it is the dev server.
 */
const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const siteUrl = new URL(host ? `https://${host}` : "http://localhost:3000");

export const absoluteUrl = (path: string) => new URL(path, siteUrl).toString();

/**
 * The same page in every language, for `alternates.languages` and the
 * sitemap. `x-default` is the plain URL, which serves Portuguese and sends a
 * browser that asks for English to `/en` (see `proxy.ts`).
 */
export function languageAlternates(pathFor: (lang: Lang) => string) {
  return {
    ...Object.fromEntries(LANGS.map((lang) => [lang, pathFor(lang)])),
    "x-default": pathFor(DEFAULT_LANG),
  } as Record<Lang | "x-default", string>;
}

/** Who the poems are by, for structured data. */
export const pessoaJsonLd = {
  "@type": "Person",
  name: "Fernando Pessoa",
  sameAs: "https://pt.wikipedia.org/wiki/Fernando_Pessoa",
} as const;
