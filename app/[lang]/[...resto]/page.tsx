import { notFound } from "next/navigation";
import { Suspense } from "react";

/**
 * Any other URL. It exists so an unknown address shows the not-found page
 * inside the root layout, in the visitor's language. Like the poem page, it
 * reads its params inside Suspense before saying "not found".
 */
async function Unknown({ params }: Pick<PageProps<"/[lang]/[...resto]">, "params">) {
  await params;
  notFound();
  return null;
}

export default function UnknownPage({ params }: PageProps<"/[lang]/[...resto]">) {
  return (
    <Suspense fallback={null}>
      <Unknown params={params} />
    </Suspense>
  );
}
