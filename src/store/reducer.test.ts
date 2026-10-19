import { describe, expect, it } from 'vitest';
import { seedData } from '../data/seed';
import type { AppState } from '../types';
import { APP_STATE_VERSION } from '../types';
import { appReducer, checkDependency, sanitizeKalender } from './reducer';

const clone = (): AppState => JSON.parse(JSON.stringify(seedData)) as AppState;

describe('reducer — dependensi', () => {
  it('ADD: valid tersimpan (lag > 0 dipertahankan, tipe tak dikenal → FS)', () => {
    let s = clone();
    s.tugas = [
      { id: 'x', activityId: 'k1', name: 'X', duration: 1 },
      { id: 'y', activityId: 'k1', name: 'Y', duration: 1 },
    ];
    s.dependensi = [];
    s = appReducer(s, { type: 'ADD_DEPENDENSI', payload: { predecessorId: 'x', successorId: 'y', type: 'FS', lag: 2 } });
    expect(s.dependensi).toHaveLength(1);
    expect(s.dependensi[0].type).toBe('FS');
    expect(s.dependensi[0].lag).toBe(2);
    expect(s.dependensi[0].id).toBeTruthy();

    let s2 = clone();
    s2.tugas = s.tugas;
    s2.dependensi = [];
    s2 = appReducer(s2, { type: 'ADD_DEPENDENSI', payload: { predecessorId: 'x', successorId: 'y', type: 'XX' as unknown as 'FS', lag: -3 } });
    expect(s2.dependensi[0].type).toBe('FS');
    expect(s2.dependensi[0].lag).toBeUndefined();

    let s3 = clone();
    s3.tugas = s.tugas;
    s3.dependensi = [];
    s3 = appReducer(s3, { type: 'ADD_DEPENDENSI', payload: { predecessorId: 'x', successorId: 'y', type: 'SS' } });
    expect(s3.dependensi[0].type).toBe('SS');
  });

  it('ADD: menolak id tak ada, self, duplikat, dan siklus', () => {
    let s = clone();
    const before = s.dependensi.length;
    s = appReducer(s, { type: 'ADD_DEPENDENSI', payload: { predecessorId: 't1', successorId: 'ghost', type: 'FS' } });
    s = appReducer(s, { type: 'ADD_DEPENDENSI', payload: { predecessorId: 't1', successorId: 't1', type: 'FS' } });
    s = appReducer(s, { type: 'ADD_DEPENDENSI', payload: { predecessorId: 't1', successorId: 't2', type: 'FS' } }); // d1 sudah ada
    expect(s.dependensi).toHaveLength(before);

    s.tugas = [
      { id: 'p', activityId: 'k1', name: 'P', duration: 1 },
      { id: 'q', activityId: 'k1', name: 'Q', duration: 1 },
    ];
    s.dependensi = [{ id: 'e1', predecessorId: 'p', successorId: 'q', type: 'FS' }];
    s = appReducer(s, { type: 'ADD_DEPENDENSI', payload: { predecessorId: 'q', successorId: 'p', type: 'FS' } });
    expect(s.dependensi).toHaveLength(1); // siklus ditolak
  });

  it('checkDependency memberi alasan (untuk UI)', () => {
    const s = clone();
    expect(checkDependency(s, { predecessorId: 't7', successorId: 't8' })).toBe(null); // lintas sub-graph
    expect(checkDependency(s, { predecessorId: 't1', successorId: 't1' })).toBe('self');
    expect(checkDependency(s, { predecessorId: 't1', successorId: 't2' })).toBe('duplicate');
    expect(checkDependency(s, { predecessorId: 't1', successorId: 't2' }, 'd1')).toBe(null); // exclude id sendiri
    expect(checkDependency(s, { predecessorId: 'ghost', successorId: 't2' })).toBe('predecessor-missing');
    // t7→t1 melengkapi siklus jalur seed t1→t2→t3→t5→t6→t7
    expect(checkDependency(s, { predecessorId: 't7', successorId: 't1' })).toBe('cycle');
  });

  it('UPDATE: mengubah tipe/lag; menolak siklus & duplikat edge lain; id tak ada = no-op', () => {
    let s = clone();
    s = appReducer(s, { type: 'UPDATE_DEPENDENSI', payload: { id: 'd1', predecessorId: 't1', successorId: 't2', type: 'SS', lag: 1 } });
    expect(s.dependensi.find((d) => d.id === 'd1')?.type).toBe('SS');
    expect(s.dependensi.find((d) => d.id === 'd1')?.lag).toBe(1);

    const snap = s;
    s = appReducer(s, { type: 'UPDATE_DEPENDENSI', payload: { id: 'd1', predecessorId: 't3', successorId: 't1', type: 'FS' } });
    expect(s).toBe(snap); // siklus → state identik

    s = appReducer(s, { type: 'UPDATE_DEPENDENSI', payload: { id: 'd1', predecessorId: 't2', successorId: 't3', type: 'FS' } }); // duplikat d2
    expect(s).toBe(snap);
    s = appReducer(s, { type: 'UPDATE_DEPENDENSI', payload: { id: 'nope', predecessorId: 't1', successorId: 't2', type: 'FS' } });
    expect(s).toBe(snap);
  });

  it('DELETE: menghapus edge; id tak ada = no-op', () => {
    let s = clone();
    const n = s.dependensi.length;
    s = appReducer(s, { type: 'DELETE_DEPENDENSI', payload: { id: 'd1' } });
    expect(s.dependensi).toHaveLength(n - 1);
    const snap = s;
    s = appReducer(s, { type: 'DELETE_DEPENDENSI', payload: { id: 'tidak-ada' } });
    expect(s).toBe(snap);
  });
});

