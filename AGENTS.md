<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Arca

Poems are MDX files in `content/poems/` (see `README.md` and the comment at the
top of `lib/poems.tsx` for the frontmatter). Optional fields the README leaves
out: `numeral` (the poem's number in its book), `paper` (`carta` | `maquina`,
overrides the book's paper), `source` (URL the text came from). Inside a poem,
`<Mark note="…">word</Mark>` marks a word; in v1 it renders as plain text.

Where things live:

| Path | What |
| --- | --- |
| `content/poems/` | The poems (MDX + frontmatter) |
| `lib/poems.tsx` | Reads and validates poems |
| `lib/papers.ts` | Paper stocks (materials: albedo + relief, with a `scan` slot) |
| `lib/strings.ts` | All interface copy, one dictionary per language (`pt`, `en`) |
| `lib/lang.ts`, `proxy.ts` | Which language a URL is in, and picking it per request |
| `components/desk/Desk.tsx` | Structure, state, buttons, keys, focus |
| `components/desk/engine.ts` | Springs, gestures, lamp, layout |
| `components/desk/gl/` | Shaders and renderer |
| `components/desk/sound.ts` | Sound effects: synthesised recipes, with a `src` slot for recordings |
| `lib/prefs.ts` | What a visitor chose (sound on, candle lit), kept on their device |
| `components/mdx.tsx` | Components available inside poems |
| `lib/og.ts` | Link previews: `og:video` + `og:image` per page and language |
| `scripts/og-video.mjs` | Records those previews from the real desk (`pnpm og`, against `pnpm start --port 3211`); rerun after adding a poem or changing the desk's look |

One WebGL canvas draws the desk, every sheet and the shadows. The engine writes
the same matrix to each HTML sheet and to its paper quad. The picked-up poem
lives in the URL (`/poema/<slug>`) through `history.pushState`.

The interface comes in Portuguese (plain URLs) and English (under `/en`). All
routes live in `app/[lang]/`; `proxy.ts` rewrites plain URLs to `/pt/...` and
sends visitors who chose English (cookie) or whose browser prefers it to
`/en/...`. Only the interface changes: the poems and Laura's notes stay in
Portuguese (marked `lang="pt"`), and English readers translate lines with the
selection menu.

Two lights: a lamp that follows the pointer, and a candle beside the pile. The
candle is an HTML button placed by CSS (`.vela`); the engine reads its position
and feeds it to the shaders as a second, flickering light. Because it never
stops moving it must stay a button that can put it out.

Rules that hold for every change:

- Poem text is real HTML text. Never draw text into a canvas or an image. The
  WebGL canvas is only the paper *under* the text.
- Every gesture also needs a visible, labelled button with a large touch target
  and a keyboard path. Manage focus when a sheet is picked up, flipped or put
  down. Honour `prefers-reduced-motion` (fades, still lamp).
- All interface copy goes in `lib/strings.ts`, in both dictionaries. No UI
  strings in components; read them with `useStrings()` (client) or
  `getStrings(lang)` (server).
- Take poem text from a reliable source (Arquivo Pessoa) and check it. Never
  write a poem from memory, and never invent Laura's words or reflections:
  use clearly marked placeholder text.
- Paper stocks are materials (`lib/papers.ts`) so scanned albedo/relief maps can
  replace the procedural ones without touching the lamp or layout code.
