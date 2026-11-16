import { Suspense } from "react";
import { Desk } from "@/components/desk/Desk";
import { getPoems } from "@/lib/poems";

/**
 * The desk is shared by the pile (`/`) and by every poem's own URL
 * (`/poema/<slug>`), so picking a sheet up or putting it down never reloads
 * it. The pages below only say which URL exists.
 */
export default function MesaLayout({ children }: LayoutProps<"/[lang]">) {
  const poems = getPoems().map((poem) => ({
    slug: poem.slug,
    title: poem.title,
    numeral: poem.numeral,
    book: poem.book,
    paper: poem.paper,
    markedAt: poem.markedAt,
    words: poem.words,
    reflection: poem.reflection,
    sheets: poem.sheets,
  }));
  return (
    <>
      {/* The desk reads the URL to know which sheet is picked up. */}
      <Suspense fallback={null}>
        <Desk poems={poems} />
      </Suspense>
      {children}
    </>
  );
}
