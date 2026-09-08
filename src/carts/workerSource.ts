/**
 * The bootstrap that runs INSIDE a cart's Worker, as source text.
 *
 * It is a string rather than a module because the worker is created from a
 * `blob:` URL: there is no file to fetch, no import graph, and nothing for a
 * cart to reach back into. Written in ES5-flavoured JavaScript on purpose —
 * it is never transpiled, so it must be exactly what runs.
 *
 * WHAT THE SANDBOX IS. The load-bearing guarantee is the worker realm itself:
 * no `document`, no `window`, no `localStorage`, no access to the embedding
 * page. On top of that this bootstrap deletes every remaining global that can
 * reach the network, evaluates the cart with those names shadowed as
 * parameters, and refuses code that mentions `import` at all.
 *
 * WHAT IT IS NOT. A cart can still reach the `Function` constructor through
 * an ordinary prototype chain, so a determined author could construct a
 * dynamic import; sealing that needs a Content-Security-Policy on the page
 * that owns the worker, which an embeddable component cannot impose on its
 * host. This is why Kidboard ships no gallery and fetches nothing: a cart is
 * always a local file somebody chose. `docs/CARTS.md` says so plainly.
 */

/** Names taken away from the worker's global object before any cart runs. */
export const DENIED = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts',
  'indexedDB', 'caches', 'Worker', 'SharedWorker', 'BroadcastChannel',
  'Notification', 'Request', 'Response', 'navigator', 'crypto',
] as const

/** …and shadowed as parameters, so the cart's own scope cannot name them. */
/**
 * `eval` is absent deliberately: a parameter may not be NAMED `eval` in strict
 * mode, so shadowing it is a syntax error rather than a defence. It confers
 * nothing beyond `Function`, which a cart can reach through any prototype
 * chain anyway — see the honesty note at the top of this file.
 */
export const SHADOWED = [
  'self', 'globalThis', 'Function', 'postMessage', 'addEventListener',
  'close', 'onmessage', 'location', 'importScripts', 'fetch',
  'XMLHttpRequest', 'WebSocket', 'Worker', 'indexedDB', 'navigator',
] as const

