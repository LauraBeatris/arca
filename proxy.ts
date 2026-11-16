import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_LANG,
  LANG_COOKIE,
  isLang,
  langFromAcceptLanguage,
} from "@/lib/lang";

/**
 * Picks the interface language for every page request.
 *
 * - `/en/...` is English, whatever the visitor chose before (a shared English
 *   link stays English).
 * - `/pt/...` is never a public URL: it redirects to the plain one.
 * - A plain URL is Portuguese, unless the visitor chose English with the
 *   switch (a cookie) or, having never chosen, their browser asks for English.
 *   Then it redirects to the same place under `/en`.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    return NextResponse.next();
  }

  if (pathname === "/pt" || pathname.startsWith("/pt/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }

  const chosen = request.cookies.get(LANG_COOKIE)?.value;
  const lang = isLang(chosen)
    ? chosen
    : langFromAcceptLanguage(request.headers.get("accept-language"));

  const url = request.nextUrl.clone();
  url.pathname = `/${lang}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  if (lang !== DEFAULT_LANG) {
    const response = NextResponse.redirect(url, 307);
    response.headers.set("Vary", "Accept-Language, Cookie");
    return response;
  }
  return NextResponse.rewrite(url);
}

export const config = {
  // Pages only: not the translation API, Next's own files, or files with an
  // extension (the icon).
  matcher: ["/((?!api/|_next/|.*\\.).*)"],
};
