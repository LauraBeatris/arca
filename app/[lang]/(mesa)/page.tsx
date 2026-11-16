import { JsonLd } from "@/components/JsonLd";
import { DEFAULT_LANG, homePath, isLang } from "@/lib/lang";
import { absoluteUrl, pessoaJsonLd } from "@/lib/site";
import { getStrings } from "@/lib/strings";

/**
 * The pile. Everything visible is drawn by the desk in the layout; this page
 * only tells search engines what the site is.
 */
export default async function PilePage({ params }: PageProps<"/[lang]">) {
  const { lang: param } = await params;
  const lang = isLang(param) ? param : DEFAULT_LANG;
  const t = getStrings(lang);
  return (
    <JsonLd
      data={{
        "@type": "WebSite",
        name: t.siteTitle,
        description: t.description,
        url: absoluteUrl(homePath(lang)),
        inLanguage: lang,
        about: pessoaJsonLd,
      }}
    />
  );
}
