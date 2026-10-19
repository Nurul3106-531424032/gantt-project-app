import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  calendarDaysBetween,
  compareISO,
  dayIndexFrom,
  dayOfMonth,
  dayNameShort,
  dayOfWeek,
  formatISO,
  isValidISO,
  lteISO,
  monthName,
  parseISO,
  yearOf,
} from './dateUtils';

describe('dateUtils', () => {
  it('memvalidasi format DAN keabsahan tanggal', () => {
    expect(isValidISO('2026-10-19')).toBe(true);
    expect(isValidISO('2026-02-28')).toBe(true);
    expect(isValidISO('2026-02-30')).toBe(false); // tidak ada
    expect(isValidISO('2026-13-01')).toBe(false); // bulan 13
    expect(isValidISO('2026-1-1')).toBe(false); // format salah
    expect(isValidISO('19-10-2026')).toBe(false);
    expect(isValidISO('')).toBe(false);
    expect(isValidISO(20261019)).toBe(false);
    expect(isValidISO(null)).toBe(false);
  });

  it('parse/format aman zona waktu (UTC)', () => {
    expect(formatISO(parseISO('2026-01-01'))).toBe('2026-01-01');
    expect(formatISO(parseISO('2026-12-31'))).toBe('2026-12-31');
    expect(formatISO(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01-01');
  });

  it('menambah/mengurangi hari kalender melewati batas bulan & tahun', () => {
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29'); // tahun kabisat
    expect(addCalendarDays('2026-10-19', 0)).toBe('2026-10-19');
  });

  it('mengetahui hari dalam minggu (0=Minggu)', () => {
    expect(dayOfWeek('2026-10-18')).toBe(0); // Minggu
    expect(dayOfWeek('2026-10-19')).toBe(1); // Senin
    expect(dayOfWeek('2026-10-24')).toBe(6); // Sabtu
  });

  it('menghitung selisih hari kalender (bisa negatif)', () => {
    expect(calendarDaysBetween('2026-10-19', '2026-10-26')).toBe(7);
    expect(calendarDaysBetween('2026-10-26', '2026-10-19')).toBe(-7);
    expect(calendarDaysBetween('2026-10-19', '2026-10-19')).toBe(0);
    expect(calendarDaysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('membandingkan tanggal', () => {
    expect(compareISO('2026-10-19', '2026-10-20')).toBe(-1);
    expect(compareISO('2026-10-20', '2026-10-19')).toBe(1);
    expect(compareISO('2026-10-19', '2026-10-19')).toBe(0);
    expect(lteISO('2026-10-19', '2026-10-19')).toBe(true);
    expect(lteISO('2026-10-20', '2026-10-19')).toBe(false);
  });

  it('membantu format tampilan', () => {
    expect(dayNameShort('2026-10-19')).toBe('Sen');
    expect(dayNameShort('2026-10-18')).toBe('Min');
    expect(monthName('2026-10-19')).toBe('Oktober');
    expect(monthName('2027-01-01')).toBe('Januari');
    expect(yearOf('2027-01-01')).toBe(2027);
    expect(dayOfMonth('2026-10-19')).toBe(19);
  });

  it('menomori hari dari awal rentang', () => {
    expect(dayIndexFrom('2026-10-19', '2026-10-19')).toBe(0);
    expect(dayIndexFrom('2026-10-19', '2026-10-22')).toBe(3);
  });
});
