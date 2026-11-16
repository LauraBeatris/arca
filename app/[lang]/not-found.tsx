"use client";

import Link from "next/link";
import { useLang, useStrings } from "@/components/Lingua";
import { homePath } from "@/lib/lang";

export default function NotFound() {
  const t = useStrings();
  return (
    <main className="aviso">
      <h1>{t.notFoundTitle}</h1>
      <p>
        <Link href={homePath(useLang())}>{t.notFoundBack}</Link>
      </p>
    </main>
  );
}
