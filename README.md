# Arca

A pile of loose sheets on a dark wood desk: the poems of Fernando Pessoa that
Laura marked while reading the *Cancioneiro* and *Mensagem*. The name comes
from the trunk (*arca*) of about 25,000 loose pages found when Pessoa died.

Each poem is a sheet of paper you can slide aside, pick up under the lamp, turn
over, and put back. Long poems are several sheets held by a paper clip.

## Run it

```bash
pnpm install
```

```bash
pnpm dev
```

## Add a poem

Create `content/poems/<slug>.mdx`. The file name becomes the URL
(`/poema/<slug>`).

```mdx
---
title: Mar Português
numeral: X                # optional: the poem's number in its book
book: mensagem            # mensagem | cancioneiro
paper: carta              # optional override: carta | maquina
markedAt: "2026-11-09"    # the day you marked it; newest goes on top
source: http://arquivopessoa.net/textos/2405
words:
  - word: bojador
    meaning: …
reflection: …
---

One stanza per paragraph,
one line of verse per line.

---

A line holding only three dashes starts a new sheet.
Poems with several sheets are held by a clip.
```

Inside the text, `<Mark note="…">word</Mark>` marks a word with a margin note.
In v1 it renders as plain text; the format is settled so later versions can
draw it as ink.

Paper is chosen by book (`mensagem` → cream letterpress card, `cancioneiro` →
thin typewriter paper) unless the poem sets `paper`.

## How it is built

- **Text is always real HTML.** Every poem is an `<article>` with a heading and
  one `<span>` per line of verse, in reading order. Nothing is drawn into a
  canvas, so selection, screen readers and (later) select-to-translate work.
- **Paper is a WebGL layer under the text** (`components/desk/gl`). One canvas
  draws the desk, every sheet and their shadows, lit by a lamp that follows the
  pointer. The engine (`components/desk/engine.ts`) writes the same matrix to
  each HTML sheet and to its paper quad.
- **Paper stocks are materials** (`lib/papers.ts`): an albedo map and a relief
  map. Today both are generated in the shader. To use scanned paper, set
  `scan: { albedo, relief }` on a stock; lamp, shadows and per-sheet variation
  stay as they are.
- **Every gesture has a button and a key.** Swipe aside, pick up, turn page,
  flip and put down all have labelled buttons; arrow keys move through the pile
  and through pages; Escape puts a sheet down. With reduced motion, slides
  become fades and the lamp stays still.
- **Interface copy lives in `lib/strings.ts`** (Portuguese), ready for an
  English dictionary beside it.

| Path | What |
| --- | --- |
| `content/poems/` | The poems (MDX + frontmatter) |
| `lib/poems.tsx` | Reads and validates poems |
| `lib/papers.ts` | Paper stocks |
| `lib/strings.ts` | All interface copy |
| `components/desk/Desk.tsx` | Structure, state, buttons, keys, focus |
| `components/desk/engine.ts` | Springs, gestures, lamp, layout |
| `components/desk/gl/` | Shaders and renderer |
| `components/mdx.tsx` | Components available inside poems |

Poem texts follow the [Arquivo Pessoa](http://arquivopessoa.net) edition.
