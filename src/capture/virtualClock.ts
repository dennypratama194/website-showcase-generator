/**
 * Injected before any page script runs. Replaces the page's notion of time so every captured
 * frame advances exactly `dt` ms, however long the frame took to render (software WebGL can
 * take seconds per frame; the result still plays back as perfect 60fps).
 *
 * Virtualised: performance.now, Date.now, requestAnimationFrame, setTimeout/setInterval,
 * and every CSS animation / CSS transition / WAAPI animation (paused and seeked per frame,
 * honouring CSS animation-play-state so the site's own gating logic still works).
 *
 * Nothing on the site is modified; only the clock the site reads is replaced.
 */
/** tsx/esbuild wraps named functions in __name(); page.evaluate bodies need it defined. */
export const NAME_SHIM = 'window.__name = window.__name || ((f) => f);';

export const VIRTUAL_CLOCK_SCRIPT = String.raw`(() => {
  if (window.__vt) return;
  const realPerfNow = performance.now.bind(performance);
  const RealDate = Date;
  const perf0 = realPerfNow();
  const date0 = RealDate.now();
  let vt = 0; // virtual ms since page start
  const now = () => perf0 + vt;

  performance.now = now;
  const VDate = function (...a) {
    if (!(this instanceof VDate)) return new RealDate(date0 + vt).toString();
    return a.length ? new RealDate(...a) : new RealDate(date0 + vt);
  };
  VDate.prototype = RealDate.prototype;
  VDate.now = () => date0 + vt;
  VDate.parse = RealDate.parse;
  VDate.UTC = RealDate.UTC;
  window.Date = VDate;

  // requestAnimationFrame
  let rafId = 0;
  let rafQ = new Map();
  window.requestAnimationFrame = (cb) => { const id = ++rafId; rafQ.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => { rafQ.delete(id); };

  // timers
  let tId = 0;
  const timers = new Map();
  const addT = (cb, ms, args, repeat) => {
    const id = ++tId;
    const d = Math.max(0, +ms || 0);
    timers.set(id, { cb, at: vt + d, d, args, repeat });
    return id;
  };
  window.setTimeout = (cb, ms, ...args) => addT(cb, ms, args, false);
  window.setInterval = (cb, ms, ...args) => addT(cb, ms, args, true);
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };

  const runTimers = () => {
    for (let guard = 0; guard < 10000; guard++) {
      let next = null;
      for (const [id, t] of timers) if (t.at <= vt && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) return;
      const [id, t] = next;
      if (t.repeat) t.at += Math.max(1, t.d); else timers.delete(id);
      try { typeof t.cb === 'function' ? t.cb(...(t.args || [])) : (0, eval)(String(t.cb)); } catch (e) { console.error('[vt timer]', e); }
    }
  };

  // CSS / WAAPI animations: paused and driven by hand
  const tracked = new WeakSet();
  const cssPaused = (a) => {
    if (!(window.CSSAnimation && a instanceof CSSAnimation)) return false;
    const el = a.effect && a.effect.target;
    if (!el) return false;
    const cs = getComputedStyle(el, a.effect.pseudoElement || null);
    const names = cs.animationName.split(',').map((s) => s.trim());
    const states = cs.animationPlayState.split(',').map((s) => s.trim());
    const i = names.indexOf(a.animationName);
    if (i < 0) return false;
    return states[i % states.length] === 'paused';
  };
  const driveAnimations = (dt) => {
    for (const a of document.getAnimations()) {
      if (!tracked.has(a)) {
        tracked.add(a);
        const ct = a.currentTime || 0;
        a.pause();
        a.currentTime = ct;
        continue; // starts this frame
      }
      if (cssPaused(a)) continue;
      a.currentTime = (a.currentTime || 0) + dt * (a.playbackRate || 1);
    }
  };

  let frames = 0;
  window.__vt = {
    get time() { return vt; },
    get frames() { return frames; },
    /** Advance one frame of dt ms: timers, then rAF callbacks, then animations. */
    step(dt) {
      vt += dt;
      frames++;
      runTimers();
      const q = rafQ; rafQ = new Map();
      const ts = now();
      for (const cb of q.values()) { try { cb(ts); } catch (e) { console.error('[vt raf]', e); } }
      driveAnimations(dt);
      // a second pass catches animations/transitions created by this frame's callbacks
      driveAnimations(0);
      return vt;
    },
    /** Freeze anything already running before the first step. */
    freeze() { driveAnimations(0); },
  };
})();`;
