/**
 * Uji E2E Gantt Chart lewat Chrome DevTools Protocol — tanpa dependensi npm tambahan.
 *
 * Prasyarat : `npm run dev` berjalan (atau set E2E_URL ke URL aplikasi lain).
 * Pelaksanaan: Chrome headless dengan profil sementara + port debug acak dijalankan
 *              dan dimatikan oleh skrip ini — TIDAK menyentuh Chrome harian Anda.
 *
 * Env opsional:
 *   E2E_URL      URL halaman yang diuji  (default http://localhost:5173/#gantt)
 *   CHROME_PATH  lokasi binary Chrome     (auto-detect bila kosong)
 *
 * Jalankan: npm run test:e2e   → exit 0 bila seluruh pemeriksaan lulus (16 saat ini).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP_URL = process.env.E2E_URL || 'http://localhost:5173/#gantt';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. prasyarat: dev server ────────────────────────────────────────────────
const origin = new URL(APP_URL).origin;
const up = await fetch(origin).then((r) => r.ok).catch(() => false);
if (!up) {
  console.error(`✗ Dev server tidak terjangkau di ${origin} — jalankan "npm run dev" di terminal lain dulu.`);
  process.exit(1);
}

// ── 2. temukan binary Chrome ────────────────────────────────────────────────
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];
const CHROME = CANDIDATES.find((p) => p && existsSync(p));
if (!CHROME) {
  console.error('✗ Chrome tidak ditemukan. Install Chrome atau set CHROME_PATH=/lokasi/chrome.');
  process.exit(1);
}

// ── 3. luncurkan Chrome headless terisolasi (port acak + profil sementara) ──
const port = 9400 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'orgaplan-e2e-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--disable-gpu',
    '--window-size=1440,900',
    'about:blank',
  ],
  { stdio: 'ignore', windowsHide: true, detached: process.platform !== 'win32' },
);

async function stopChrome() {
  try {
    if (process.platform === 'win32') {
      if (chrome.pid) spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { windowsHide: true });
    } else if (chrome.pid) {
      process.kill(-chrome.pid, 'SIGTERM');
    }
  } catch {
    /* sudah mati */
  }
  await sleep(400);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* biarkan bila masih terkunci */
  }
}

let cdpUp = null;
for (let i = 0; i < 50 && !cdpUp; i++) {
  await sleep(200);
  cdpUp = await fetch(`http://127.0.0.1:${port}/json/version`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}
if (!cdpUp) {
  await stopChrome();
  console.error('✗ Chrome gagal menyala (port debug tidak merespons dalam 10 dtk).');
  process.exit(1);
}
const targetList = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
const page = targetList.find((t) => t.type === 'page');
if (!page || !page.webSocketDebuggerUrl) {
  await stopChrome();
  console.error('✗ Target halaman tidak ditemukan di Chrome.');
  process.exit(1);
}

// ── 4. klien CDP (WebSocket bawaan Node ≥ 21) ──────────────────────────────
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
const jsErrors = [];
const LOAD = { res: null };
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) {
    const { res, rej } = pend.get(m.id);
    pend.delete(m.id);
    if (m.error) rej(new Error(m.error.message));
    else res(m.result);
  } else if (m.method === 'Page.loadEventFired' && LOAD.res) {
    const r = LOAD.res;
    LOAD.res = null;
    r();
  } else if (m.method === 'Runtime.exceptionThrown') {
    jsErrors.push(String(m.params.exceptionDetails?.exception?.description || 'exception'));
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    jsErrors.push((m.params.args || []).map((a) => a.value ?? a.description).join(' '));
  }
});
await new Promise((res, rej) => {
  ws.addEventListener('open', res);
  ws.addEventListener('error', rej);
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const i = ++id;
    pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
async function js(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('JS error: ' + String(r.exceptionDetails.exception?.description || expr).slice(0, 300));
  return r.result.value;
}
async function until(fn, ms = 8000, step = 120) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try {
      v = await fn();
    } catch {
      v = null;
    }
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(step);
  }
}
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: String(detail) });

