import Link from "next/link";
import { strings } from "@/lib/strings";

export default function NotFound() {
  return (
    <main className="aviso">
      <h1>{strings.notFoundTitle}</h1>
      <p>
        <Link href="/">{strings.notFoundBack}</Link>
      </p>
    </main>
  );
}
