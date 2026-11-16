import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { JsonLd } from "@/components/JsonLd";
import { DEFAULT_LANG, isLang, poemPath } from "@/lib/lang";
import { linkPreview } from "@/lib/og";
import { getPoem, getPoems, type Poem } from "@/lib/poems";
import { absoluteUrl, languageAlternates, pessoaJsonLd } from "@/lib/site";
import { getStrings } from "@/lib/strings";

/** One URL per poem: the desk shows that poem picked up. */
export function generateStaticParams() {
  return getPoems().map((poem) => ({ slug: poem.slug }));
}

/** The first two lines, for search snippets. */
const opening = (poem: Poem) => poem.lines.slice(0, 2).join(" / ");

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/poema/[slug]">): Promise<Metadata> {
  const { lang: param, slug } = await params;
  const poem = getPoem(slug);
  if (!poem) return {};
  const lang = isLang(param) ? param : DEFAULT_LANG;
  const t = getStrings(lang);
  const title = t.pageTitle(poem.title);
  const description = t.poemDescription(opening(poem), poem.title, t.bookName[poem.book]);
  return {
    title,
    description,
    alternates: {
      canonical: poemPath(lang, poem.slug),
      languages: languageAlternates((l) => poemPath(l, poem.slug)),
    },
    ...linkPreview({
      lang,
      url: poemPath(lang, poem.slug),
      title,
      description,
      poem: { slug: poem.slug, title: poem.title },
    }),
  };
}

async function KnownPoem({ params }: Pick<PageProps<"/[lang]/poema/[slug]">, "params">) {
  const { lang: param, slug } = await params;
  const poem = getPoem(slug);
  if (!poem) notFound();
  const lang = isLang(param) ? param : DEFAULT_LANG;
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

export default function PoemPage({ params }: PageProps<"/[lang]/poema/[slug]">) {
  return (
    <Suspense fallback={null}>
      <KnownPoem params={params} />
    </Suspense>
  );
}
