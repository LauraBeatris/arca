import { homePath, poemPath } from "@/lib/lang";
import { getPoems, type Poem } from "@/lib/poems";
import { absoluteUrl } from "@/lib/site";
import { getStrings } from "@/lib/strings";

/**
 * `/llms.txt` and `/llms-full.txt`: the site described for AI agents, in the
 * llms.txt format (https://llmstxt.org): an H1, a blockquote summary, then H2
 * sections of markdown links. Both are built from `content/poems` when the
 * site is built, like the sitemap.
 *
 * They are written for machines, not shown in the interface, so they are in
 * English with a Portuguese line, and they reuse the site's description from
 * `lib/strings.ts`. Laura's notes on each poem (words, reflection) are left
 * out: the entries link to the poem pages, where they live.
 */

const en = getStrings("en");
const pt = getStrings("pt");

const bookLine = (poem: Poem) =>
  [en.bookName[poem.book], poem.numeral].filter(Boolean).join(", ");

function intro() {
  return [
    `# ${en.siteTitle}`,
    "",
    `> ${en.tagline} ${en.description}`,
    "",
    `Em português: ${pt.tagline} ${pt.description}`,
    "",
    `Arca is a personal site by ${en.builtByName} (the "I" above). Every poem on it is by Fernando Pessoa (1888–1935) and is in the public domain. Each poem lies on a lamp-lit desk as a loose sheet: the front holds the poem as real HTML text, and the back holds the day it was marked and ${en.builtByName}'s notes on it.`,
    "",
    "## How the site works",
    "",
    `- [Portuguese (default)](${absoluteUrl(homePath("pt"))}): plain URLs, \`/\` and \`/poema/<slug>\`.`,
    `- [English interface](${absoluteUrl(homePath("en"))}): the same pages under \`/en\`, \`/en/poema/<slug>\`. Only the buttons and labels change.`,
    "- The poems are always shown in Pessoa's original Portuguese, in both versions. On the English interface a reader can select lines to see a machine translation of them.",
    "- The texts come from [Arquivo Pessoa](http://arquivopessoa.net/); each poem below links the text it was taken from.",
    `- When quoting, credit the poem to Fernando Pessoa and its book, and link the poem page. ${en.builtByName}'s notes are not Pessoa's words: link to the page rather than quoting them as part of the poem.`,
  ];
}

function poemEntry(poem: Poem) {
  const parts = [
    `${bookLine(poem)}.`,
    `Marked on ${poem.markedAt}.`,
    // A link, not a bare URL: a bare one ends at the full stop, and crawlers
    // reading the text took the stop as part of it ("…/en/poema/isto.").
    `[English interface](${absoluteUrl(poemPath("en", poem.slug))}).`,
  ];
  if (poem.source) parts.push(`Source text: ${poem.source}`);
  return `- [${poem.title}](${absoluteUrl(poemPath("pt", poem.slug))}): ${parts.join(" ")}`;
}

/** The index: what the site is, how it works, and every poem with its links. */
export function llmsTxt() {
  return [
    ...intro(),
    "",
    "## Poems",
    "",
    "Most recently marked first. Each link is the poem's page in Portuguese.",
    "",
    ...getPoems().map(poemEntry),
    "",
    "## Optional",
    "",
    `- [Full texts](${absoluteUrl("/llms-full.txt")}): this file followed by the text of every poem, in Portuguese.`,
    `- [Sitemap](${absoluteUrl("/sitemap.xml")}): every page in both languages.`,
    "",
  ].join("\n");
}

/** The index followed by every poem's text, as plain verse. */
export function llmsFullTxt() {
  const poems = getPoems().map((poem) =>
    [
      `### ${poem.title}`,
      "",
      `Fernando Pessoa, ${bookLine(poem)}. ${absoluteUrl(poemPath("pt", poem.slug))}${poem.source ? ` (source: ${poem.source})` : ""}`,
      "",
      poem.text,
    ].join("\n"),
  );
  return [
    ...intro(),
    "",
    "## Poems",
    "",
    "Most recently marked first. Stanzas are separated by a blank line.",
    "",
    poems.join("\n\n"),
    "",
  ].join("\n");
}
