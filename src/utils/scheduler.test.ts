import { describe, expect, it } from 'vitest';
import type { Dependensi, KalenderKerja, Tugas } from '../types';
import { seedData } from '../data/seed';
import { computeSchedule } from './scheduler';
import { isWorkingDay, shiftWorkingDays } from './workingCalendar';

const KAL: KalenderKerja = { workingDays: [1, 2, 3, 4, 5], holidays: [] };
const T = (id: string, dur: number, extra: Partial<Tugas> = {}): Tugas => ({
  id,
  activityId: 'k1',
  name: id,
  duration: dur,
  ...extra,
});
const DEP = (id: string, p: string, s: string, type: 'FS' | 'SS' = 'FS', lag = 0): Dependensi => ({
  id,
  predecessorId: p,
  successorId: s,
  type,
  lag,
});
const NOW = '2026-10-19'; // Senin

describe('scheduler — rantai FS', () => {
  const t = [T('a', 2, { startDate: '2026-10-19' }), T('b', 3), T('c', 2)];
  const d = [DEP('d1', 'a', 'b'), DEP('d2', 'b', 'c')];
  const r = computeSchedule(t, d, KAL, NOW);

  it('menjadwalkan sesuai hari kerja (Sabtu/Minggu dilewati)', () => {
    expect(r.ok).toBe(true);
    expect(r.tasks.get('a')?.startDate).toBe('2026-10-19'); // Sen
    expect(r.tasks.get('a')?.endDate).toBe('2026-10-20'); // Sel
    expect(r.tasks.get('b')?.startDate).toBe('2026-10-21'); // Rab
    expect(r.tasks.get('b')?.endDate).toBe('2026-10-23'); // Jum
    expect(r.tasks.get('c')?.startDate).toBe('2026-10-26'); // Sen berikut
    expect(r.tasks.get('c')?.endDate).toBe('2026-10-27');
  });

  it('menghitung proyek & jalur kritis (rantai penuh = kritikal)', () => {
    expect(r.projectStart).toBe('2026-10-19');
    expect(r.projectEnd).toBe('2026-10-27');
    expect(r.projectDuration).toBe(7); // 7 hari kerja inklusif
    for (const id of ['a', 'b', 'c']) {
      expect(r.tasks.get(id)?.slackDays).toBe(0);
      expect(r.tasks.get(id)?.isCritical).toBe(true);
    }
    expect(r.criticalIds).toEqual(['a', 'b', 'c']);
  });
});

describe('scheduler — SS + cap projectEnd', () => {
  it('LF pendahulu tidak melewati akhir proyek (slack benar)', () => {
    const t = [T('a', 4, { startDate: '2026-10-19' }), T('b', 2)];
    const d = [DEP('d1', 'a', 'b', 'SS')];
    const r = computeSchedule(t, d, KAL, NOW);
    const A = r.tasks.get('a');
    const B = r.tasks.get('b');
    expect(A?.endDate).toBe('2026-10-22'); // Kam
    expect(B?.startDate).toBe('2026-10-19'); // SS: mulai bersamaan
    expect(B?.endDate).toBe('2026-10-20');
    expect(r.projectEnd).toBe('2026-10-22');
    // Tanpa cap, LF_A jadi Sen depan & slack salah:
    expect(A?.lateFinish).toBe('2026-10-22');
    expect(A?.lateStart).toBe('2026-10-19');
    expect(A?.slackDays).toBe(0);
    expect(A?.isCritical).toBe(true);
    expect(B?.slackDays).toBe(2); // B bisa geser Sel,Rab
    expect(B?.isCritical).toBe(false);
    expect(r.criticalIds).toEqual(['a']);
  });
});

