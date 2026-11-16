import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DEFAULT_LANG, LANGS, isLang, poemPath } from "@/lib/lang";
import { getPoem, getPoems } from "@/lib/poems";
import { getStrings } from "@/lib/strings";

/** One URL per poem: the desk shows that poem picked up. */
export function generateStaticParams() {
  return getPoems().map((poem) => ({ slug: poem.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/poema/[slug]">): Promise<Metadata> {
  const { lang: param, slug } = await params;
  const poem = getPoem(slug);
  if (!poem) return {};
  const lang = isLang(param) ? param : DEFAULT_LANG;
  const t = getStrings(lang);
  return {
    title: t.pageTitle(poem.title),
    description: `${poem.title}, ${t.author} (${t.bookName[poem.book]}).`,
    alternates: {
      canonical: poemPath(lang, poem.slug),
      languages: Object.fromEntries(LANGS.map((l) => [l, poemPath(l, poem.slug)])),
    },
  };
}

async function KnownPoem({ params }: Pick<PageProps<"/[lang]/poema/[slug]">, "params">) {
  const { slug } = await params;
  if (!getPoem(slug)) notFound();
  return null;
}

export default function PoemPage({ params }: PageProps<"/[lang]/poema/[slug]">) {
  return (
    <Suspense fallback={null}>
      <KnownPoem params={params} />
    </Suspense>
  );
}
