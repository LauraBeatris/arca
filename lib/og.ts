import type { Metadata } from "next";
import { LANGS, type Lang } from "@/lib/lang";
import { absoluteUrl } from "@/lib/site";
import { getStrings } from "@/lib/strings";
import recorded from "./og.json";

/**
 * What a shared link shows: a short video of the desk (`og:video`), with a
 * still from it as the image for apps that do not play video.
 *
 * Both are recorded from the real site by `scripts/og-video.mjs` into
 * `public/og/<lang>/<name>.{mp4,jpg}`, and `og.json` lists the pages that
 * have them. A poem added since the last recording borrows the home preview
 * until the script is run again.
 */

const WIDTH = 1200;
const HEIGHT = 630;

/** "pt-PT" → "pt_PT", the form Open Graph expects. */
const ogLocale = (lang: Lang) => getStrings(lang).locale.replace("-", "_");

type Preview = {
  lang: Lang;
  /** The page's own URL (relative to `metadataBase`). */
  url: string;
  title: string;
  description: string;
  /** The poem a page is about; the home page has none. */
  poem?: { slug: string; title: string };
};

export function linkPreview({
  lang,
  url,
  title,
  description,
  poem,
}: Preview): Pick<Metadata, "openGraph" | "twitter"> {
  const t = getStrings(lang);
  const name = poem && recorded.includes(poem.slug) ? poem.slug : "home";
  const alt = name === "home" || !poem ? t.previewAlt : t.poemPreviewAlt(poem.title);
  const image = { url: `/og/${lang}/${name}.jpg`, width: WIDTH, height: HEIGHT, alt, type: "image/jpeg" };
  // Next resolves image URLs against `metadataBase` but leaves video URLs as
  // given, and crawlers need them absolute.
  const videoUrl = absoluteUrl(`/og/${lang}/${name}.mp4`);
  const video = {
    url: videoUrl,
    secureUrl: videoUrl,
    width: WIDTH,
    height: HEIGHT,
    type: "video/mp4",
  };
  return {
    openGraph: {
      type: poem ? "article" : "website",
      siteName: t.siteTitle,
      locale: ogLocale(lang),
      alternateLocale: LANGS.filter((l) => l !== lang).map(ogLocale),
      url,
      title,
      description,
      images: [image],
      videos: [video],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
