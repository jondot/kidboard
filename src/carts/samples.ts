import type { CartManifest } from './manifest'
import { fromRows, type Bitmap } from './art'

/**
 * One authored cart, shipped as source rather than as a file.
 *
 * It exists so the 🃏 panel always has something to hand a child who has not
 * made anything yet, and so the whole loop — save it, reload, drop it back
 * in, play it — can be walked from a cold start. It is a real cart: this
 * source is what runs in the Worker.
 */
export const BLINK_CODE = `
var t = 0;
var lit = false;
kb.game(function (ctx) {
  return {
    onKey: function (e) { if (e.key === " ") lit = !lit; },
    tick: function (dt) { t += dt; },
    draw: function (c) {
      var mid = Math.floor(c.h / 2);
      var x = Math.floor(c.w / 2);
      var open = lit || Math.floor(t) % 2 === 0;
      c.clear();
      c.text(x - 3, mid - 1, open ? "*   *" : "-   -", "warm");
      c.text(x - 3, mid + 1, " \\\\___/ ", "warm");
      c.text(1, c.h - 1, ctx.t("hint"), "plain");
    },
    souvenir: function () { return ctx.t("bye"); }
  };
});
`.trim()

export const BLINK_LABEL: Bitmap = fromRows([
  '  xxxxxxxx  ',
  ' xxxxxxxxxx ',
  'xx xx  xx xx',
  'xx xx  xx xx',
  'xxxxxxxxxxxx',
  'xx        xx',
  'xx xxxxxx xx',
  'xx  xxxx  xx',
  ' xxxxxxxxxx ',
  '  xxxxxxxx  ',
])

export const BLINK: CartManifest = {
  apiVersion: 1,
  id: 'kidboard-blink',
  name: { en: 'blink', he: 'ממצמץ' },
  title: { en: 'Blink', he: 'ממצמץ' },
  author: 'kidboard',
  locales: ['en', 'he'],
  hints: { en: ['SPACE keep them open'], he: ['SPACE להשאיר פקוחות'] },
  strings: {
    en: { hint: 'press space', bye: 'blink blink' },
    he: { hint: 'לחצו רווח', bye: 'מצמוץ מצמוץ' },
  },
  code: BLINK_CODE,
  size: { cols: 24, aspect: 2 },
  emoji: '😊',
}