// ── kalender & tanggal (replika logika aplikasi) ──
const dow = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
const addD = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diffD = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
const workOn = (iso, kal) => kal.workingDays.includes(dow(iso)) && !kal.holidays.includes(iso);
const toWorking = (iso, kal) => {
  let s = iso;
  for (let i = 0; i < 400; i++) {
    if (workOn(s, kal)) return s;
    s = addD(s, 1);
  }
  return iso;
};
const inclusive = (a, b, kal) => {
  if (b < a) return 0;
  let n = 0;
  let c = a;
  while (c <= b) {
    if (workOn(c, kal)) n++;
    c = addD(c, 1);
  }
  return n;
};
const readStorage = () => js('JSON.parse(localStorage.getItem("orgaplan:state:v1"))');
const BARBY = (name) => `[...document.querySelectorAll(".gantt-bar")].find(b=>b.title.split("\\n")[0]===${JSON.stringify(name)})`;
const titleOf = (name) => js(`(()=>{const el=${BARBY(name)};return el?el.title:null})()`);
const leftOf = (name) => js(`(()=>{const el=${BARBY(name)};return el?el.style.left:null})()`);
const T = (title) => {
  const m = /(\d{4}-\d{2}-\d{2}) → (\d{4}-\d{2}-\d{2}) \((\d+) hari kerja\)/.exec(title || '');
  return m ? { s: m[1], e: m[2], d: +m[3] } : null;
};
const minStart = (st) =>
  st.tugas
    .filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.startDate))
    .map((t) => t.startDate)
    .sort()[0];
const px = (v) => (v == null ? null : parseInt(String(v).replace('px', ''), 10));

async function drag(selExpr, dx) {
  await js(`(()=>{const el=${selExpr};if(el)el.scrollIntoView({block:"center",inline:"center"});return !!el})()`);
  await sleep(180);
  const r = JSON.parse(
    JSON.stringify(
      await js(`(()=>{const el=${selExpr};if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};})()`),
    ),
  );
  if (!r) throw new Error('elemen tidak ada saat drag');
  const vw = await js('window.innerWidth');
  const vh = await js('window.innerHeight');
  const x0 = Math.round(r.x + r.w / 2);
  const y0 = Math.round(r.y + r.h / 2);
  if (x0 < 1 || x0 > vw - 5 || y0 < 1 || y0 > vh - 5) throw new Error(`koordinat di luar viewport(${vw}x${vh}): ${x0},${y0}`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 4; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x0 + (dx * i) / 4), y: y0, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(25);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(x0 + dx), y: y0, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(280);
}
async function clickSel(cssSel) {
  const elExpr = `document.querySelector(${JSON.stringify(cssSel)})`;
  await js(`(()=>{const el=${elExpr};if(el)el.scrollIntoView({block:"center"});return !!el})()`);
  await sleep(120);
  const p = JSON.parse(
    JSON.stringify(
      await js(`(()=>{const el=${elExpr};if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`),
    ),
  );
  if (!p) throw new Error('tombol tidak ada: ' + cssSel);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(p.x), y: Math.round(p.y), button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(p.x), y: Math.round(p.y), button: 'left', buttons: 0, clickCount: 1 });
  await sleep(220);
}

