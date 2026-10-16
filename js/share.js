// Viral loop: before/after share card, challenge links, Wordle-style daily text.
import { save } from './save.js';
import { fmt, dayNumber } from './util.js';

export const GAME_URL = () => location.origin + location.pathname;

export function challengeUrl({ level, score, daily, seed }) {
  const q = new URLSearchParams(); if (daily) q.set('d', daily); else if (seed !== undefined) q.set('e', seed); else q.set('l', level); q.set('s', Math.round(score)); if (save.name) q.set('n', save.name.slice(0, 16));
  return GAME_URL() + '?' + q.toString();
}

export function readChallenge() {
  const q = new URLSearchParams(location.search); const s = parseInt(q.get('s')), l = parseInt(q.get('l')), d = parseInt(q.get('d'));
  if (!Number.isFinite(s) || s < 0 || s > 1e7) return null;
  const name = (q.get('n') || 'Kamarát').replace(/[<>&"\u0000-\u001f]/g, '').slice(0, 16) || 'Kamarát';
  const e = parseInt(q.get('e'));
  if (Number.isFinite(d) && d > 20260000 && d < 20990000) return { daily: d, score: s, name };
  if (Number.isFinite(e) && e >= 0 && e < 4294967296) return { endless: true, seed: e, score: s, name };
  if (Number.isFinite(l) && l >= 1 && l <= 999) return { level: l, score: s, name };
  return null;
}

// Grab the WebGL canvas right after a render (no preserveDrawingBuffer needed).
export function snapshot(glCanvas, w = 540) {
  const h = Math.round(w * glCanvas.height / glCanvas.width), c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(glCanvas, 0, 0, w, h); return c;
}

function rounded(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }
function cover(x, img, X, Y, W, H) { const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s; x.drawImage(img, X + (W - w) / 2, Y + (H - h) / 2, w, h); }

export function makeCard({ before, after, title, pct, stars, score, sub, animals = [], big, line }) {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a6d8c'); g.addColorStop(1, '#052238'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(255,255,255,${.04 + Math.random() * .08})`; x.beginPath(); x.arc(Math.random() * W, Math.random() * H, 4 + Math.random() * 14, 0, 7); x.fill(); }
  x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = '900 64px system-ui, sans-serif'; x.fillText('OCEAN RESTORER', W / 2, 110);
  x.font = '700 38px system-ui, sans-serif'; x.fillStyle = '#9ffcf0'; x.fillText(title, W / 2, 168);
  const iy = 210, ih = 640, iw = (W - 120) / 2;
  for (const [img, X, label] of [[before, 40, 'PRED'], [after, 80 + iw, 'PO']]) {
    x.save(); rounded(x, X, iy, iw, ih, 36); x.clip(); if (img) cover(x, img, X, iy, iw, ih); else { x.fillStyle = '#123'; x.fillRect(X, iy, iw, ih); }
    x.restore(); x.lineWidth = 6; x.strokeStyle = label === 'PO' ? '#9ffcf0' : 'rgba(255,255,255,.4)'; rounded(x, X, iy, iw, ih, 36); x.stroke();
    x.fillStyle = 'rgba(0,0,0,.55)'; rounded(x, X + 20, iy + 20, 120, 54, 27); x.fill(); x.fillStyle = '#fff'; x.font = '800 30px system-ui'; x.fillText(label, X + 80, iy + 58);
  }
  x.font = '900 150px system-ui, sans-serif'; x.fillStyle = '#ffe36e'; x.fillText(big || Math.round(pct * 100) + ' %', W / 2, 1010);
  x.font = '800 44px system-ui'; x.fillStyle = '#fff'; x.fillText(line || 'útesu obnovené  ' + '★'.repeat(stars) + '☆'.repeat(3 - stars), W / 2, 1075);
  x.font = '700 40px system-ui'; x.fillStyle = '#cfefff'; x.fillText((big ? '' : fmt(score) + ' bodov') + (animals.length ? (big ? '' : '  ·  ') + 'zachránené ' + animals.join(' ') : ''), W / 2, 1140);
  x.fillStyle = '#ffe36e'; rounded(x, 140, 1170, W - 280, 104, 52); x.fill(); x.fillStyle = '#062a3d'; x.font = '900 44px system-ui'; x.fillText(sub || 'Dokážeš to lepšie? 🌊', W / 2, 1237);
  x.font = '700 30px system-ui'; x.fillStyle = 'rgba(255,255,255,.75)'; x.fillText(GAME_URL().replace(/^https?:\/\//, '').replace(/\/$/, ''), W / 2, 1320);
  return c;
}

export async function shareResult({ card, text, url }) {
  const full = text + '\n' + url;
  try {
    if (card && navigator.canShare) {
      const blob = await new Promise(r => card.toBlob(r, 'image/jpeg', .88)); const file = new File([blob], 'ocean-restorer.jpg', { type: 'image/jpeg' });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: full }); return 'shared'; }
    }
    if (navigator.share) { await navigator.share({ text, url }); return 'shared'; }
  } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  try { await navigator.clipboard.writeText(full); } catch { }
  if (card) { const a = document.createElement('a'); a.href = card.toDataURL('image/jpeg', .9); a.download = 'ocean-restorer.jpg'; a.click(); }
  return 'copied';
}

export function resultText({ level, daily, pct, stars, score, emoji, animals = [], time, endless, area }) {
  if (endless) {
    const lines = [daily ? `🌊 Ocean Restorer · Denná výzva #${dayNumber()}` : '🌊 Ocean Restorer · Expedícia', `🏆 ${fmt(score)} bodov  🧽 ${fmt(area)} m² oceánu` + (animals.length ? `  ${animals.join('')}` : '') + (time ? `  ⏱ ${time}` : '')];
    if (emoji) lines.push(emoji);
    lines.push(daily ? 'Prekonáš ma v dnešnej výzve? 👇' : 'Prekonáš môj rekord? 👇'); return lines.join('\n');
  }
  const head = daily ? `🌊 Ocean Restorer · Denná výzva #${dayNumber()}` : `🌊 Ocean Restorer · Level ${level}`;
  const lines = [head, `${'⭐'.repeat(stars)}${'▫️'.repeat(3 - stars)} ${Math.round(pct * 100)} % útesu obnovené`, `🏆 ${fmt(score)} bodov` + (animals.length ? `  ${animals.join('')} zachránené` : '') + (time ? `  ⏱ ${time}` : '')];
  if (emoji) lines.push(emoji);
  lines.push(daily ? 'Prekonáš ma v dnešnej výzve? 👇' : 'Prekonáš ma? 👇');
  return lines.join('\n');
}
