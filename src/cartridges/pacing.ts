/**
 * THE PAUSE, AND HOW LONG IT IS PROTECTED FOR.
 *
 * The house rule is "a round ends when the CHILD says it ends": nothing
 * re-arms on a timer, and when something concludes the picture HOLDS until a
 * key asks for the next one. That rule is worthless on its own, and this
 * constant is the reason why.
 *
 * A six-year-old plays a game with the arrow key HELD DOWN. The operating
 * system turns that into a stream of keydowns roughly every 30 ms, so the
 * miss, the hold and the next serve all happen inside one press of one
 * finger: measured in Chrome on `ball`, the resting ball never survived more
 * than two frames (~33 ms) while an arrow was held, against 9 seconds with
 * the hands off the keyboard. The pause existed the whole time; the child
 * never once saw it.
 *
 * So a hold ignores the keyboard for its first half second. Long enough to
 * break a key repeat and to let the moment land, short enough that a
 * deliberate press still feels instant. It is a fixed number rather than a
 * per-game dial on purpose: the pause is the same promise in every game, and
 * five copies of `0.5` would drift.
 *
 * WHERE IT DOES NOT APPLY: the beat a game opens on. Starting up is not a
 * round ending — a child who typed the game's name and reaches for a key must
 * be answered at once — so a cartridge's initial rest starts with the window
 * already spent, and only a real conclusion (a miss, a bump, a win, a landed
 * rocket, a finished program) opens a new one.
 *
 * Plain arithmetic, no state, no DOM: importing this keeps a cartridge the
 * "plain data and functions" a sandbox can host.
 */
export const HOLD_IGNORE = 0.5
