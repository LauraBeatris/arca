import type { MetadataRoute } from "next";
import { LANGS, homePath, poemPath, type Lang } from "@/lib/lang";
import { getPoems } from "@/lib/poems";
import { absoluteUrl, languageAlternates } from "@/lib/site";

/** Every page in every language, each listing its translations. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: ((lang: Lang) => string)[] = [
    homePath,
    ...getPoems().map((poem) => (lang: Lang) => poemPath(lang, poem.slug)),
  ];
  return pages.flatMap((pathFor) => {
    const languages = Object.fromEntries(
      Object.entries(languageAlternates(pathFor)).map(([key, path]) => [
        key,
        absoluteUrl(path),
      ]),
    );
    return LANGS.map((lang) => ({
      url: absoluteUrl(pathFor(lang)),
      alternates: { languages },
    }));
  });
}
