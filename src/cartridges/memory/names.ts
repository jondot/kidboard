import { EMOJI } from '../../content/smash'

/**
 * A souvenir names WHAT was found ("the cat and the rocket"), never how many
 * pairs. This maps each face in the shared `EMOJI` pool to a translation-key
 * id, so `memory.name.<id>` in en.json / he.json supplies the actual word in
 * each language — the Hebrew name is real Hebrew prose (with its ה prefix
 * built in), not a transliteration and not code.
 *
 * Order matches `content/smash.ts`'s `EMOJI` exactly; a mismatch here would
 * silently name the wrong face, which is why `memory.test.ts` checks every
 * entry resolves to a translation.
 */
export const EMOJI_NAME_ID: Record<(typeof EMOJI)[number], string> = {
  '🚀': 'rocket',
  '🦕': 'dinosaur',
  '🐱': 'cat',
  '🔥': 'fire',
  '⭐': 'star',
  '🌈': 'rainbow',
  '💎': 'gem',
  '🎸': 'guitar',
  '🦞': 'lobster',
  '🐙': 'octopus',
  '🎪': 'circus',
  '🌸': 'blossom',
  '🍕': 'pizza',
  '🎯': 'target',
  '🐋': 'whale',
  '🦋': 'butterfly',
  '🌊': 'wave',
  '🎵': 'note',
  '🍭': 'lollipop',
  '🐲': 'dragon',
  '👾': 'alien',
  '🪐': 'planet',
  '🦈': 'shark',
  '🌻': 'sunflower',
  '🎨': 'palette',
  '🐸': 'frog',
  '🏀': 'basketball',
  '🦄': 'unicorn',
  '🎃': 'pumpkin',
  '🐧': 'penguin',
}
