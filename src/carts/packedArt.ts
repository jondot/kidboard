import { fromRows, type Bitmap } from './art'

/**
 * THE PICTURE FOR A BUILT-IN, wherever one is needed.
 *
 * Two places need it now, which is why the turn cartridges are in this table
 * even though they can never be packed: the front of a saved cart, and the
 * TILE in the game picker. A shelf of games with five blank cards on it is a
 * shelf that says "these five are the leftovers", and `count` and `story` are
 * not leftovers — they are simply conversations rather than frame loops.
 *
 * Hand-drawn, and hand-drawn on purpose: a cart label is the charming part of
 * the PICO-8 idea, and a generated one — a hash pattern, a letter in a box —
 * would be a placeholder wearing a picture's clothes. Twelve by ten is about
 * as small as a drawing can be and still be a drawing.
 *
 * MONOCHROME by construction. A label is a two-colour bitmap: one ink, one
 * ground, four half-block glyphs when the terminal reads it back. There is no
 * second tone here to give away, which is why `art.ts` calls monochrome the
 * format rather than a restriction.
 *
 * These live apart from `packed.ts` because `packed.ts` is GENERATED and this
 * is not: re-running `npm run pack-carts` must never quietly erase a drawing.
 * A cartridge with nothing here still packs — `PLAIN_LABEL` is a blank card,
 * which is what a cart with no art on it honestly is.
 */
