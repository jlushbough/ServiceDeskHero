/* ============================================================
   audio.js - Minimal strategy sim sound cues
   ============================================================ */

const AudioManager = (() => {
  let ctx = null;
  let enabled = true;
  let volume = 0.3;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function playTone(freq, duration, type = 'sine', gainValue = volume, detune = 0) {
    if (!enabled) return;
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    gain.gain.setValueAtTime(gainValue * 0.5, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + duration);
  }

  return {
    error() {
      playTone(200, 0.15, 'sawtooth', volume * 0.15);
      setTimeout(() => playTone(160, 0.12, 'sawtooth', volume * 0.12), 80);
    },

    confirm() {
      playTone(1500, 0.06, 'square', volume * 0.15);
      setTimeout(() => playTone(2000, 0.1, 'sine', volume * 0.2), 60);
    },

    hire() {
      playTone(659, 0.15, 'sine', volume * 0.2);
      setTimeout(() => playTone(784, 0.15, 'sine', volume * 0.2), 100);
      setTimeout(() => playTone(1047, 0.25, 'sine', volume * 0.25), 200);
    },

    advance() {
      [523, 659, 784, 1047].forEach((freq, i) => {
        setTimeout(() => playTone(freq, 0.2, 'sine', volume * 0.25), i * 80);
      });
    },

    promote() {
      [392, 494, 587, 659, 784, 988, 1175].forEach((freq, i) => {
        setTimeout(() => playTone(freq, 0.35, 'sine', volume * 0.3), i * 100);
      });
    },

    get enabled() { return enabled; },
    set enabled(v) { enabled = v; },
    get volume() { return volume; },
    set volume(v) { volume = Math.max(0, Math.min(1, v)); },
    toggle() { enabled = !enabled; return enabled; },
  };
})();

window.SFX = AudioManager;
