# letra

Laura's handwriting as a font (`app/fonts/laura-mao.woff2`), made from photos
of her own notes in her copies of *Mensagem* and the *Cancioneiro*. Every
letter in the font is one she wrote; nothing is drawn by hand afterwards.

- `fotos/` the crops of her notes: "D. Sebastião" (S), the note beside
  "Ulisses" (U), the note at its title (T), and her circles and underline in
  "Ó sino da minha aldeia" (used as the model for the marks in
  `components/desk/caneta.ts`)
- `cc.py` separates the ink from the paper and numbers each piece of ink
- `build.py` takes the pieces listed in `SRC` (crop, piece numbers, optional
  x range to cut joined letters apart), traces them, sets them on her
  baseline and x-height, and builds the font. A letter with several sources
  gets alternates that take turns (`calt`), so repeated letters differ.

Letters she has not written yet are composed from ones she has (h, k, w, y,
the accents) or missing (digits, capitals other than F, which fall back to
lowercase). To add some: crop a new photo into `fotos/`, add it to `names` in
`cc.py` and to `CROPS` and `LINES` in `build.py`, run `cc.py`, look at
`gerado/<crop>_cc.png` for the numbers, add them to `SRC`, run `build.py`.

```bash
python3 -m venv /tmp/letra && /tmp/letra/bin/pip install numpy opencv-python-headless scikit-image fonttools brotli potracer
```

```bash
/tmp/letra/bin/python scripts/letra/cc.py && /tmp/letra/bin/python scripts/letra/build.py
```