export const WORKER_SOURCE = [
  '"use strict";',
  '(function () {',
  '  var send = self.postMessage.bind(self);',
  '  var DENIED = ' + JSON.stringify(DENIED) + ';',
  '  var SHADOWED = ' + JSON.stringify(SHADOWED) + ';',
  '  for (var i = 0; i < DENIED.length; i++) {',
  '    try { self[DENIED[i]] = undefined; } catch (e) { /* frozen: fine */ }',
  '  }',
  '',
  '  // Deterministic rng, same shape as the host\'s Rng.',
  '  function makeRng(seed) {',
  '    var s = seed >>> 0;',
  '    function float() {',
  '      s = (s + 0x6d2b79f5) >>> 0;',
  '      var t = s;',
  '      t = Math.imul(t ^ (t >>> 15), t | 1);',
  '      t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;',
  '      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;',
  '    }',
  '    return {',
  '      float: float,',
  '      int: function (n) { return n > 0 ? Math.floor(float() * n) : 0; },',
  '      pick: function (xs) { return xs[Math.floor(float() * xs.length)]; },',
  '      chance: function (p) { return float() < p; }',
  '    };',
  '  }',
  '',
  '  // A recorder with the same surface as the host Canvas. Records only,',
  '  // never rasterizes: the buffer IS the message.',
  '  function makeCanvas(w, h) {',
  '    var buf = [];',
  '    var num = function (n) { return typeof n === "number" && isFinite(n) ? n : 0; };',
  '    var tn = function (t) { return typeof t === "string" ? t : "plain"; };',
  '    return {',
  '      w: w, h: h, pw: w * 8, ph: h * 8,',
  '      cmds: function () { return buf; },',
  '      clear: function () { buf.push({ op: "clear" }); },',
  '      put: function (x, y, ch, t) { buf.push({ op: "put", x: num(x), y: num(y), ch: String(ch), tone: tn(t) }); },',
  '      text: function (x, y, s, t) { buf.push({ op: "text", x: num(x), y: num(y), text: String(s), tone: tn(t) }); },',
  '      box: function (x, y, bw, bh, t) { buf.push({ op: "box", x: num(x), y: num(y), w: num(bw), h: num(bh), tone: tn(t) }); },',
  '      emoji: function (x, y, e) { buf.push({ op: "emoji", x: num(x), y: num(y), emoji: String(e) }); },',
  '      rect: function (x, y, bw, bh, t) { buf.push({ op: "rect", x: num(x), y: num(y), w: num(bw), h: num(bh), tone: tn(t) }); },',
  '      outline: function (x, y, bw, bh, t, th) { buf.push({ op: "outline", x: num(x), y: num(y), w: num(bw), h: num(bh), t: th === undefined ? 1 : num(th), tone: tn(t) }); },',
  '      line: function (x, y, x2, y2, t) { buf.push({ op: "line", x: num(x), y: num(y), x2: num(x2), y2: num(y2), tone: tn(t) }); },',
  '      disc: function (x, y, r, t) { buf.push({ op: "disc", x: num(x), y: num(y), r: num(r), tone: tn(t) }); },',
  '      circle: function (x, y, r, t) { buf.push({ op: "circle", x: num(x), y: num(y), r: num(r), tone: tn(t) }); },',
  '      sprite: function (x, y, rows, t, o) {',
  '        o = o || {};',
  '        buf.push({ op: "sprite", x: num(x), y: num(y), rows: (rows || []).slice(),',
  '          tone: tn(t), flipX: o.flipX === true, flipY: o.flipY === true,',
  '          scale: o.scale === undefined ? 1 : num(o.scale) });',
  '      }',
  '    };',
  '  }',
  '',
  '  var inst = null;',
  '  var factory = null;',
  '  var over = false;',
  '',
  '  function done(souvenir) {',
  '    if (over) return;',
  '    over = true;',
  '    inst = null;',
  '    send({ m: "exit", souvenir: typeof souvenir === "string" ? souvenir : "" });',
  '  }',
  '',
  '  // Anything the cart throws ends the cart, quietly. The host turns that',
  '  // into one warm line; a child never learns that code exists.',
  '  function guard(fn) {',
  '    try { return fn(); } catch (e) { done(""); return undefined; }',
  '  }',
  '',
  '  function paint(seq, w, h) {',
  '    if (over || !inst) return;',
  '    var c = makeCanvas(w, h);',
  '    guard(function () { inst.draw(c); });',
  '    if (over) return;',
  '    // The souvenir rides along with every frame. The shell asks for it',
  '    // synchronously (it is the last call apiVersion 1 makes), and a',
  '    // postMessage cannot answer synchronously — so the answer is always',
  '    // already here, one frame old at worst.',
  '    send({ m: "draw", seq: seq, cmds: c.cmds(), w: w, h: h, sv: souvenirOf() });',
  '  }',
  '',
  '  self.onmessage = function (ev) {',
  '    var msg = ev.data || {};',
  '    if (msg.m === "init") { start(msg); return; }',
  '    if (over || !inst) return;',
  '    if (msg.m === "key") {',
  '      guard(function () {',
  '        if (inst.onKey) inst.onKey({ key: msg.key, shift: !!msg.shift, repeat: !!msg.repeat });',
  '      });',
  '      paint(msg.seq, msg.w, msg.h);',
  '      return;',
  '    }',
  '    if (msg.m === "tick") {',
  '      guard(function () { if (inst.tick) inst.tick(msg.dt); });',
  '      paint(msg.seq, msg.w, msg.h);',
  '    }',
  '  };',
  '',
  '  function start(msg) {',
  '    var strings = msg.strings || {};',
  '    var rng = makeRng(msg.seed);',
  '    function t(key, vars) {',
  '      var here = strings[msg.locale] || {};',
  '      var fallback = strings.en || {};',
  '      var s = here[key];',
  '      if (s === undefined) s = fallback[key];',
  '      if (s === undefined) s = key;',
  '      if (!vars) return s;',
  '      return s.replace(/\\{(\\w+)\\}/g, function (m, k) {',
  '        return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;',
  '      });',
  '    }',
  '    var ctx = {',
  '      t: t,',
  '      locale: msg.locale,',
  '      dir: msg.locale === "he" ? "rtl" : "ltr",',
  '      rng: rng,',
  '      input: String(msg.input || ""),',
  '      audio: {',
  '        note: function (hz, ms) { send({ m: "audio", kind: "note", hz: hz, ms: ms }); },',
  '        noise: function (ms) { send({ m: "audio", kind: "noise", ms: ms }); },',
  '        blip: function () { send({ m: "audio", kind: "blip" }); }',
  '      },',
  '      say: function (blocks) { send({ m: "say", blocks: blocks }); },',
  '      exit: function () { done(souvenirOf()); }',
  '    };',
  '',
  '    var kb = { game: function (f) { factory = f; } };',
  '',
  '    var ok = guard(function () {',
  '      var args = SHADOWED.slice();',
  '      args.push("kb");',
  '      args.push("\\"use strict\\";" + msg.code);',
  '      var build = Function.apply(null, args);',
  '      var fill = [];',
  '      for (var i = 0; i < SHADOWED.length; i++) fill.push(undefined);',
  '      fill.push(kb);',
  '      build.apply(undefined, fill);',
  '      return true;',
  '    });',
  '    if (!ok) return;',
  '    if (typeof factory !== "function") { done(""); return; }',
  '',
  '    inst = guard(function () { return factory(ctx); }) || null;',
  '    if (!inst || typeof inst.draw !== "function") { done(""); return; }',
  '    paint(msg.seq, msg.w, msg.h);',
  '  }',
  '',
  '  function souvenirOf() {',
  '    if (!inst || typeof inst.souvenir !== "function") return "";',
  '    try { var s = inst.souvenir(); return typeof s === "string" ? s : ""; } catch (e) { return ""; }',
  '  }',
  '})();',
].join('\n')

/**
 * The one static gate. `import` is syntax, so it cannot be shadowed away like
 * a global can; refusing the word outright is cheap and costs a cart nothing,
 * because a cart has nothing to import — it is handed everything it gets.
 */
export function looksImportable(code: string): boolean {
  return /\bimport\b|\brequire\s*\(/.test(code)
}