export const PACKED_ART: Record<string, Bitmap> = {
  /** A bomb on its way down, and a bucket waiting under it. */
  kaboom: fromRows([
    '   xx       ',
    '   xx       ',
    '  xxxx      ',
    ' xxxxxx     ',
    ' xxxxxx     ',
    '  xxxx      ',
    '            ',
    'xx        xx',
    'xx        xx',
    'xxxxxxxxxxxx',
  ]),
  /** The canopy, someone running, and a hole in the ground. */
  jungle: fromRows([
    'xxxxxxxxxxxx',
    'x x  xx  x x',
    '            ',
    '    xxx     ',
    '    xxx     ',
    '   xxxxx    ',
    '   x x x    ',
    '            ',
    'xxxxx  xxxxx',
    'xxxxx  xxxxx',
  ]),
  /** A centipede winding above a mushroom, and the blaster below it. */
  bugs: fromRows([
    ' xx  xx  xx ',
    'x  xx  xx  x',
    ' xx  xx  xx ',
    '            ',
    '   xxxxxx   ',
    '   x    x   ',
    '     xx     ',
    '     xx     ',
    '     xx     ',
    '  xxxxxxxx  ',
  ]),
  /** Four corners with walls on them, and the one ball they all share. */
  castles: fromRows([
    'xxx      xxx',
    'xx        xx',
    'x          x',
    '            ',
    '     xx     ',
    '     xx     ',
    '            ',
    'x          x',
    'xx        xx',
    'xxx      xxx',
  ]),
  /** The child, mouth open, a ghost beside them and a trail of dots below. */
  ghosts: fromRows([
    '            ',
    '   xxx      ',
    '  xxxxx  xx ',
    '  xxx   xxxx',
    '  xx    x  x',
    '  xxx   xxxx',
    '  xxxxx x  x',
    '   xxx  xx x',
    '            ',
    '  x  x  x   ',
  ]),
  /** Girders, a ladder, a barrel, and someone waiting at the top. */
  climb: fromRows([
    'x xx    x  x',
    'xxxxxxxxxxxx',
    'x     x x  x',
    'x     x x  x',
    'xxxxxxxxxxxx',
    'x  x x     x',
    'x  x x   xx x',
    'xxxxxxxxxxxx',
    'x xx       x',
    'xxxxxxxxxxxx',
  ]),
  /** Two rows of posts converging on the dark, and the car at the bottom. */
  road: fromRows([
    'xxxxxxxxxxxx',
    'x          x',
    'x   x  x   x',
    'x  x    x  x',
    'x  x    x  x',
    'x x      x x',
    'x x      x x',
    'x   xxxx   x',
    'x   xxxx   x',
    'xxxxxxxxxxxx',
  ]),
  /** A piece falling into a well with a row nearly done. */
  blocks: fromRows([
    'xxxxxxxxxxxx',
    'x   xxxx   x',
    'x   x  x   x',
    'x          x',
    'x          x',
    'x x x x    x',
    'x xxx x x  x',
    'x x x x x  x',
    'x xxxxxxx  x',
    'xxxxxxxxxxxx',
  ]),
  /** A lumpy rock and the little ship that is about to break it up. */
  asteroids: fromRows([
    'xxxxxxxxxxxx',
    'x   xxxx   x',
    'x  x    x  x',
    'x xx     x x',
    'x  x    xx x',
    'x   xxxx   x',
    'x     x    x',
    'x    x x   x',
    'x   xxxxx  x',
    'xxxxxxxxxxxx',
  ]),
  /** A rank of two, and the ship below them. */
  invaders: fromRows([
    'xxxxxxxxxxxx',
    'x x x  x x x',
    'x xxx  xxx x',
    'xx x x  x xx',
    'x          x',
    'x    x     x',
    'x   xxx    x',
    'x  xxxxx   x',
    'x          x',
    'xxxxxxxxxxxx',
  ]),
  /** A wall with a hole knocked in it, a ball, and the bat under it. */
  bricks: fromRows([
    'xxxxxxxxxxxx',
    'x xx xx xx x',
    'x xx    xx x',
    'x xx xx xx x',
    'x          x',
    'x    xx    x',
    'x    xx    x',
    'x          x',
    'x  xxxxxx  x',
    'xxxxxxxxxxxx',
  ]),
  /** A frog between two lanes of traffic. */
  frogger: fromRows([
    'xxxxxxxxxxxx',
    'x xxx  xxx x',
    'x x x  x x x',
    'x xxx  xxx x',
    'x          x',
    'x   x  x   x',
    'x   xxxx   x',
    'x  xxxxxx  x',
    'x  xx  xx  x',
    'xxxxxxxxxxxx',
  ]),
  /** A crate, and the ring it is being pushed towards. */
  sokoban: fromRows([
    'xxxxxxxxxxxx',
    'x          x',
    'x xxxx     x',
    'x x  x  xx x',
    'x x  x x  xx',
    'x xxxx x  xx',
    'x       xx x',
    'x          x',
    'x          x',
    'xxxxxxxxxxxx',
  ]),
  /** A cushion with a stubby neck, and three dashes of it getting away. */
  fart: fromRows([
    'xxxxxxxxxxxx',
    'x        x x',
    'x   x   x  x',
    'x   x  x   x',
    'x  xxx     x',
    'x xxxxx    x',
    'x xxxxx    x',
    'x  xxx     x',
    'x          x',
    'xxxxxxxxxxxx',
  ]),
  ball: fromRows([
    'xxxxxxxxxxxx',
    'x          x',
    'x xx       x',
    'x xx       x',
    'x     xx   x',
    'x     xx   x',
    'x       xx x',
    'x       xx x',
    'x          x',
    'xxxxxxxxxxxx',
  ]),

  catch: fromRows([
    '     xx     ',
    '     xx     ',
    '            ',
    '            ',
    '            ',
    '  x      x  ',
    '  x      x  ',
    '  x      x  ',
    '  xxxxxxxx  ',
    '   xxxxxx   ',
  ]),

  draw: fromRows([
    '         xx ',
    '        xxxx',
    '       xxxx ',
    '      xxxx  ',
    '     xxxx   ',
    '    xxxx    ',
    '   xxxx     ',
    '  xxxx      ',
    ' xxx        ',
    ' xx         ',
  ]),

  drum: fromRows([
    '  x      x  ',
    '   x    x   ',
    '    x  x    ',
    '  xxxxxxxx  ',
    ' xxxxxxxxxx ',
    ' x  x  x  x ',
    ' x   xx   x ',
    ' x  x  x  x ',
    ' xxxxxxxxxx ',
    '  xxxxxxxx  ',
  ]),

  fish: fromRows([
    '            ',
    '    xxxx    ',
    '  xxxxxxxx x',
    ' xxx xxxxxxx',
    'xxxxxxxxxxxx',
    'xxxxxxxxxxxx',
    ' xxxxxxxxxxx',
    '  xxxxxxxx x',
    '    xxxx    ',
    '            ',
  ]),

  maze: fromRows([
    'xxxxxxxxxxxx',
    'x     x    x',
    'x xxx x xx x',
    'x x     x  x',
    'x x xxxxx xx',
    'x x x      x',
    'x xxx xxx  x',
    'x     x    x',
    'xxxxx x xxxx',
    'xxxxxxxxxxxx',
  ]),

  mole: fromRows([
    '            ',
    '    xxxx    ',
    '   xxxxxx   ',
    '  xx xx xx  ',
    '  xxxxxxxx  ',
    '   xxxxxx   ',
    '    xxxx    ',
    ' xxxxxxxxxx ',
    'xxxxxxxxxxxx',
    '            ',
  ]),

  piano: fromRows([
    'xxxxxxxxxxxx',
    'x  x  x  x x',
    'x  x  x  x x',
    'x  x  x  x x',
    'x  x  x  x x',
    'x  x  x  x x',
    'x  x  x  x x',
    'x  x  x  x x',
    'x  x  x  x x',
    'xxxxxxxxxxxx',
  ]),

  pop: fromRows([
    '    xxxx    ',
    '  xxxxxxxx  ',
    ' xxxxxxxxxx ',
    ' xxxxxxxxxx ',
    ' xxxxxxxxxx ',
    '  xxxxxxxx  ',
    '    xxxx    ',
    '     xx     ',
    '    x       ',
    '     x      ',
  ]),

  rain: fromRows([
    ' x    x    x',
    ' x    x    x',
    '            ',
    '   x    x   ',
    '   x    x   ',
    '            ',
    ' x    x    x',
    ' x    x    x',
    '            ',
    '   x    x   ',
  ]),

  robot: fromRows([
    '  x      x  ',
    '   x    x   ',
    ' xxxxxxxxxx ',
    ' x        x ',
    ' x xx  xx x ',
    ' x        x ',
    ' x  xxxx  x ',
    ' x        x ',
    ' xxxxxxxxxx ',
    '   xx  xx   ',
  ]),

  /**
   * The same little ship, now coming DOWN onto a flat pad between two peaks.
   * `rocket` used to be a launch; the drawing follows the game.
   */
  rocket: fromRows([
    '     xx     ',
    '    xxxx    ',
    '   xx  xx   ',
    '   xxxxxx   ',
    '  xx xx xx  ',
    '     xx     ',
    '    x  x    ',
    'x        x  ',
    'xx      xxx ',
    'xxx xxxx xxx',
  ]),

  simon: fromRows([
    '     xx     ',
    '    xxxx    ',
    '   xxxxxx   ',
    '  xxx  xxx  ',
    ' xxx    xxx ',
    ' xxx    xxx ',
    '  xxx  xxx  ',
    '   xxxxxx   ',
    '    xxxx    ',
    '     xx     ',
  ]),

  snake: fromRows([
    'xxxxxxxxx   ',
    '        x   ',
    '        x   ',
    '  xxxxxxx   ',
    '  x         ',
    '  x         ',
    '  xxxxxxxxx ',
    '          x ',
    '        xxx ',
    '        x x ',
  ]),

  /* ---- the turn cartridges ---------------------------------------------
   *
   * These are conversations, so they never pack into a cart (a cart is a frame
   * loop). They are drawn all the same, because the picker shows every game a
   * child can start and a blank card would say the wrong thing about them.
   */

  /** Three bars, each taller than the last. Counting, with nothing counted. */
  count: fromRows([
    '            ',
    '          xx',
    '          xx',
    '      xx  xx',
    '      xx  xx',
    '  xx  xx  xx',
    '  xx  xx  xx',
    '  xx  xx  xx',
    '  xx  xx  xx',
    '            ',
  ]),

  /** Four cards: two face down, two turned over. */
  memory: fromRows([
    '  xxxx xxxx ',
    '  x  x xxxx ',
    '  x  x xxxx ',
    '  xxxx xxxx ',
    '            ',
    '  xxxx xxxx ',
    '  xxxx x  x ',
    '  xxxx x  x ',
    '  xxxx xxxx ',
    '            ',
  ]),

  /** Two arcs of the same shape: two words that end the same way. */
  rhyme: fromRows([
    '            ',
    '  xx    xx  ',
    ' x  x  x  x ',
    'x    xx    x',
    '            ',
    '            ',
    '  xx    xx  ',
    ' x  x  x  x ',
    'x    xx    x',
    '            ',
  ]),

  /** A lens with a handle. Looking closely is the whole game. */
  spot: fromRows([
    '   xxxx     ',
    '  x    x    ',
    ' x      x   ',
    ' x      x   ',
    ' x      x   ',
    '  x    x    ',
    '   xxxx     ',
    '      xx    ',
    '       xx   ',
    '        xx  ',
  ]),

  /** A page with lines on it. */
  story: fromRows([
    ' xxxxxxxxxx ',
    ' x        x ',
    ' x xxxxxx x ',
    ' x        x ',
    ' x xxxxx  x ',
    ' x        x ',
    ' x xxxxxx x ',
    ' x        x ',
    ' x xxx    x ',
    ' xxxxxxxxxx ',
  ]),

  stars: fromRows([
    '   x        ',
    '  xxx    x  ',
    '   x    xxx ',
    '         x  ',
    '      x     ',
    '     xxx    ',
    '      x     ',
    '  x         ',
    ' xxx     x  ',
    '  x     xxx ',
  ]),
}

/**
 * The drawing for a packed cart, by the id the packer gives it
 * (`kidboard-<cartridge id>`), or nothing if none was drawn.
 */
export function packedArt(manifestId: string): Bitmap | undefined {
  return PACKED_ART[manifestId.replace(/^kidboard-/, '')]
}

/** The same drawing, by the CARTRIDGE's own id — what the picker asks with. */
export function artFor(cartridgeId: string): Bitmap | undefined {
  return PACKED_ART[cartridgeId]
}
