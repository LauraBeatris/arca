import type { Metadata, Viewport } from "next";
import { Libre_Caslon_Text, Special_Elite } from "next/font/google";
import { LinguaProvider } from "@/components/Lingua";
import { DEFAULT_LANG, LANGS, homePath, isLang } from "@/lib/lang";
import { getStrings } from "@/lib/strings";
import "../globals.css";

// Mensagem: a book face, for letterpress on cream card.
const serif = Libre_Caslon_Text({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

// Cancioneiro: a worn typewriter face, for thin typing paper.
const typewriter = Special_Elite({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-typewriter",
  display: "swap",
});

/** Both languages are built ahead of time; `proxy.ts` picks between them. */
export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang: param } = await params;
  const lang = isLang(param) ? param : DEFAULT_LANG;
  const t = getStrings(lang);
  return {
    title: t.siteTitle,
    description: t.description,
    alternates: {
      canonical: homePath(lang),
      languages: Object.fromEntries(LANGS.map((l) => [l, homePath(l)])),
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#3a2414",
  // The desk is always dark: system controls and scrollbars match it.
  colorScheme: "dark",
  viewportFit: "cover",
};

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang: param } = await params;
  const lang = isLang(param) ? param : DEFAULT_LANG;
  return (
    <html lang={lang} className={`${serif.variable} ${typewriter.variable}`}>
      <body>
        <LinguaProvider lang={lang}>{children}</LinguaProvider>
      </body>
    </html>
  );
}
