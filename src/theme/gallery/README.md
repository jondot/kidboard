Real `colors.toml` files from Omarchy (MIT, © Basecamp / David Heinemeier
Hansson), copied verbatim from the `quattro` branch's `themes/` directory —
https://github.com/basecamp/omarchy

These are not test fixtures (see `../fixtures/` for those): they are the
gallery Kidboard actually ships in the 🎨 panel, alongside the two tuned
defaults `sunset-arcade` and `desert-noon`. The theme engine adopted Omarchy's
schema specifically so that any of these files would drop in as data — see
`../gallery.ts` for how they become `Theme`s, and `../palette.ts` for the
legibility guard that keeps every one of them readable under Kidboard's
monochrome-per-game tone mapping.

Do not edit them. A theme that needs a different colour is a theme to
reconsider shipping, not a fixture to patch.
