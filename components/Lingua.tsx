"use client";

import { createContext, use, type ReactNode } from "react";
import { DEFAULT_LANG, type Lang } from "@/lib/lang";
import { getStrings, type Strings } from "@/lib/strings";

/**
 * The page's interface language, for client components. The root layout
 * provides it from the URL; the dictionaries themselves are not sent as
 * props because their entries include functions.
 */
const LangContext = createContext<Lang>(DEFAULT_LANG);

export function LinguaProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext value={lang}>{children}</LangContext>;
}

export function useLang(): Lang {
  return use(LangContext);
}

export function useStrings(): Strings {
  return getStrings(use(LangContext));
}