// ── 5. jalankan pemeriksaan ─────────────────────────────────────────────────
try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: APP_URL });
  const okLoad = await until(async () => (await js('document.querySelectorAll(".gantt-bar").length')) > 0, 12000);
  if (!okLoad) throw new Error('Gantt tidak termuat: bars=0');

  let st = await readStorage();
  const kal = st.kalender;

  // [1-3] render
  const nBars = await js('document.querySelectorAll(".gantt-bar").length');
  check('[1] bar == jumlah tugas', nBars === st.tugas.length, `${nBars}/${st.tugas.length}`);
  const nGroups = await js('document.querySelectorAll(".gantt-row.group").length');
  check('[2] baris grup == jumlah kegiatan', nGroups === st.kegiatan.length, `${nGroups}/${st.kegiatan.length}`);
  const nPaths = await js('[...document.querySelectorAll(".gantt-svg path")].filter(p=>!p.closest("defs")).length');
  check('[3] panah dependensi SVG', nPaths === st.dependensi.length, `${nPaths}/${st.dependensi.length}`);

  // [4-5] zoom
  const firstBar = '[...document.querySelectorAll(".gantt-bar")][0]';
  const w0 = await js(`(${firstBar}).getBoundingClientRect().width`);
  await clickSel('[aria-label="Perbesar"]');
  const wIn = await until(async () => {
    const w = await js(`(${firstBar}).getBoundingClientRect().width`);
    return w > w0 ? w : null;
  }, 4000);
  check('[4] zoom in melebarkan bar', wIn !== null, `${Math.round(w0)}→${wIn ? Math.round(wIn) : '?'}`);
  await clickSel('[aria-label="Perkecil"]');
  const wBack = await until(async () => {
    const w = await js(`(${firstBar}).getBoundingClientRect().width`);
    return Math.abs(w - w0) < 0.5 ? w : null;
  }, 4000);
  check('[5] zoom out kembali', wBack !== null, `w=${wBack ? Math.round(wBack) : '?'}`);

  // [6-9] drag PINDAH bar (tugas akar — anchor manual)
  const succ = new Set(st.dependensi.map((d) => d.successorId));
  const root = st.tugas.find((t) => !succ.has(t.id));
  if (!root) throw new Error('tidak ada tugas akar');
  const t0 = T(await titleOf(root.name));
  if (!t0) throw new Error('judul bar tak terbaca: ' + root.name);
  const dur0 = root.duration;
  const left0 = px(await leftOf(root.name));
  const min0 = minStart(st);
  await drag(BARBY(root.name), 80); // +2 hari kalender (DAY_W=40)
  st = await readStorage();
  const rootAfter = st.tugas.find((t) => t.id === root.id);
  const expStart = toWorking(addD(t0.s, 2), kal);
  check('[6] drag pindah: startDate tersimpan == +2 hari (snap hari kerja)', rootAfter.startDate === expStart, `${t0.s}→${rootAfter.startDate} (harap ${expStart})`);
  check('[7] drag pindah: durasi tetap', rootAfter.duration === dur0, `${dur0}→${rootAfter.duration}`);
  const t1 = T(await titleOf(root.name));
  check('[8] judul bar menampilkan tanggal baru', t1 && t1.s === expStart, t1 ? t1.s : 'null');
  const min1 = minStart(st);
  const expLeft = Math.max(0, diffD(addD(min1, -1), expStart)) * 40 + 2;
  const left1 = px(await leftOf(root.name));
  check('[9] posisi visual bar == proyeksi (rangeStart dinamis)', left1 === expLeft, `left ${left0}→${left1} (harap ${expLeft}, minStart ${min0}→${min1})`);

  // [10-12] drag RESIZE grip kanan
  const target2 = st.tugas.find((t) => t.id !== root.id && !succ.has(t.id)) || st.tugas.find((t) => t.id !== root.id);
  const t2 = T(await titleOf(target2.name));
  if (!t2) throw new Error('judul bar tak terbaca: ' + target2.name);
  let delta = 1;
  while (delta <= 5 && !workOn(addD(t2.e, delta), kal)) delta++;
  const expDur = inclusive(t2.s, addD(t2.e, delta), kal);
  const start2 = target2.startDate;
  await drag(`(()=>{const b=${BARBY(target2.name)};return b?b.querySelector(".grip-r"):null})()`, delta * 40);
  st = await readStorage();
  const after2 = st.tugas.find((t) => t.id === target2.id);
  check('[10] resize kanan: durasi tersimpan == hari kerja inklusif', after2.duration === expDur, `${t2.d}→${after2.duration} (harap ${expDur}, delta=${delta}d)`);
  // Invarian: sisi kiri bar tidak boleh bergeser. Task bisa belum punya startDate
  // tersimpan (opsional) — commit resize menuliskan tanggal tampilan, tetap "tidak berubah".
  check('[11] resize kanan: tanggal mulai tampilan tidak berubah', after2.startDate === t2.s, `stored ${start2 ?? '(auto)'}→${after2.startDate} (tampilan ${t2.s})`);
  const t3 = T(await titleOf(target2.name));
  check('[12] judul bar mencerminkan durasi baru', t3 && t3.d === expDur, t3 ? `dur=${t3.d}` : 'null');

  // [13-15] persistensi reload — tunggu loadEventFired agar tidak membaca dokumen lama
  const loadP = new Promise((r) => {
    LOAD.res = r;
  });
  await send('Page.reload');
  await Promise.race([loadP, sleep(8000)]);
  await sleep(300);
  const okReload = await until(async () => (await js('document.querySelectorAll(".gantt-bar").length')) > 0, 12000);
  check('[13] reload: bar tetap termuat', !!okReload);
  const stR = await readStorage();
  const rootR = stR.tugas.find((t) => t.id === root.id);
  const t4 = await until(async () => {
    const t = T(await titleOf(root.name));
    return t || null;
  }, 6000);
  check(
    '[14] reload: perpindahan bertahan (storage + judul)',
    rootR && rootR.startDate === expStart && rootR.duration === dur0 && t4 && t4.s === expStart,
    `storage=${rootR ? rootR.startDate : '?'} judul=${t4 ? t4.s : 'null'}`,
  );
  const r2R = stR.tugas.find((t) => t.id === target2.id);
  check('[15] reload: resize bertahan', r2R.duration === expDur && r2R.startDate === t2.s, `dur=${r2R.duration} start=${r2R.startDate}`);

  // [16] tanpa error JS
  await sleep(400);
  check('[16] nol exception / console.error', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | ').slice(0, 200));
} catch (e) {
  results.push({ name: 'FATAL', ok: false, detail: String((e && e.message) || e) });
}

let pass = 0;
let fail = 0;
for (const r of results) {
  if (r.ok) pass++;
  else fail++;
  console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
}
console.log(`\nGANTT E2E: ${pass} lulus, ${fail} gagal`);

// ── 6. bersihkan Chrome uji ─────────────────────────────────────────────────
try {
  ws.close();
} catch {
  /* abaikan */
}
await stopChrome();
process.exit(fail === 0 ? 0 : 1);
