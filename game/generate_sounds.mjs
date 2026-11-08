// Procedural CC0 sound generator — writes 8 WAV files for the game.
import { writeFileSync, mkdirSync } from 'fs';

const SR = 22050;
const OUT = 'C:/Users/ickmk/Frostborn/game/public/assets/audio';
mkdirSync(OUT, { recursive: true });

const PI2 = Math.PI * 2;

function wav(filename, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34); buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  writeFileSync(`${OUT}/${filename}`, buf);
  console.log(`  ${filename}  (${(n / SR).toFixed(2)}s)`);
}

function gen(dur, fn) {
  const n = Math.round(SR * dur);
  return Float32Array.from({ length: n }, (_, i) => fn(i / SR, i));
}

// axe_chop: sharp bandpass noise burst
wav('snd_axe_chop.wav', gen(0.28, t => {
  const n = Math.random() * 2 - 1;
  const env = t < 0.018 ? t / 0.018 : Math.exp(-(t - 0.018) * 20);
  return n * Math.cos(PI2 * 1300 * t) * env * 0.7;
}));

// log_drop: low thud
let lp0 = 0;
wav('snd_log_drop.wav', gen(0.42, t => {
  const n = Math.random() * 2 - 1;
  lp0 = lp0 * 0.72 + n * 0.28;
  const bass = Math.sin(PI2 * 72 * t) * Math.exp(-t * 7.5);
  return (bass * 0.65 + lp0 * Math.exp(-t * 24) * 0.4);
}));

// coin_pickup: ascending two-tone chime
wav('snd_coin_pickup.wav', gen(0.38, t => {
  const f = 540 + 1100 * Math.pow(t / 0.38, 0.5);
  const env = t < 0.018 ? t / 0.018 : Math.exp(-(t - 0.018) * 4.5);
  return (Math.sin(PI2 * f * t) * 0.6 + Math.sin(PI2 * f * 2 * t) * 0.15) * env;
}));

// fire_crackle_loop: filtered noise + pops (seamless 2s)
let lfp = 0;
wav('snd_fire_loop.wav', gen(2.0, t => {
  const n = Math.random() * 2 - 1;
  lfp = lfp * 0.93 + n * 0.07;
  const pop = Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.55 : 0;
  const loop = t < 0.08 ? t / 0.08 : t > 1.92 ? (2.0 - t) / 0.08 : 1.0;
  return (lfp * 0.38 + pop) * loop;
}));

// wind_loop: very smooth low noise (seamless 2.5s)
let wl1 = 0, wl2 = 0;
wav('snd_wind_loop.wav', gen(2.5, t => {
  const n = Math.random() * 2 - 1;
  wl1 = wl1 * 0.978 + n * 0.022;
  wl2 = wl2 * 0.995 + wl1 * 0.005;
  const loop = t < 0.15 ? t / 0.15 : t > 2.35 ? (2.5 - t) / 0.15 : 1.0;
  return wl2 * loop * 0.65;
}));

// ice_shatter: high-frequency noise crash
wav('snd_ice_shatter.wav', gen(0.48, t => {
  const n = Math.random() * 2 - 1;
  const hp = n * Math.cos(PI2 * 3800 * t);
  const env = t < 0.008 ? t / 0.008 : Math.exp(-(t - 0.008) * 11);
  return hp * env * 0.65;
}));

// build_complete: 3 ascending notes (C4 E4 G4)
const NOTES3 = [262, 330, 392];
wav('snd_build_complete.wav', gen(0.95, t => {
  const idx = Math.min(2, Math.floor(t / 0.3));
  const nt = t - idx * 0.3;
  const env = nt < 0.015 ? nt / 0.015 : Math.exp(-(nt - 0.015) * 3.5);
  return (Math.sin(PI2 * NOTES3[idx] * t) * 0.55 + Math.sin(PI2 * NOTES3[idx] * 2 * t) * 0.15) * env;
}));

// win_jingle: ascending pentatonic + flourish
const MELODY = [262, 330, 392, 440, 524, 440, 524, 659];
const BEAT = 0.22;
wav('snd_win_jingle.wav', gen(BEAT * MELODY.length + 0.3, t => {
  const idx = Math.min(MELODY.length - 1, Math.floor(t / BEAT));
  const nt = t - idx * BEAT;
  const env = nt < 0.014 ? nt / 0.014 : Math.exp(-(nt - 0.014) * 2.8);
  return (Math.sin(PI2 * MELODY[idx] * t) * 0.5 + Math.sin(PI2 * MELODY[idx] * 2 * t) * 0.12) * env * 0.42;
}));

console.log('Done!');