describe('scheduler — libur, lag, anomali', () => {
  it('melewati hari libur', () => {
    const t = [T('a', 2, { startDate: '2026-10-23' }), T('b', 1)];
    const d = [DEP('d1', 'a', 'b')];
    const kal: KalenderKerja = { workingDays: [1, 2, 3, 4, 5], holidays: ['2026-10-26'] };
    const r = computeSchedule(t, d, kal, NOW);
    expect(r.tasks.get('a')?.endDate).toBe('2026-10-27'); // Jum + Sel (Sen libur)
    expect(r.tasks.get('b')?.startDate).toBe('2026-10-28');
  });

  it('menerapkan lag FS (hari kerja)', () => {
    const t = [T('a', 1, { startDate: '2026-10-19' }), T('b', 1)];
    const d = [DEP('d1', 'a', 'b', 'FS', 2)];
    const r = computeSchedule(t, d, KAL, NOW);
    expect(r.tasks.get('b')?.startDate).toBe('2026-10-22'); // Sen + 3 hari kerja = Kam
  });

  it('siklus → ok:false tanpa crash', () => {
    const r = computeSchedule([T('a', 1), T('b', 1)], [DEP('d1', 'a', 'b'), DEP('d2', 'b', 'a')], KAL, NOW);
    expect(r.ok).toBe(false);
    expect(r.cyclicIds.length).toBeGreaterThan(0);
    expect(r.tasks.size).toBe(0);
  });

  it('data kosong, tanggal rusak, durasi cacat — semua aman', () => {
    const kosong = computeSchedule([], [], KAL, NOW);
    expect(kosong.ok).toBe(true);
    expect(kosong.projectStart).toBeUndefined();

    const tanpaManual = computeSchedule([T('a', 1)], [], KAL, '2026-10-20');
    expect(tanpaManual.projectStart).toBe('2026-10-20'); // anchor = hari ini

    const tanggalRusak = computeSchedule([T('a', 1, { startDate: '2026-02-30' })], [], KAL, '2026-10-21');
    expect(tanggalRusak.projectStart).toBe('2026-10-21'); // fallback

    const durasiCacat = computeSchedule([T('a', 0), T('b', -5)], [], KAL, '2026-10-19');
    expect(durasiCacat.tasks.get('a')?.startDate).toBe(durasiCacat.tasks.get('a')?.endDate);
    expect(durasiCacat.tasks.get('b')?.startDate).toBe(durasiCacat.tasks.get('b')?.endDate);
  });
});

describe('scheduler — integritas seed penuh', () => {
  const r = computeSchedule(seedData.tugas, seedData.dependensi, seedData.kalender, '2026-10-19');

  it('seluruh tugas terjadwal & bebas siklus', () => {
    expect(r.ok).toBe(true);
    expect(r.tasks.size).toBe(seedData.tugas.length);
  });

  it('semua tanggal hasil = hari kerja & konsisten', () => {
    for (const s of r.tasks.values()) {
      expect(isWorkingDay(s.startDate, seedData.kalender), `${s.id} start`).toBe(true);
      expect(isWorkingDay(s.endDate, seedData.kalender), `${s.id} end`).toBe(true);
      expect(s.startDate <= s.endDate).toBe(true);
      expect(s.lateStart <= s.lateFinish).toBe(true);
      expect(s.slackDays).toBeGreaterThanOrEqual(0);
    }
  });

  it('setiap edge dependensi terpenuhi (FS & SS, dengan lag)', () => {
    for (const dep of seedData.dependensi) {
      const p = r.tasks.get(dep.predecessorId);
      const s = r.tasks.get(dep.successorId);
      const lag = dep.lag ?? 0;
      const batas =
        dep.type === 'FS'
          ? shiftWorkingDays(p?.endDate ?? '1970-01-01', 1 + lag, seedData.kalender)
          : shiftWorkingDays(p?.startDate ?? '1970-01-01', lag, seedData.kalender);
      // Bandingkan leksikal — format ISO-8601 terurut kronologis
      const mulai = s?.startDate ?? '';
      expect(mulai >= batas, `edge ${dep.id} (${dep.type}): ${mulai} >= ${batas}`).toBe(true);
    }
  });

  it('menghasilkan jalur kritis (diketahui: t1,t2,t3,t5,t6,t7)', () => {
    expect(r.criticalIds).toEqual(['t1', 't2', 't3', 't5', 't6', 't7']);
    expect(r.projectStart).toBe('2026-10-19');
    expect(r.projectEnd).toBe('2026-11-18');
    expect(r.projectDuration).toBe(21);
  });
});
