import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getPoem, getPoems } from "@/lib/poems";
import { strings } from "@/lib/strings";

/** One URL per poem: the desk shows that poem picked up. */
export function generateStaticParams() {
  return getPoems().map((poem) => ({ slug: poem.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/poema/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const poem = getPoem(slug);
  if (!poem) return {};
  return {
    title: strings.pageTitle(poem.title),
    description: `${poem.title}, ${strings.author} (${strings.bookName[poem.book]}).`,
    alternates: { canonical: `/poema/${poem.slug}` },
  };
}

async function KnownPoem({ params }: Pick<PageProps<"/poema/[slug]">, "params">) {
  const { slug } = await params;
  if (!getPoem(slug)) notFound();
  return null;
}

export default function PoemPage({ params }: PageProps<"/poema/[slug]">) {
  return (
    <Suspense fallback={null}>
      <KnownPoem params={params} />
    </Suspense>
  );
}
