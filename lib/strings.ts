import type { Lang } from "@/lib/lang";

/**
 * Every piece of interface copy lives here, one dictionary per language.
 * Server code picks one with `getStrings(lang)`; client components read the
 * page's with `useStrings()` from `components/Lingua.tsx`.
 *
 * Poem text is content, not interface copy, and stays in `content/poems`, in
 * Portuguese, whatever the interface language.
 */

const pt = {
  lang: "pt",
  locale: "pt-PT",
  siteTitle: "Arca",
  tagline: "Poemas de Fernando Pessoa, marcados ao ler.",
  description:
    "Uma pilha de folhas soltas: os poemas de Fernando Pessoa que fui marcando no Cancioneiro e na Mensagem.",
  author: "Fernando Pessoa",

  pileLabel: "Pilha de poemas, do marcado mais recentemente ao mais antigo",
  controlsLabel: "Comandos da mesa",
  poemCount: (current: number, total: number) =>
    `Poema ${current} de ${total}`,
  poemPosition: (title: string, current: number, total: number) =>
    `${title}. Poema ${current} de ${total}.`,

  previousPoem: "Poema anterior",
  nextPoem: "Próximo poema",
  pickUp: "Ler de perto",
  putDown: "Devolver à pilha",
  putDownDone: "Folha devolvida à pilha.",
  seeBack: "Ver o verso",
  seeFront: "Ver a frente",
  previousPage: "Página anterior",
  nextPage: "Próxima página",
  pagePosition: (current: number, total: number) =>
    `Página ${current} de ${total}`,
  pageShort: (current: number, total: number) => `${current} / ${total}`,

  markedOn: "Marcado em",
  backPrefix: "Verso da folha:",
  wordsHeading: "Palavras que aprendi",
  reflectionHeading: "Reflexão",
  bookName: {
    mensagem: "Mensagem",
    cancioneiro: "Cancioneiro",
  },

  tiltOn: "Inclinar a luz",
  tiltOff: "Parar a luz",
  sound: "Som",
  soundOff: "Silenciar",
  soundOn: "Ativar som",
  candleOff: "Apagar a vela",
  candleOn: "Acender a vela",
  tiltDenied: "Sem acesso ao movimento do aparelho.",

  // The menu that opens over selected verses (or from the "more" button).
  moreActions: "Mais ações",
  selectionMenu: "Ações para os versos escolhidos",
  wholeSheetMenu: "Ações para esta folha",
  translate: "Traduzir para inglês",
  translating: "A traduzir…",
  translationHeading: "Em inglês",
  translationNote: "Tradução automática, não revista.",
  translationUnavailable: "A tradução não está disponível agora.",
  translationFailed: "Não foi possível traduzir. Tente outra vez.",
  translationBusy: "Muitos pedidos de uma vez. Tente daqui a pouco.",
  tryAgain: "Tentar outra vez",
  listen: "Ouvir",
  stopListening: "Parar de ouvir",
  dictionary: (word: string) => `Procurar “${word}” no dicionário`,
  dictionaryShort: "Dicionário",
  dictionaryUrl: (word: string) =>
    `https://dicionario.priberam.org/${encodeURIComponent(word.toLocaleLowerCase("pt"))}`,
  share: "Partilhar",
  shareCopied: "Copiado",
  shareCopiedLong: "Versos e ligação copiados.",
  shareFailed: "Não foi possível copiar",
  shareQuote: (lines: string, title: string) =>
    `“${lines}”\n— Fernando Pessoa, ${title}`,
  // One key per action, taken from its name, so they change with the language.
  shortcuts: {
    more: "m",
    translate: "t",
    listen: "o",
    dictionary: "d",
    share: "p",
  },

  notFoundTitle: "Esta folha não está na arca.",
  notFoundBack: "Voltar à pilha",

  // Titles and snippets for tabs and search results.
  homeTitle: "Arca · Poemas de Fernando Pessoa",
  pageTitle: (title: string) => `${title} · Fernando Pessoa · Arca`,
  poemDescription: (opening: string, title: string, book: string) =>
    `“${opening}” ${title}, de Fernando Pessoa (${book}).`,
  // Link previews (the image and video shown when a link is shared).
  previewAlt:
    "Folhas soltas com poemas de Fernando Pessoa numa mesa de madeira, à luz de um candeeiro e de uma vela.",
  poemPreviewAlt: (title: string) =>
    `${title}, de Fernando Pessoa, numa folha levantada da pilha à luz de um candeeiro.`,
  genre: "Poesia",

  // The signature in the corner: a link to Laura's site. The name is read
  // out to screen readers; on screen the signature says it.
  builtBy: "built by",
  builtByName: "Laura Beatris",
  opensInNewTab: "(abre num novo separador)",

  // The switch to the other language, written in that language: it is for
  // the people who read it.
  otherLang: {
    lang: "en",
    short: "EN",
    name: "English",
    hint: "Read the site in English",
  },
  /** A line under the tagline for readers who may not read Portuguese. */
  readingHint: "",
};

