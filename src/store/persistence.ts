import { seedData } from '../data/seed';
import type { Anggota, AppState, Dependensi, Kegiatan, Tugas } from '../types';
import { APP_STATE_VERSION } from '../types';

/** Kunci penyimpanan data aplikasi di localStorage. */
export const STORAGE_KEY = 'orgaplan:state:v1';

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

function cloneSeed(): AppState {
  return JSON.parse(JSON.stringify(seedData)) as AppState;
}

/**
 * Validasi + perbaikan data dari localStorage (juga dipakai untuk impor file).
 * - Struktur utama tidak valid        → kembalikan null (pemanggil memakai seed).
 * - Item rusak / referensi menggantung → buang atau perbaiki agar konsisten.
 * - Atribut tak dikenal (mis. salary)  → ikut terbuang, hanya 5 field anggota yang disalin.
 */
export function sanitizeState(raw: unknown): AppState | null {
  if (!isObj(raw)) return null;
  if (raw.version !== APP_STATE_VERSION) return null;
  if (!Array.isArray(raw.anggota) || !Array.isArray(raw.kegiatan) || !Array.isArray(raw.tugas) || !Array.isArray(raw.dependensi)) {
    return null;
  }
  if (!isObj(raw.kalender) || !Array.isArray(raw.kalender.workingDays) || !Array.isArray(raw.kalender.holidays)) {
    return null;
  }

  // ── Anggota: salin tepat 5 atribut resmi ──
  const anggota: Anggota[] = [];
  for (const item of raw.anggota) {
    if (!isObj(item) || !isStr(item.id) || !item.id || !isStr(item.name) || !isStr(item.email) || !isStr(item.role) || !isStr(item.division)) {
      continue;
    }
    anggota.push({ id: item.id, name: item.name, email: item.email, role: item.role, division: item.division });
  }

  // ── Kegiatan: leadId harus menunjuk anggota yang ada ──
  const firstAnggota = anggota[0]?.id ?? '';
  const kegiatan: Kegiatan[] = [];
  for (const item of raw.kegiatan) {
    if (!isObj(item) || !isStr(item.id) || !item.id || !isStr(item.name) || !item.name) continue;
    const rawLead = isStr(item.leadId) ? item.leadId : '';
    const leadId = rawLead && anggota.some((a) => a.id === rawLead) ? rawLead : firstAnggota;
    if (!leadId) continue; // tanpa anggota, kegiatan tidak bisa punya PJ valid → buang
    const k: Kegiatan = {
      id: item.id,
      name: item.name,
      leadId,
      division: isStr(item.division) ? item.division : '',
    };
    if (isStr(item.description)) k.description = item.description;
    if (isStr(item.color)) k.color = item.color;
    kegiatan.push(k);
  }
  const kegiatanIds = new Set(kegiatan.map((k) => k.id));

  // ── Tugas: wajib punya kegiatan valid; referensi lain diperbaiki ──
  const tugas: Tugas[] = [];
  for (const item of raw.tugas) {
    if (!isObj(item) || !isStr(item.id) || !item.id || !isStr(item.name) || !item.name) continue;
    if (!isStr(item.activityId) || !kegiatanIds.has(item.activityId)) continue;
    const durasi = typeof item.duration === 'number' && Number.isFinite(item.duration) ? Math.max(1, Math.round(item.duration)) : 1;
    const t: Tugas = {
      id: item.id,
      activityId: item.activityId,
      name: item.name,
      duration: durasi,
    };
    if (isStr(item.description)) t.description = item.description;
    if (isStr(item.assigneeId) && anggota.some((a) => a.id === item.assigneeId)) t.assigneeId = item.assigneeId;
    if (isStr(item.parentId) && item.parentId) t.parentId = item.parentId;
    if (isStr(item.startDate)) t.startDate = item.startDate;
    if (typeof item.progress === 'number' && Number.isFinite(item.progress)) t.progress = Math.min(100, Math.max(0, item.progress));
    if (isObj(item.pert)) {
      const { optimistic, mostLikely, pessimistic } = item.pert;
      if (typeof optimistic === 'number' && typeof mostLikely === 'number' && typeof pessimistic === 'number') {
        t.pert = { optimistic, mostLikely, pessimistic };
      }
    }
    tugas.push(t);
  }

  // ── parentId: harus ada, bukan diri sendiri, se-kegiatan ──
  const byId = new Map(tugas.map((t) => [t.id, t]));
  for (const t of tugas) {
    const parent = t.parentId ? byId.get(t.parentId) : undefined;
    if (t.parentId && (!parent || parent.id === t.id || parent.activityId !== t.activityId)) {
      delete t.parentId;
    }
  }
  // ── Putus siklus parent (Kahn: sisanya anggota siklus) ──
  let active = new Set(tugas.map((t) => t.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tugas) {
      if (!active.has(t.id)) continue;
      if (!t.parentId || !active.has(t.parentId)) {
        active.delete(t.id);
        changed = true;
      }
    }
  }
  for (const t of tugas) {
    if (active.has(t.id)) delete t.parentId;
  }

  // ── Dependensi: hanya antar tugas yang ada, tipe FS/SS, bukan diri sendiri ──
  const tugasIds = new Set(tugas.map((t) => t.id));
  const dependensi: Dependensi[] = [];
  for (const item of raw.dependensi) {
    if (!isObj(item) || !isStr(item.id) || !item.id || !isStr(item.predecessorId) || !isStr(item.successorId)) continue;
    if (item.predecessorId === item.successorId) continue;
    if (!tugasIds.has(item.predecessorId) || !tugasIds.has(item.successorId)) continue;
    if (item.type !== 'FS' && item.type !== 'SS') continue;
    const d: Dependensi = { id: item.id, predecessorId: item.predecessorId, successorId: item.successorId, type: item.type };
    if (typeof item.lag === 'number' && Number.isFinite(item.lag) && item.lag > 0) d.lag = item.lag;
    dependensi.push(d);
  }

  // ── Kalender: hari kerja 0–6 unik (kosong → pakai default seed) ──
  const hariKerja = [...new Set(raw.kalender.workingDays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
    (a, b) => a - b,
  );
  // Hanya tanggal ISO (YYYY-MM-DD) yang dipertahankan — string acak dibuang
  const libur = [...new Set(raw.kalender.holidays.filter((h): h is string => isStr(h) && /^\d{4}-\d{2}-\d{2}$/.test(h)))];
  const kalender = {
    workingDays: hariKerja.length > 0 ? hariKerja : [...seedData.kalender.workingDays],
    holidays: libur,
  };

  return { version: APP_STATE_VERSION, anggota, kegiatan, tugas, dependensi, kalender };
}

/**
 * Muat state dari localStorage.
 * Aman terhadap semua kondisi gagal: storage tidak tersedia, JSON rusak,
 * atau struktur tidak sesuai → selalu mengembalikan AppState valid (seed bila perlu).
 */
export function loadState(): AppState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage diblokir (mis. mode privat) → pakai seed.
    return cloneSeed();
  }
  if (raw === null) return cloneSeed(); // belum pernah menyimpan → seed
  try {
    const parsed: unknown = JSON.parse(raw);
    return sanitizeState(parsed) ?? cloneSeed();
  } catch {
    return cloneSeed(); // JSON rusak → seed, jangan crash
  }
}

/** Simpan state ke localStorage. Gagal (kuota penuh/diblokir) diabaikan agar aplikasi tetap jalan. */
export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Tidak fatal: data tetap hidup di memori selama tab terbuka.
  }
}