describe('reducer — kalender', () => {
  it('UPDATE: dedup + sort + buang elemen di luar rentang/bukan integer', () => {
    let s = clone();
    s = appReducer(s, {
      type: 'UPDATE_KALENDER',
      payload: { workingDays: [5, 1, 1, 9, -2, 3.5, 2], holidays: ['2026-10-28', 'bukan-tanggal', '2026-10-28', '2026-1-1'] },
    });
    expect(s.kalender.workingDays).toEqual([1, 2, 5]);
    expect(s.kalender.holidays).toEqual(['2026-10-28']);
  });

  it('UPDATE: tanpa hari kerja = ditolak (state identik)', () => {
    const s = clone();
    const snap = s;
    expect(appReducer(s, { type: 'UPDATE_KALENDER', payload: { workingDays: [], holidays: [] } })).toBe(snap);
    expect(appReducer(s, { type: 'UPDATE_KALENDER', payload: { workingDays: [7, 8, -1], holidays: [] } })).toBe(snap);
  });

  it('sanitizeKalender: null bila rusak', () => {
    expect(sanitizeKalender(null as unknown as { workingDays: number[]; holidays: string[] })).toBe(null);
    expect(sanitizeKalender({ workingDays: [0], holidays: [] })?.workingDays).toEqual([0]);
  });
});

describe('reducer — impor & regresi', () => {
  it('IMPORT_STATE mengganti seluruh state + mengunci versi + tanpa aliasing', () => {
    const impor: AppState = {
      version: 99,
      anggota: [{ id: 'x1', name: 'Hasil Impor', email: 'i@k.ac.id', role: 'Ketua', division: 'Inti' }],
      kegiatan: [{ id: 'kx', name: 'K', leadId: 'x1', division: 'Inti' }],
      tugas: [{ id: 'tx', activityId: 'kx', name: 'T', duration: 2 }],
      dependensi: [],
      kalender: { workingDays: [1, 2, 3], holidays: [] },
    };
    const hasil = appReducer(clone(), { type: 'IMPORT_STATE', payload: impor });
    expect(hasil.anggota).toHaveLength(1);
    expect(hasil.anggota[0].name).toBe('Hasil Impor');
    expect(hasil.version).toBe(APP_STATE_VERSION); // versi dikunci
    expect(hasil.anggota).not.toBe(impor.anggota); // salinan, bukan alias
  });

  it('regresi: aksi CRUD lama tetap berfungsi (hapus berantai, reset seed)', () => {
    let s = clone();
    s = appReducer(s, { type: 'ADD_ANGGOTA', payload: { name: 'Budi', email: 'b@k.ac.id', role: 'Anggota', division: 'Acara' } });
    expect(s.anggota).toHaveLength(9);
    s = appReducer(s, { type: 'ADD_TUGAS', payload: { activityId: 'k1', name: 'Baru', duration: 2 } });
    expect(s.tugas).toHaveLength(15);
    const beforeDep = s.dependensi.length;
    s = appReducer(s, { type: 'DELETE_TUGAS', payload: { id: 't5' } });
    expect(s.tugas.some((t) => ['t5', 't5a', 't5b'].includes(t.id))).toBe(false);
    expect(s.dependensi.some((d) => ['t5', 't5a', 't5b'].includes(d.predecessorId) || ['t5', 't5a', 't5b'].includes(d.successorId))).toBe(false);
    expect(s.dependensi.length).toBeLessThan(beforeDep);
    s = appReducer(s, { type: 'RESET_TO_SEED' });
    expect(s.tugas).toHaveLength(14);
  });
});