/** The same shape with every piece of copy widened to a plain string. */
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : { [K in keyof T]: Widen<T[K]> };

export type Strings = Widen<typeof pt>;

const en: Strings = {
  lang: "en",
  locale: "en-US",
  siteTitle: "Arca",
  tagline: "Poems by Fernando Pessoa, marked while reading.",
  description:
    "A pile of loose sheets: the poems by Fernando Pessoa I’ve been marking in the Cancioneiro and in Mensagem.",
  author: "Fernando Pessoa",

  pileLabel: "Pile of poems, from the most recently marked to the oldest",
  controlsLabel: "Desk controls",
  poemCount: (current, total) => `Poem ${current} of ${total}`,
  poemPosition: (title, current, total) =>
    `${title}. Poem ${current} of ${total}.`,

  previousPoem: "Previous poem",
  nextPoem: "Next poem",
  pickUp: "Read up close",
  putDown: "Back to the pile",
  putDownDone: "Sheet returned to the pile.",
  seeBack: "See the back",
  seeFront: "See the front",
  previousPage: "Previous page",
  nextPage: "Next page",
  pagePosition: (current, total) => `Page ${current} of ${total}`,
  pageShort: (current, total) => `${current} / ${total}`,

  markedOn: "Marked on",
  backPrefix: "Back of the sheet:",
  wordsHeading: "Words I learned",
  reflectionHeading: "Reflection",
  // Book titles stay as Pessoa named them.
  bookName: {
    mensagem: "Mensagem",
    cancioneiro: "Cancioneiro",
  },

  tiltOn: "Tilt the light",
  tiltOff: "Stop the light",
  sound: "Sound",
  soundOff: "Mute",
  soundOn: "Turn sound on",
  candleOff: "Put out the candle",
  candleOn: "Light the candle",
  tiltDenied: "No access to the device’s motion.",

  moreActions: "More actions",
  selectionMenu: "Actions for the chosen lines",
  wholeSheetMenu: "Actions for this sheet",
  translate: "Translate",
  translating: "Translating…",
  translationHeading: "In English",
  translationNote: "Machine translation, not reviewed.",
  translationUnavailable: "Translation isn’t available right now.",
  translationFailed: "Couldn’t translate. Try again.",
  translationBusy: "Too many requests at once. Try again in a moment.",
  tryAgain: "Try again",
  listen: "Listen",
  stopListening: "Stop listening",
  dictionary: (word) => `Look up “${word}” in Wiktionary`,
  dictionaryShort: "Dictionary",
  // A Portuguese word explained in English.
  dictionaryUrl: (word) =>
    `https://en.wiktionary.org/wiki/${encodeURIComponent(word.toLocaleLowerCase("pt"))}#Portuguese`,
  share: "Share",
  shareCopied: "Copied",
  shareCopiedLong: "Lines and link copied.",
  shareFailed: "Couldn’t copy",
  shareQuote: (lines, title) => `“${lines}”\n— Fernando Pessoa, ${title}`,
  shortcuts: {
    more: "m",
    translate: "t",
    listen: "l",
    dictionary: "d",
    share: "s",
  },

  notFoundTitle: "This sheet isn’t in the Arca.",
  notFoundBack: "Back to the pile",

  homeTitle: "Arca · Poems by Fernando Pessoa",
  pageTitle: (title) => `${title} · Fernando Pessoa · Arca`,
  poemDescription: (opening, title, book) =>
    `“${opening}” ${title}, by Fernando Pessoa (${book}).`,
  previewAlt:
    "Loose sheets of Fernando Pessoa’s poems on a wooden desk, lit by a lamp and a candle.",
  poemPreviewAlt: (title) =>
    `${title} by Fernando Pessoa, on a sheet lifted from the pile under a lamp.`,
  genre: "Poetry",

  builtBy: "built by",
  builtByName: "Laura Beatris",
  opensInNewTab: "(opens in a new tab)",

  otherLang: {
    lang: "pt",
    short: "PT",
    name: "Português",
    hint: "Ler o site em português",
  },
  readingHint: "Select any lines to read them in English.",
};

const dictionaries: Record<Lang, Strings> = { pt, en };

export function getStrings(lang: Lang): Strings {
  return dictionaries[lang];
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** "2026-11-09" → "9 de novembro de 2026" (pt) or "November 9, 2026" (en) */
export function formatDate(iso: string, t: Strings): string {
  let format = dateFormats.get(t.locale);
  if (!format) {
    format = new Intl.DateTimeFormat(t.locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    dateFormats.set(t.locale, format);
  }
  return format.format(new Date(`${iso}T00:00:00Z`));
}
