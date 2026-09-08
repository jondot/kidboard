import type { Locale } from '../types'

/**
 * Everything the carts feature says, in both languages.
 *
 * It lives here rather than in `src/i18n/*.json` for one reason: those files
 * are the SHELL's vocabulary and several tasks are editing them at once. A
 * self-contained catalog passed to `makeT(locale, CART_STRINGS)` resolves
 * exactly the same way — cartridges already do this — and adds no shared
 * file to collide over.
 *
 * Emoji are written as emoji and Hebrew as Hebrew, never as escapes.
 * `{placeholder}` names match across the two catalogs; `carts.strings.test.ts`
 * enforces both mechanically, the same way `invariants.test.ts` does for a
 * cartridge.
 */
export const CART_STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    'carts.title': 'carts',
    // The panel, when the app ships as it does: with none.
    'carts.none': 'no carts yet',
    'carts.add': 'open a cart…',
    'carts.drop': 'or drop one anywhere',
    'carts.mine': 'save a game as a cart',
    'carts.forget': 'forget {name}',

    // A cart arriving.
    'carts.new': 'new cart!',
    'carts.by': 'by {author}',
    'carts.play': 'type {word} to play!',
    'carts.renamed': 'there was already a {old}, so this one is {name}',
    'carts.again': '{name} is here again',

    // Everything that can go wrong, said warmly. There is no error state.
    //
    // THREE OF THEM, and they are said in turn. A child dragging a folder in
    // drops several files at once, and four identical lines in a row stop
    // reading as "that is fine" and start reading as disapproval — the same
    // defect already fixed inside `count`, `spot` and `rhyme` ("three
    // identical miss lines in a row read as disapproval"). Every one of them
    // says the same warm, blameless thing in different words; none of them
    // names a fault, and none asks the child to do anything about it.
    'carts.justapicture': 'that one is just a picture',
    'carts.justapicture.2': 'a picture! no game hiding in this one',
    'carts.justapicture.3': 'just a picture again — a nice one though',
    'carts.rest': '{name} went for a rest',

    // Saving.
    'carts.saved': 'saved {name}',
    'carts.forgot': '{name} went home',
  },
  he: {
    'carts.title': 'קלטות',
    'carts.none': 'אין עדיין קלטות',
    'carts.add': 'פתיחת קלטת…',
    'carts.drop': 'אפשר גם לגרור לכאן',
    'carts.mine': 'שמירת משחק כקלטת',
    'carts.forget': 'להיפרד מ{name}',

    'carts.new': 'קלטת חדשה!',
    'carts.by': 'מאת {author}',
    'carts.play': 'כתבו {word} כדי לשחק!',
    'carts.renamed': 'כבר יש {old}, אז לזאת קוראים {name}',
    'carts.again': '{name} שוב כאן',

    // Three sentences, not one said three times — the English side varies
    // for a reason (see the note there: four identical miss lines in a row
    // read as disapproval), and a Hebrew-reading child is owed the same
    // variety. Second-person plural throughout, blameless throughout: none
    // of them names a fault or asks the child to fix anything.
    'carts.justapicture': 'זאת פשוט תמונה',
    'carts.justapicture.2': 'תמונה! אין כאן משחק מתחבא',
    'carts.justapicture.3': 'שוב תמונה — ויפה, אגב',
    'carts.rest': '{name} הלכה לנוח',

    'carts.saved': '{name} נשמרה',
    'carts.forgot': '{name} הלכה הביתה',
  },
}
