import type { Tugas } from '../types';

/**
 * Util estimasi PERT (Program Evaluation and Review Technique).
 *
 * Rumus per tugas (dalam hari kerja):
 * - Estimasi waktu (TE)  = (O + 4M + P) / 6
 * - Varians (σ²)         = ((P − O) / 6)²
 * - Standar deviasi (σ)  = (P − O) / 6
 *
 * di mana O = optimis, M = paling mungkin, P = pesimis.
 *
 * Untuk jalur/proyek: TE dijumlahkan; varians dijumlahkan (asumsi independen);
 * σ jalur = akar kuadrat jumlah varians.
 */

export interface PertEstimate {
  /** Expected time / estimasi waktu. */
  te: number;
  /** Varians. */
  variance: number;
  /** Standar deviasi. */
  stdDev: number;
}

/** Bulatkan ke 2 desimal untuk tampilan (perhitungan tetap presisi penuh). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Hitung estimasi PERT dari triplet {optimistic, mostLikely, pessimistic}.
 * Input tidak valid (bukan angka, negatif, atau O > P) → `null`.
 */
export function pertEstimate(triplet: {
  optimistic: number;
  mostLikely: number;
  pessimistic: number;
}): PertEstimate | null {
  const { optimistic: o, mostLikely: m, pessimistic: p } = triplet;
  if (!isFiniteNumber(o) || !isFiniteNumber(m) || !isFiniteNumber(p)) return null;
  if (o < 0 || m < 0 || p < 0) return null;
  if (o > p) return null; // optimis tidak boleh melebihi pesimis
  const te = (o + 4 * m + p) / 6;
  const stdDev = (p - o) / 6;
  return { te, variance: stdDev * stdDev, stdDev };
}

/**
 * Estimasi PERT sebuah tugas. Tugas tanpa `pert` atau triplet rusak → `null`
 * (UI menampilkan fallback ke `duration`).
 */
export function pertForTask(task: Pick<Tugas, 'pert'>): PertEstimate | null {
  if (!task.pert) return null;
  return pertEstimate(task.pert);
}

/**
 * Agregasi jalur/proyek: TE total, varians total, σ total.
 * Tugas tanpa estimasi PERT dihitung memakai `duration` sebagai triplet
 * pasti (O = M = P = duration → varians 0), sehingga semua tugas ikut
 * terakumulasi tanpa mencoret jalur.
 * Daftar kosong → null.
 */
export function pertForPath(tasks: Tugas[]): PertEstimate | null {
  if (tasks.length === 0) return null;
  let te = 0;
  let variance = 0;
  for (const t of tasks) {
    const est = pertForTask(t);
    if (est) {
      te += est.te;
      variance += est.variance;
    } else {
      const dur = isFiniteNumber(t.duration) ? Math.max(0, t.duration) : 0;
      te += dur; // durasi pasti, varians 0
    }
  }
  return { te, variance, stdDev: Math.sqrt(variance) };
}

/**
 * Probabilitas (kurva normal baku) bahwa jalur selesai ≤ waktu `t`
 * (dalam hari kerja): Z = (t − TE) / σ.
 * σ = 0 → pasti: prob = 1 bila t ≥ TE, else 0.
 * Memakai aproksimasi erf ( Abramowitz & Stegun 7.1.26 ) — cukup akurat ±1.5e-7.
 */
export function pathProbability(estimate: PertEstimate, t: number): number {
  if (!isFiniteNumber(t)) return 0;
  if (estimate.stdDev <= 0) return t >= estimate.te ? 1 : 0;
  const z = (t - estimate.te) / estimate.stdDev;
  return normalCdf(z);
}

/** CDF normal baku Φ(z) via aproksimasi erf. */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  // Aproksimasi erf Abramowitz & Stegun 7.1.26 (galat ≤ 1.5×10⁻⁷).
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  const phi = 0.5 * (1 + (z >= 0 ? erf : -erf));
  return Math.min(1, Math.max(0, phi));
}
