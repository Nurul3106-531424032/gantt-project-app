import type { ISODate, KalenderKerja } from '../types';
import { addCalendarDays, calendarDaysBetween, dayOfWeek, lteISO } from './dateUtils';

/**
 * Util kalender hari kerja.
 *
 * Definisi:
 * - Hari kerja = hari yang ada di `kalender.workingDays` DAN bukan hari libur.
 * - Durasi tugas dihitung dalam HARI KERJA (dari mulai sampai selesai, inklusif).
 *
 * Semua fungsi punya guard iterasi maksimum agar kalender cacat
 * (mis. `workingDays` kosong) TIDAK pernah menyebabkan loop tak berujung.
 */

const MAX_ITER = 4000; // ~11 tahun kalender — pengaman loop

/** Apakah `date` termasuk hari libur? */
export function isHoliday(date: ISODate, kal: KalenderKerja): boolean {
  return kal.holidays.includes(date);
}

/** Apakah `date` hari kerja (hari efektif + bukan libur)? */
export function isWorkingDay(date: ISODate, kal: KalenderKerja): boolean {
  if (kal.workingDays.length === 0) return false;
  return kal.workingDays.includes(dayOfWeek(date)) && !isHoliday(date, kal);
}

/**
 * Selesaikan tanggal ke hari kerja BERIKUTNYA (inklusif: bila sudah hari kerja,
 * dikembalikan apa adanya). Kalender cacat → kembalikan `date` apa adanya.
 */
export function toWorkingDay(date: ISODate, kal: KalenderKerja): ISODate {
  let cur = date;
  for (let i = 0; i < MAX_ITER; i++) {
    if (isWorkingDay(cur, kal)) return cur;
    cur = addCalendarDays(cur, 1);
  }
  return date; // workingDays kosong / libur tak terbatas — jangan loop selamanya
}

/** Hari kerja terakhir ≤ date (bila date hari kerja → date sendiri). */
export function toPrevWorkingDay(date: ISODate, kal: KalenderKerja): ISODate {
  let cur = date;
  for (let i = 0; i < MAX_ITER; i++) {
    if (isWorkingDay(cur, kal)) return cur;
    cur = addCalendarDays(cur, -1);
  }
  return date;
}

/**
 * Geser `n` hari kerja dari `date`:
 * - n > 0 → maju n hari kerja,
 * - n < 0 → mundur |n| hari kerja,
 * - n = 0 → tetap di hari kerja terdekat ke depan.
 * Awal disejajarkan dulu ke hari kerja, sehingga hasil selalu hari kerja
 * (kecuali kalender tidak punya hari kerja sama sekali).
 */
export function shiftWorkingDays(date: ISODate, n: number, kal: KalenderKerja): ISODate {
  if (kal.workingDays.length === 0) return date;
  let cur = toWorkingDay(date, kal);
  const step = n >= 0 ? 1 : -1;
  let sisa = Math.abs(Math.trunc(n));
  let iter = 0;
  while (sisa > 0 && iter < MAX_ITER) {
    cur = addCalendarDays(cur, step);
    iter++;
    if (isWorkingDay(cur, kal)) sisa--;
  }
  return cur;
}

/**
 * Durasi tugas: jumlah hari kerja inklusif dari `start` sampai `ef`
 * (start-nya sendiri dihitung bila jatuh di hari kerja; bila bukan,
 * disejajarkan ke hari kerja berikutnya).
 */
export function durationToEndDate(start: ISODate, duration: number, kal: KalenderKerja): ISODate {
  const dur = Math.max(1, Math.round(duration));
  return shiftWorkingDays(start, dur - 1, kal);
}

/**
 * Jumlah hari kerja inklusif antara `start` dan `end` (dihitung dari `start`).
 * `end` < `start` menghasilkan 0. Dipakai untuk mengubah lebar bar → durasi.
 */
export function workingDaysInclusive(start: ISODate, end: ISODate, kal: KalenderKerja): number {
  if (!lteISO(start, end)) return 0;
  let count = 0;
  let cur = start;
  let iter = 0;
  while (lteISO(cur, end) && iter < MAX_ITER) {
    if (isWorkingDay(cur, kal)) count++;
    cur = addCalendarDays(cur, 1);
    iter++;
  }
  return count;
}

/**
 * Selisih hari kerja: berapa hari kerja dari `from` (inklusif) sampai `to`?
 * Terpakai untuk menghitung slack (LS − ES) — hasil bisa negatif bila `to` < `from`.
 */
export function workingDaysBetween(from: ISODate, to: ISODate, kal: KalenderKerja): number {
  if (from === to) return 0;
  if (from < to) {
    let count = 0;
    let cur = from;
    let iter = 0;
    while (cur < to && iter < MAX_ITER) {
      cur = addCalendarDays(cur, 1);
      if (isWorkingDay(cur, kal)) count++;
      iter++;
    }
    return count;
  }
  return -workingDaysBetween(to, from, kal);
}

/** Daftar semua hari pada rentang [start, end] (untuk header timeline). */
export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = start;
  let iter = 0;
  while (lteISO(cur, end) && iter < MAX_ITER) {
    out.push(cur);
    cur = addCalendarDays(cur, 1);
    iter++;
  }
  return out;
}

/** Hari kerja pertama pada/ setelah setiap tanggal, dalam rentang (untuk sumbu Gantt). */
export function countWorkingDaysUpTo(rangeStart: ISODate, date: ISODate, kal: KalenderKerja): number {
  return calendarDaysBetween(rangeStart, date) === 0 ? 0 : workingDaysBetween(rangeStart, date, kal);
}
