import type { BlockSpec, Rng, T } from '../types'

export const EMOJI = [
  '🚀','🦕','🐱','🔥','⭐','🌈',
  '💎','🎸','🦞','🐙','🎪','🌸',
  '🍕','🎯','🐋','🦋','🌊','🎵',
  '🍭','🐲','👾','🪐','🦈','🌻',
  '🎨','🐸','🏀','🦄','🎃','🐧',
] as const

export function randomEmoji(rng: Rng, n: number): string {
  let out = ''
  for (let i = 0; i < n; i++) out += rng.pick(EMOJI)
  return out
}

function creature(text: string, rng: Rng): string {
  const eyes = ['o', 'O', '@', '*', '+', 'x'] as const
  const chars = [...text].slice(0, 12)
  const e1 = rng.pick(eyes)
  const e2 = rng.pick(eyes)
  const body = chars.slice(0, 6).join('') || 'vvv'
  const legs = chars.slice(6, 10).join('') || 'vvvv'
  return rng.pick([
    `  (${e1} ${e2})\n / ${body} \\\n  ${legs}`,
    `   ${e1}___${e2}\n  /${body}\\\n  ~${legs}~`,
    ` \\(${e1}.${e2})/\n  |${body}|\n  /${legs}\\`,
    `  {${e1} ${e2}}\n <|${body}|>\n  ^${legs}^`,
  ])
}

const FACT_KEYS = [
  'smash.fact.1', 'smash.fact.2', 'smash.fact.3',
  'smash.fact.4', 'smash.fact.5', 'smash.fact.6',
] as const

const SOUND_KEYS = [
  'smash.sound.1', 'smash.sound.2', 'smash.sound.3', 'smash.sound.4',
  'smash.sound.5', 'smash.sound.6', 'smash.sound.7',
] as const

/**
 * Twelve shapes so mashing never feels the same twice. Never a rebuke.
 *
 * `t` is not optional: keyboard-smashing is the single most likely thing a
 * six-year-old does, and seven of these twelve responses are prose. Without a
 * locale seam they showed English to a Hebrew-reading child.
 */
export function smashResponse(text: string, rng: Rng, t: T): BlockSpec[] {
  const chars = [...text]
  switch (rng.int(12)) {
    case 0:
      return [{ kind: 'text', text: randomEmoji(rng, 12 + rng.int(8)), scale: 'flood' }]
    case 1:
      return [
        { kind: 'art', art: creature(text, rng), tone: 'magic' },
        { kind: 'text', text: t('smash.creature'), tone: 'magic' },
      ]
    case 2:
      return [{
        kind: 'text',
        text: `${t('letters.count', { n: chars.length })} ${rng
          .pick(EMOJI).repeat(Math.min(chars.length, 20))}`,
        tone: 'cool',
      }]
    case 3:
      return [{ kind: 'text', text, tone: 'magic', scale: 'giant', rainbow: true }]
    case 4: {
      const e = rng.pick(EMOJI)
      return [{ kind: 'text', text: `${e} ${e} ${e} ${e} ${e}`, scale: 'big' }]
    }
    case 5:
      return [{
        kind: 'text',
        text: t('smash.backwards', { text: chars.slice().reverse().join('') }),
        tone: 'magic',
      }]
    case 6:
      return [{
        kind: 'text',
        text: chars.map((ch) => ch + rng.pick(EMOJI)).join(''),
        scale: 'flood',
      }]
    case 7:
      return [{ kind: 'art', art: chars.join('\n'), tone: 'magic' }]
    case 8:
      return [{ kind: 'text', text: t('smash.beep', { text }), tone: 'warm' }]
    case 9:
      return [{
        kind: 'text',
        text: t('smash.code', {
          text: chars
            .map((ch) => String.fromCodePoint(ch.codePointAt(0)! + 1))
            .join(''),
        }),
        tone: 'magic',
      }]
    case 10:
      return [{ kind: 'text', text: t(rng.pick(FACT_KEYS)), tone: 'info' }]
    default:
      return [{ kind: 'text', text: t(rng.pick(SOUND_KEYS)), tone: 'warm', scale: 'giant' }]
  }
}
