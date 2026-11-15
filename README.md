<div align="center">

# arca

fernando pessoa's poems, on loose paper, under a lamp

[arca-khaki-one.vercel.app](https://arca-khaki-one.vercel.app)

<br>

<!-- placeholder: replace this line with a video or a screenshot -->

`[ video coming soon ]`

<br>

</div>

when fernando pessoa died, a trunk was found with about 25,000 loose pages inside. in portuguese, a trunk is an *arca*.

this is a small one of my own: the poems i marked while reading *mensagem* and the *cancioneiro*.

<br>

## what you can do

- slide the top sheet away to see the next one
- pick a sheet up and read it under the lamp
- turn it over to see the date, the words i learned, and a short note
- move the light with your mouse, your finger, or by tilting your phone

every action also has a button and a key (arrows to move, `esc` to put a sheet down), so it works without dragging and with a screen reader.

<br>

## the paper

| book | paper |
| --- | --- |
| *mensagem* | cream card, ink pressed into the page |
| *cancioneiro* | thin typewriter paper, uneven ink |

the words are always real text. the paper is drawn under them with webgl.

<br>

## run it

```bash
pnpm install
```

```bash
pnpm dev
```

<br>

## add a poem

make a file in `content/poems/`. its name becomes the link: `isto.mdx` → `/poema/isto`.

```mdx
---
title: Isto
book: cancioneiro        # mensagem | cancioneiro
markedAt: "2026-09-28"   # newest goes on top of the pile
words:
  - word: enleio
    meaning: …
reflection: …
---

one stanza per paragraph,
one line of verse per line.

---

three dashes start a new sheet.
long poems are held by a paper clip.
```

<br>

## made with

next.js · react · typescript · webgl · mdx

poem texts from [arquivo pessoa](http://arquivopessoa.net).
