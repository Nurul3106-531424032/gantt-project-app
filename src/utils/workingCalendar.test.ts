import { describe, expect, it } from 'vitest';
import type { KalenderKerja } from '../types';
import {
  durationToEndDate,
  eachDay,
  isHoliday,
  isWorkingDay,
  shiftWorkingDays,
  toPrevWorkingDay,
  toWorkingDay,
  workingDaysBetween,
  workingDaysInclusive,
} from './workingCalendar';

const KAL: KalenderKerja = { workingDays: [1, 2, 3, 4, 5], holidays: [] };
const KAL_LIBUR: KalenderKerja = { workingDays: [1, 2, 3, 4, 5], holidays: ['2026-10-28'] };
const KAL_KOSONG: KalenderKerja = { workingDays: [], holidays: [] };

// 2026-10-19 = Senin, 23 = Jumat, 24 = Sabtu, 25 = Minggu, 26 = Senin, 28 = Rabu
describe('workingCalendar', () => {
  it('menentukan hari kerja, akhir pekan, dan libur', () => {
    expect(isWorkingDay('2026-10-19', KAL)).toBe(true);
    expect(isWorkingDay('2026-10-24', KAL)).toBe(false); // Sabtu
    expect(isWorkingDay('2026-10-25', KAL)).toBe(false); // Minggu
    expect(isWorkingDay('2026-10-28', KAL_LIBUR)).toBe(false); // libur
    expect(isHoliday('2026-10-28', KAL_LIBUR)).toBe(true);
    expect(isWorkingDay('2026-10-19', KAL_KOSONG)).toBe(false); // tanpa hari kerja
  });

  it('menyejajarkan ke hari kerja terdekat (tanpa loop tak berujung)', () => {
    expect(toWorkingDay('2026-10-24', KAL)).toBe('2026-10-26'); // Sabtu → Senin
    expect(toWorkingDay('2026-10-19', KAL)).toBe('2026-10-19'); // sudah hari kerja
    expect(toWorkingDay('2026-10-24', KAL_KOSONG)).toBe('2026-10-24'); // kalender kosong → apa adanya
    expect(toPrevWorkingDay('2026-10-25', KAL)).toBe('2026-10-23'); // Minggu → Jumat
  });

  it('menggeser n hari kerja maju/mundur', () => {
    expect(shiftWorkingDays('2026-10-19', 0, KAL)).toBe('2026-10-19');
    expect(shiftWorkingDays('2026-10-19', 4, KAL)).toBe('2026-10-23'); // Sen→Jum
    expect(shiftWorkingDays('2026-10-19', 5, KAL)).toBe('2026-10-26'); // lompat akhir pekan
    expect(shiftWorkingDays('2026-10-23', -4, KAL)).toBe('2026-10-19');
    expect(shiftWorkingDays('2026-10-23', 1, KAL_LIBUR)).toBe('2026-10-26'); // Jum → Senin
    expect(shiftWorkingDays('2026-10-27', 2, KAL_LIBUR)).toBe('2026-10-30'); // Sel → Jum, lompat libur Rab 28
    expect(shiftWorkingDays('2026-10-19', 3, KAL_KOSONG)).toBe('2026-10-19'); // aman
  });

  it('menghitung durasi → tanggal selesai (inklusif)', () => {
    expect(durationToEndDate('2026-10-19', 4, KAL)).toBe('2026-10-22'); // Sen,Sen+3
    expect(durationToEndDate('2026-10-19', 1, KAL)).toBe('2026-10-19');
    expect(durationToEndDate('2026-10-23', 2, KAL_LIBUR)).toBe('2026-10-26'); // Jum + 1 hari kerja = Senin
    expect(durationToEndDate('2026-10-27', 3, KAL_LIBUR)).toBe('2026-10-30'); // Sel, [Rab libur], Kam, Jum
    expect(durationToEndDate('2026-10-19', 0, KAL)).toBe('2026-10-19'); // durasi cacat → minimal 1
  });

  it('menghitung hari kerja inklusif & selisih (bisa negatif)', () => {
    expect(workingDaysInclusive('2026-10-19', '2026-10-23', KAL)).toBe(5);
    expect(workingDaysInclusive('2026-10-19', '2026-10-25', KAL)).toBe(5); // akhir pekan tak dihitung
    expect(workingDaysInclusive('2026-10-19', '2026-10-19', KAL)).toBe(1);
    expect(workingDaysInclusive('2026-10-23', '2026-10-19', KAL)).toBe(0); // terbalik
    expect(workingDaysBetween('2026-10-19', '2026-10-19', KAL)).toBe(0);
    expect(workingDaysBetween('2026-10-19', '2026-10-20', KAL)).toBe(1);
    expect(workingDaysBetween('2026-10-20', '2026-10-19', KAL)).toBe(-1);
    expect(workingDaysBetween('2026-10-19', '2026-10-26', KAL)).toBe(5); // Sen→Sen: Sel..Sen
  });

  it('membuat daftar hari pada rentang', () => {
    const days = eachDay('2026-10-19', '2026-10-21');
    expect(days).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
    expect(eachDay('2026-10-19', '2026-10-19')).toEqual(['2026-10-19']);
  });
});
