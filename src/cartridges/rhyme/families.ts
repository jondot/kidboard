/**
 * A rhyme family: the word the game offers, the endings that make something
 * rhyme with it, and a curated list of rhymes that the ending rule alone
 * would miss ("one" for SUN, "steak" for CAKE, "kite" for NIGHT — English
 * spelling is not a reliable guide to English sound).
 *
 * `rimes` is generous on purpose and deliberately never used to REJECT
 * anything: see `isRhyme` for the three widening rules and `cartridge.ts` for
 * what happens to a word none of them can confirm.
 */
export type Family = { word: string; rimes: readonly string[]; rhymes: readonly string[] }

export const FAMILIES: readonly Family[] = [
  {
    word: 'cat',
    rimes: ['at'],
    rhymes: ['hat', 'bat', 'mat', 'rat', 'sat', 'pat', 'fat', 'flat', 'chat', 'that', 'splat'],
  },
  {
    word: 'dog',
    rimes: ['og'],
    rhymes: ['frog', 'log', 'fog', 'hog', 'jog', 'clog', 'blog'],
  },
  {
    word: 'sun',
    rimes: ['un'],
    rhymes: ['fun', 'run', 'bun', 'spun', 'one', 'won', 'done', 'none', 'ton'],
  },
  {
    word: 'star',
    rimes: ['ar'],
    rhymes: ['car', 'far', 'jar', 'bar', 'tar', 'guitar', 'are', 'scar'],
  },
  {
    word: 'bee',
    rimes: ['ee', 'ea'],
    rhymes: ['tree', 'see', 'free', 'knee', 'three', 'sea', 'me', 'we', 'key', 'tea', 'he', 'she', 'flea', 'pea'],
  },
  {
    word: 'cake',
    rimes: ['ake'],
    rhymes: ['lake', 'snake', 'bake', 'make', 'rake', 'shake', 'take', 'wake', 'break', 'steak', 'ache'],
  },
  {
    word: 'moon',
    rimes: ['oon'],
    rhymes: ['spoon', 'balloon', 'soon', 'noon', 'cartoon', 'tune', 'june', 'dune', 'raccoon'],
  },
  {
    word: 'bug',
    rimes: ['ug'],
    rhymes: ['hug', 'rug', 'mug', 'jug', 'tug', 'plug', 'slug', 'dug'],
  },
  {
    word: 'fish',
    rimes: ['ish'],
    rhymes: ['dish', 'wish', 'swish', 'squish'],
  },
  {
    word: 'pig',
    rimes: ['ig'],
    rhymes: ['big', 'dig', 'wig', 'fig', 'twig', 'jig', 'zig'],
  },
  {
    word: 'ball',
    rimes: ['all'],
    rhymes: ['tall', 'wall', 'fall', 'call', 'small', 'hall', 'mall', 'crawl', 'shawl'],
  },
  {
    word: 'night',
    rimes: ['ight', 'ite'],
    rhymes: ['light', 'bright', 'white', 'right', 'might', 'fight', 'sight', 'kite', 'bite', 'quite'],
  },
  {
    word: 'snow',
    rimes: ['ow', 'oe'],
    rhymes: ['blow', 'grow', 'low', 'slow', 'show', 'glow', 'know', 'throw', 'crow', 'go', 'no', 'so', 'toe', 'dough'],
  },
  {
    word: 'red',
    rimes: ['ed'],
    rhymes: ['bed', 'head', 'bread', 'said', 'fed', 'led', 'sled', 'thread', 'dead', 'shed'],
  },
]

const VOWELS = 'aeiou'

/**
 * A near-rhyme, in the sense a six-year-old means it: it ends on the same
 * sound and carries the same vowel. "ant" for CAT, "pal" for BALL, "cow" for
 * SNOW. Only ever applied to a rime that ends in a consonant — a rime ending
 * in a vowel ("ee", "ake") would otherwise wave through every word in English
 * that happens to end in "e", and telling a child that BEE and CAKE rhyme is
 * a lie, not a kindness.
 */
function isNearRhyme(rime: string, answer: string): boolean {
  const tail = rime[rime.length - 1]!
  if (VOWELS.includes(tail)) return false
  const vowel = [...rime].find((c) => VOWELS.includes(c))
  if (!vowel) return false
  return answer.length >= 3 && answer.endsWith(tail) && answer.slice(-3).includes(vowel)
}

/**
 * Three widening rules, in order of confidence: the curated list, then the
 * family's own endings, then the near-rhyme. A word none of them recognises
 * is NOT declared a non-rhyme anywhere — this function only ever says "yes,
 * confirmed"; the cartridge decides what to say when it cannot confirm, and
 * what it says is never "no".
 */
export function isRhyme(family: Family, answer: string): boolean {
  if (answer === family.word) return false
  if (family.rhymes.includes(answer)) return true
  if (family.rimes.some((r) => answer.length > r.length && answer.endsWith(r))) return true
  return family.rimes.some((r) => isNearRhyme(r, answer))
}
