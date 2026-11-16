"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useLang, useStrings } from "@/components/Lingua";
import { homePath } from "@/lib/lang";

/**
 * Shown over the desk when someone opens the URL of a poem that is not in the
 * pile. The pile itself stays usable underneath; the note leaves as soon as a
 * real sheet is picked up.
 */
export function MissingSheet() {
  const t = useStrings();
  const lang = useLang();
  const pathname = usePathname();
  const [missing] = useState(pathname);
  if (pathname !== missing) return null;
  return (
    <p className="aviso-mesa" role="status">
      {t.notFoundTitle} <Link href={homePath(lang)}>{t.notFoundBack}</Link>
    </p>
  );
}
