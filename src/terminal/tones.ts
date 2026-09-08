import type { Scale, Tone } from '../types'

export function toneClass(tone: Tone = 'plain'): string {
  return `kb-tone-${tone}`
}

export function scaleClass(scale: Scale = 'normal'): string {
  return `kb-scale-${scale}`
}
