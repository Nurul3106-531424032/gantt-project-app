import type { ISODate } from '../types';

/**
 * Util tanggal murni untuk OrgaPlan.
 *
 * Semua tanggal berformat 'YYYY-MM-DD' (ISO sederhana). Perhitungan memakai
 * Date.UTC sehingga bebas dari bug zona waktu (mis. '2026-01-01' yang bisa
 * bergeser 1 hari bila diparse sebagai tanggal lokal).
 */

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number): string => String(n).padStart(2, '0');

/** Parse 'YYYY-MM-DD' → Date (UTC). Asumsi input sudah lolos isValidISO. */
export function parseISO(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Date → 'YYYY-MM-DD'. */
export function formatISO(date: Date): ISODate {
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  return `${y}-${m}-${d}`;
}

/** Validasi format DAN keabsahan tanggal ('2026-02-30' dianggap tidak valid). */
export function isValidISO(v: unknown): v is ISODate {
  if (typeof v !== 'string' || !ISO_RE.test(v)) return false;
  const d = parseISO(v);
  if (Number.isNaN(d.getTime())) return false;
  return formatISO(d) === v;
}

/** Tambah/kurangi hari KALENDER. */
export function addCalendarDays(date: ISODate, days: number): ISODate {
  const d = parseISO(date);
  d.setUTCDate(d.getUTCDate() + days);
  return formatISO(d);
}

/** Hari dalam minggu: 0 = Minggu, 1 = Senin, ..., 6 = Sabtu. */
export function dayOfWeek(date: ISODate): number {
  return parseISO(date).getUTCDay();
}

/**
 * Selisih hari KALENDER dari `a` ke `b` (b − a). Bisa negatif.
 * Pembulatan ke integer terdekat untuk tahan pembagian milidetik.
 */
export function calendarDaysBetween(a: ISODate, b: ISODate): number {
  const ms = parseISO(b).getTime() - parseISO(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** Pengurutan: a < b → -1, sama → 0, a > b → 1 (leksikografis = kronologis). */
export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `true` bila a ≤ b. */
export function lteISO(a: ISODate, b: ISODate): boolean {
  return a <= b;
}

/** Tanggal hari ini (waktu lokal komputer pengguna). */
export function todayISO(): ISODate {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Nama hari pendek (Sen, Sel, ...) dari ISODate. */
const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export function dayNameShort(date: ISODate): string {
  return HARI_PENDEK[dayOfWeek(date)] ?? '';
}

/** Nama bulan panjang (Januari, ...) dari 'YYYY-MM-DD'. */
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export function monthName(iso: ISODate): string {
  return BULAN[parseISO(iso).getUTCMonth()] ?? '';
}

/** Tahun dari ISODate. */
export function yearOf(iso: ISODate): number {
  return parseISO(iso).getUTCFullYear();
}

/** Tanggal dalam bulan (1–31) dari ISODate. */
export function dayOfMonth(iso: ISODate): number {
  return parseISO(iso).getUTCDate();
}

/** Penomoran antar tanggal: index `date` dari `rangeStart` (0 bila sama). */
export function dayIndexFrom(rangeStart: ISODate, date: ISODate): number {
  return calendarDaysBetween(rangeStart, date);
}
