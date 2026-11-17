import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { JsonLd } from "@/components/JsonLd";
import {
  DEFAULT_LANG,
  isLang,
  parsePlace,
  poemPath,
  positionPath,
  type Position,
} from "@/lib/lang";
import { linkPreview } from "@/lib/og";
import { getPoem, getPoems } from "@/lib/poems";
import { absoluteUrl, languageAlternates, pessoaJsonLd } from "@/lib/site";
import { getStrings } from "@/lib/strings";

type Props = PageProps<"/[lang]/poema/[slug]/[[...lugar]]">;

/**
 * One URL per reading position: the desk shows that poem picked up, on that
 * sheet, front or back (see `positionPath` in `lib/lang.ts` for the scheme).
 */
export function generateStaticParams() {
  return getPoems().flatMap((poem) =>
    Array.from({ length: poem.sheetCount }, (_, sheet) => {
      const number = sheet > 0 ? [String(sheet + 1)] : [];
      return [
        { slug: poem.slug, lugar: number },
        { slug: poem.slug, lugar: [...number, "verso"] },
      ];
    }).flat(),
  );
}

/** The poem and the position a URL names, or null for one it does not have. */
async function resolve(params: Props["params"]) {
  const { lang: param, slug, lugar } = await params;
  const lang = isLang(param) ? param : DEFAULT_LANG;
  const poem = getPoem(slug);
  const place = parsePlace(lugar ?? []);
  if (!poem || !place || place.sheet >= poem.sheetCount) return null;
  const position: Position = { slug: poem.slug, ...place };
  return { lang, poem, position };
}

/** The first two lines of a sheet, for search snippets. */
const opening = (lines: string[]) => lines.slice(0, 2).join(" / ");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await resolve(params);
  if (!found) return {};
  const { lang, poem, position } = found;
  const t = getStrings(lang);
  const { sheet, back } = position;
  const name = back
    ? t.backTitle(poem.title)
    : sheet > 0
      ? t.sheetTitle(poem.title, sheet + 1)
      : poem.title;
  const title = t.pageTitle(name);
  const description = back
    ? t.backDescription(poem.title)
    : t.poemDescription(opening(poem.sheetLines[sheet]), poem.title, t.bookName[poem.book]);
  return {
    title,
    description,
    // Every position is the same page (all sheets, front and back, are in
    // it), so search engines get one result per poem. A shared link still
    // previews, and opens, the exact position.
    alternates: {
      canonical: poemPath(lang, poem.slug),
      languages: languageAlternates((l) => poemPath(l, poem.slug)),
    },
    ...linkPreview({
      lang,
      url: positionPath(lang, position),
      title,
      description,
      poem: { slug: poem.slug, title: poem.title },
    }),
  };
}

async function KnownPoem({ params }: Pick<Props, "params">) {
  const found = await resolve(params);
  if (!found) notFound();
  const { lang, poem } = found;
  const t = getStrings(lang);
  return (
    <JsonLd
      data={{
        "@type": "CreativeWork",
        name: poem.title,
        genre: t.genre,
        // The poems are always Pessoa's Portuguese, whatever the interface.
        inLanguage: "pt",
        author: pessoaJsonLd,
        isPartOf: { "@type": "CreativeWork", name: t.bookName[poem.book] },
        text: poem.lines.join("\n"),
        url: absoluteUrl(poemPath(lang, poem.slug)),
        ...(poem.source ? { isBasedOn: poem.source } : {}),
      }}
    />
  );
}

export default function PoemPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <KnownPoem params={params} />
    </Suspense>
  );
}
