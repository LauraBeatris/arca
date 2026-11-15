/**
 * Every piece of interface copy lives here, so an English dictionary can be
 * added next to `pt` later and switched with a toggle.
 *
 * Poem text is content, not interface copy, and stays in `content/poems`.
 */

const pt = {
  lang: "pt",
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
  share: "Partilhar",
  shareCopied: "Versos e ligação copiados.",
  shareFailed: "Não foi possível partilhar.",
  shareQuote: (lines: string, title: string) =>
    `“${lines}”\n— Fernando Pessoa, ${title}`,

  notFoundTitle: "Esta folha não está na arca.",
  notFoundBack: "Voltar à pilha",

  pageTitle: (title: string) => `${title} · Arca`,
} as const;

export type Strings = typeof pt;

/** The active dictionary. An English toggle will pick between dictionaries here. */
export const strings: Strings = pt;

const dateFormat = new Intl.DateTimeFormat("pt-PT", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-11-09" → "9 de novembro de 2026" */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(`${iso}T00:00:00Z`));
}
