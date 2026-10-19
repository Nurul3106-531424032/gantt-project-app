import { describe, expect, it } from 'vitest';
import type { Tugas } from '../types';
import { normalCdf, pathProbability, pertEstimate, pertForPath, pertForTask, round2 } from './pert';

describe('pert — rumus dasar', () => {
  it('TE = (O + 4M + P)/6, σ = (P − O)/6, varian = σ²', () => {
    const e = pertEstimate({ optimistic: 1, mostLikely: 2, pessimistic: 4 });
    expect(e).not.toBeNull();
    expect(e?.te).toBeCloseTo(13 / 6, 12);
    expect(e?.stdDev).toBeCloseTo(0.5, 12);
    expect(e?.variance).toBeCloseTo(0.25, 12);
  });

  it('triplet pasti O=M=P → TE = angka itu, varian 0', () => {
    const e = pertEstimate({ optimistic: 3, mostLikely: 3, pessimistic: 3 });
    expect(e?.te).toBe(3);
    expect(e?.variance).toBe(0);
  });

  it('menolak input rusak', () => {
    expect(pertEstimate({ optimistic: 5, mostLikely: 3, pessimistic: 1 })).toBe(null); // O > P
    expect(pertEstimate({ optimistic: -1, mostLikely: 2, pessimistic: 4 })).toBe(null); // negatif
    expect(pertEstimate({ optimistic: NaN, mostLikely: 2, pessimistic: 4 })).toBe(null);
    expect(pertEstimate({ optimistic: 'a' as unknown as number, mostLikely: 2, pessimistic: 4 })).toBe(null);
  });

  it('pertForTask mengembalikan null tanpa estimasi', () => {
    expect(pertForTask({})).toBe(null);
    const t: Pick<Tugas, 'pert'> = { pert: { optimistic: 2, mostLikely: 3, pessimistic: 5 } };
    expect(pertForTask(t)?.te).toBeCloseTo(19 / 6, 12);
  });
});

describe('pert — agregasi jalur', () => {
  it('menjumlah TE & varian; tugas tanpa PERT memakai durasi (varian 0)', () => {
    const tasks = [
      { pert: { optimistic: 1, mostLikely: 2, pessimistic: 4 } }, // TE 13/6, var 0.25
      { duration: 5 }, // TE 5, var 0
      { pert: { optimistic: 2, mostLikely: 2, pessimistic: 8 } }, // TE 3, var 1
    ] as Tugas[];
    const p = pertForPath(tasks);
    expect(p?.te).toBeCloseTo(13 / 6 + 5 + 3, 12);
    expect(p?.variance).toBeCloseTo(1.25, 12);
    expect(p?.stdDev).toBeCloseTo(Math.sqrt(1.25), 12);
  });

  it('jalur kosong → null; durasi cacat dianggap 0', () => {
    expect(pertForPath([])).toBe(null);
    const p = pertForPath([{ duration: NaN }, { duration: -2 }] as Tugas[]);
    expect(p?.te).toBe(0);
  });
});

describe('pert — probabilitas (distribusi normal baku)', () => {
  const est = { te: 10, variance: 4, stdDev: 2 };

  it('P(t = TE) ≈ 0.5; P(TE ± σ) ≈ 0.8413 / 0.1587', () => {
    expect(pathProbability(est, 10)).toBeCloseTo(0.5, 6);
    expect(pathProbability(est, 12)).toBeCloseTo(0.8413447, 5);
    expect(pathProbability(est, 8)).toBeCloseTo(0.1586553, 5);
  });

  it('σ = 0 → pasti; input aneh aman', () => {
    expect(pathProbability({ te: 10, variance: 0, stdDev: 0 }, 10)).toBe(1);
    expect(pathProbability({ te: 10, variance: 0, stdDev: 0 }, 9)).toBe(0);
    expect(pathProbability(est, NaN)).toBe(0);
  });

  it('normalCdf akurat di titik kunci & terbatas [0,1]', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(3)).toBeGreaterThan(0.9986);
    expect(normalCdf(3)).toBeLessThan(0.9987);
    expect(normalCdf(-3)).toBeLessThan(0.0014);
    expect(normalCdf(-3)).toBeGreaterThan(0.0013);
    expect(normalCdf(-10)).toBeGreaterThanOrEqual(0);
    expect(normalCdf(10)).toBeLessThanOrEqual(1);
  });

  it('pembulatan 2 desimal', () => {
    expect(round2(2.166666)).toBe(2.17);
    expect(round2(0.005)).toBe(0.01);
  });
});
