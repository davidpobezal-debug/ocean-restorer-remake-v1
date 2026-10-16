// Persistent progress. Every read/write is guarded: private mode must still play.
import { todayKey } from './util.js';

const KEY = 'ocean-restorer-remake-classic';

export const UPGRADES = [
  { id: 'range', icon: '◎', name: 'Široká hubica', desc: 'Väčší dosah čistenia', base: 60, max: 10 },
  { id: 'power', icon: 'ϟ', name: 'Sací výkon', desc: 'Rýchlejšie zmýva olej', base: 70, max: 10 },
  { id: 'speed', icon: '➜', name: 'Turbo plutvy', desc: 'Rýchlejšie plávanie', base: 55, max: 10 },
  { id: 'o2', icon: '◌', name: 'Väčšia fľaša', desc: '+6 s kyslíka', base: 65, max: 10 },
  { id: 'pulse', icon: '✹', name: 'Sonar pulz', desc: 'Silnejší a častejší pulz', base: 80, max: 8 },
  { id: 'magnet', icon: '⧉', name: 'Magnet', desc: 'Priťahuje odpad a mince z diaľky', base: 90, max: 6 },
];

export const SUITS = [
  { id: 'classic', name: 'Klasik', color: 0xffb02e, accent: 0x14707e, req: { stars: 0 } },
  { id: 'coral', name: 'Korál', color: 0xff5f8f, accent: 0x7a2e8c, req: { stars: 12 } },
  { id: 'mint', name: 'Mäta', color: 0x3ee6b0, accent: 0x0b5560, req: { stars: 24 } },
  { id: 'night', name: 'Hlbina', color: 0x3a4bff, accent: 0x9be7ff, req: { stars: 40 }, glow: true },
  { id: 'gold', name: 'Zlatý', color: 0xffd447, accent: 0x7a4a00, req: { pearls: 25 }, glow: true },
  { id: 'rainbow', name: 'Dúha', color: 0xffffff, accent: 0x222244, req: { stars: 75 }, rainbow: true },
];

export const ANIMALS = [
  { id: 'turtle', name: 'Korytnačka Tobi', emoji: '🐢', clean: 1.0 },
  { id: 'seal', name: 'Tuleň Bubo', emoji: '🦭', clean: 1.15 },
  { id: 'octopus', name: 'Chobotnica Ola', emoji: '🐙', clean: 1.3 },
  { id: 'dolphin', name: 'Delfín Delfi', emoji: '🐬', clean: 1.5 },
  { id: 'whale', name: 'Veľrybka Mája', emoji: '🐋', clean: 1.8 },
];

const fresh = () => ({
  v: 1, level: 1, stars: {}, best: {}, coins: 0, pearls: 0,
  up: Object.fromEntries(UPGRADES.map(u => [u.id, 0])),
  animals: {}, buddy: null, suit: 'classic',
  daily: { day: 0, best: 0, pct: 0, played: 0 },
  streak: { last: 0, count: 0, claimed: 0 },
  totals: { cleaned: 0, trash: 0, animals: 0, sharks: 0, dives: 0, playSec: 0 },
  shareDay: 0, name: '', sound: true, music: true, haptics: true, tutorial: false, installHint: 0,
});

function load() {
  try { const raw = JSON.parse(localStorage.getItem(KEY)); if (raw && raw.v === 1) { const f = fresh(); return { ...f, ...raw, up: { ...f.up, ...raw.up }, totals: { ...f.totals, ...raw.totals }, daily: { ...f.daily, ...raw.daily }, streak: { ...f.streak, ...raw.streak } }; } } catch { }
  return fresh();
}

export const save = load();

export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { } }

export const totalStars = () => Object.values(save.stars).reduce((a, b) => a + b, 0);
export const upCost = id => { const u = UPGRADES.find(x => x.id === id); return Math.round(u.base * Math.pow(1.6, save.up[id])); };
export const suitUnlocked = s => (s.req.stars ? totalStars() >= s.req.stars : true) && (s.req.pearls ? save.pearls >= s.req.pearls || save.suitsOwned?.includes(s.id) : true);

// Daily streak: returns bonus coins for today's first dive (0 if already claimed).
export function touchStreak() {
  const today = todayKey();
  if (save.streak.last === today) return 0;
  const y = new Date(); y.setDate(y.getDate() - 1);
  save.streak.count = save.streak.last === todayKey(y) ? save.streak.count + 1 : 1;
  save.streak.last = today; persist();
  return Math.min(7, save.streak.count) * 25;
}
