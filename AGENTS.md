<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Arca

Read `README.md` first: it explains the content model and how the desk is built.

Rules that hold for every change:

- Poem text is real HTML text. Never draw text into a canvas or an image. The
  WebGL canvas is only the paper *under* the text.
- Every gesture also needs a visible, labelled button with a large touch target
  and a keyboard path. Manage focus when a sheet is picked up, flipped or put
  down. Honour `prefers-reduced-motion` (fades, still lamp).
- All interface copy goes in `lib/strings.ts`. No UI strings in components.
- Take poem text from a reliable source (Arquivo Pessoa) and check it. Never
  write a poem from memory, and never invent Laura's words or reflections:
  use clearly marked placeholder text.
- Paper stocks are materials (`lib/papers.ts`) so scanned albedo/relief maps can
  replace the procedural ones without touching the lamp or layout code.
