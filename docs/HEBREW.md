# Hebrew conventions

Kidboard ships in English and Hebrew. Hebrew is not a translation layer bolted
on top — it is a first-class locale with its own triggers, its own game names
and full RTL — so the strings have to agree with each other across 25
catalogs. These are the conventions they agree on.

Where a machine can check one, `src/i18n/hebrew.test.ts` does. **If you
disagree with a convention, change it here and in that test — not in
individual strings**, or they scatter again.

## Where the Hebrew lives

- `src/i18n/he.json` — the shell: prompt, welcome, hint bar, help headings,
  the sound and language messages, the keyboard-smash responses.
- `src/cartridges/*/he.json` — one catalog per cartridge.
- `src/cartridges/*/cartridge.ts` — triggers, and the `HE_KEYS` maps in
  `animals`, `vehicles` and `colors` that pair a Hebrew word with an English
  content key so typing `חתול` shows the cat.
- `src/runtime/nudge.ts`, `src/cartridges/count/numberWords.ts`,
  `src/cartridges/spot/numberWords.ts`, `src/theme/themes.ts`,
  `src/carts/strings.ts` — the Hebrew that lives in TypeScript.

A cartridge's **first** Hebrew trigger is also its name in the Hebrew games
menu and in Hebrew `help`, so it is read as prose as well as typed.

## 1. The child is addressed in the second person plural

`כתבו` · `מצאתם` · `שלכם` · `לכם` · `בואו`

Hebrew has no gender-neutral singular, so addressing a child in the singular
guesses their gender. The plural is the inclusive form Israeli children's
material uses.

Imperatives take the plain plural imperative (`כתבו`, `נסו`, `המשיכו`,
`הסתכלו`), not the colloquial future (`תכתבו`, `תמשיכו`). The plain form is
what printed children's instructions use, and it is shorter — which matters in
a one-line hint bar.

## 2. A cartridge is a קלטת, never a מחסנית

`מחסנית` in modern Hebrew is a printer cartridge or an ammunition magazine.
`קלטת` — a cassette — is the right picture for a child, and matches what the
carts panel draws.

## 3. Hint-bar labels mirror the English part of speech

Where the English label is a **verb**, the Hebrew is the infinitive
(שם הפועל): `לצייר`, `להזיז`, `ללכת`, `לנווט`, `לנגן`. It carries no gender
and no number. Verbal nouns (`הזזה`, `הליכה`) and plural imperatives (`נגנו`)
do not belong here.

Where the English is a **noun phrase** ("new brush", "two spots"), the Hebrew
stays a noun phrase (`מברשת חדשה`, `שני מקומות`).

## 4. The definite article follows the English

`catch` says "a star" / `כוכב`; `count` says "the ducks" / `הברווזים`. The
Hebrew ה sits exactly where English has "the". Across files this looks
inconsistent and is not — each catalog mirrors its own English twin.

## 5. "and" is added by the joiner, never by a string

Five cartridges (`catch`, `count`, `memory`, `simon`, `spot`) build lists with
a local `joinNamed`, which writes `` `${head.join(', ')} ו${last}` ``.
Hebrew's ו is a glued prefix, not a word. The overflow marker is therefore the
bare `עוד`, with no conjunction of its own — adding one produces the doubled
`וועוד`, which there is now a test against.

## 6. Nothing Hebrew reaches a canvas

Hebrew glyph widths are not monospace cells, and Hebrew runs right-to-left
inside a left-to-right grid. Hebrew belongs in prose only — spoken lines,
souvenirs, hint labels. Canvases and art blocks are Latin, digits, box-drawing
and emoji.

## 7. Onomatopoeia is chosen, not transliterated

A sound effect is not translated. Transliterating gives you `הו הו האה האה`
("ho ho", Santa), `קפוץ קפוץ` (an order: "jump!"), `נדנוד נדנוד` (a noun) and
`טוק טוק` for a helicopter (knocking at a door). Pick the sound a Hebrew
speaker would actually make.

## Four cartridges ship no Hebrew, on purpose

`letters`, `pop`, `rain` and `rhyme` are English **word** games — spelling a
letter, popping a lettered balloon, typing a falling word, finding a rhyme. A
Hebrew "which word rhymes with cat" would be a lie, and a Hebrew name that
opens an English game is worse than an honest absence.

All four declare `locales: ['en']`, so `forLocale('he')` filters them out of
the Hebrew games menu and out of Hebrew `help` automatically. This is asserted
as correct behaviour, not tolerated as a gap.
