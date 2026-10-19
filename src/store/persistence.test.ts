import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedData } from '../data/seed';
import type { AppState } from '../types';
import { APP_STATE_VERSION } from '../types';
import { loadState, sanitizeState, saveState, STORAGE_KEY } from './persistence';

function stubStorage(get: () => string | null, set?: (v: string) => void) {
  vi.stubGlobal('localStorage', {
    getItem: () => get(),
    setItem: (_k: string, v: string) => set?.(v),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('persistence — sanitizeState', () => {
  it('menerima clone seed apa adanya', () => {
    const hasil = sanitizeState(JSON.parse(JSON.stringify(seedData)));
    expect(hasil).not.toBeNull();
    expect(hasil?.anggota).toHaveLength(seedData.anggota.length);
    expect(hasil?.tugas).toHaveLength(seedData.tugas.length);
    expect(hasil?.version).toBe(APP_STATE_VERSION);
  });

  it('menolak struktur bukan objek / versi salah', () => {
    expect(sanitizeState(null)).toBe(null);
    expect(sanitizeState('string')).toBe(null);
    expect(sanitizeState([])).toBe(null);
    expect(sanitizeState({ ...seedData, version: 99 })).toBe(null);
    expect(sanitizeState({ version: APP_STATE_VERSION, anggota: 'rusak', kegiatan: [], tugas: [], dependensi: [], kalender: { workingDays: [1], holidays: [] } })).toBe(null);
  });

  it('membuang atribut asing (mis. salary) — hanya 5 field anggota yang disalin', () => {
    const raw = JSON.parse(JSON.stringify(seedData));
    raw.anggota[0].salary = 9999;
    raw.anggota[0].hobi = ['coding'];
    const hasil = sanitizeState(raw);
    expect(hasil?.anggota[0]).toEqual({
      id: 'a1',
      name: 'Rizky Ramadhan',
      email: 'rizky@kampus.ac.id',
      role: 'Ketua',
      division: 'Pengurus Inti',
    });
    expect('salary' in (hasil?.anggota[0] ?? {})).toBe(false);
  });

  it('memperbaiki referensi rusak: leadId menggantung, dependensi type aneh, libur salah format', () => {
    const raw = JSON.parse(JSON.stringify(seedData));
    raw.kegiatan[0].leadId = 'ghost';
    raw.dependensi.push({ id: 'dx', predecessorId: 't1', successorId: 't2', type: 'XX' });
    raw.dependensi.push({ id: 'dy', predecessorId: 't1', successorId: 't1', type: 'FS' });
    raw.kalender.holidays.push('bukan-tanggal');
    const hasil = sanitizeState(raw);
    // leadId menggantung → dialihkan ke anggota pertama (bukan dibuang)
    expect(hasil?.kegiatan[0].leadId).toBe(seedData.anggota[0].id);
    expect(hasil?.dependensi.some((d) => d.id === 'dx')).toBe(false);
    expect(hasil?.dependensi.some((d) => d.id === 'dy')).toBe(false);
    expect(hasil?.kalender.holidays.some((h) => h === 'bukan-tanggal')).toBe(false);
  });

  it('workingDays kosong → memakai default seed (penjadwalan tetap jalan)', () => {
    const raw = JSON.parse(JSON.stringify(seedData));
    raw.kalender.workingDays = [];
    const hasil = sanitizeState(raw);
    expect(hasil?.kalender.workingDays).toEqual(seedData.kalender.workingDays);
  });
});

describe('persistence — loadState', () => {
  it('belum pernah menyimpan → seed', () => {
    stubStorage(() => null);
    const s = loadState();
    expect(s.tugas).toHaveLength(seedData.tugas.length);
  });

  it('JSON rusak → seed, tidak crash', () => {
    stubStorage(() => '{rusak!');
    expect(() => loadState()).not.toThrow();
    expect(loadState().anggota).toHaveLength(seedData.anggota.length);
  });

  it('data valid → dimuat', () => {
    const custom = JSON.parse(JSON.stringify(seedData));
    custom.anggota[0].name = 'Dimuat Dari Storage';
    stubStorage(() => JSON.stringify(custom));
    expect(loadState().anggota[0].name).toBe('Dimuat Dari Storage');
  });

  it('storage diblokir (throw) → seed, tidak crash', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(() => loadState()).not.toThrow();
    expect(loadState().kegiatan).toHaveLength(seedData.kegiatan.length);
  });
});

describe('persistence — saveState', () => {
  it('menulis JSON valid ke storage', () => {
    const simpanan: string[] = [];
    stubStorage(
      () => null,
      (v) => {
        simpanan.push(v);
      },
    );
    const state: AppState = { ...JSON.parse(JSON.stringify(seedData)) };
    saveState(state);
    expect(simpanan).toHaveLength(1);
    const parsed = JSON.parse(simpanan[0]) as AppState;
    expect(parsed.version).toBe(APP_STATE_VERSION);
    expect(parsed.tugas).toHaveLength(state.tugas.length);
  });

  it('storage penuh/throw → tidak crash', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(() => saveState(JSON.parse(JSON.stringify(seedData)))).not.toThrow();
  });
});

describe('persistence — konstanta', () => {
  it('kunci storage stabil', () => {
    expect(STORAGE_KEY).toBe('orgaplan:state:v1');
  });
});
