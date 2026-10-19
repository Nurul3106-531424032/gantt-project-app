import type { Dependensi, Tugas } from '../types';

/**
 * Util graf dependensi antar tugas (murni, tanpa React).
 *
 * Konsep:
 * - Dependensi FS/SS membentuk graf berarah: predecessor → successor.
 * - Graf wajib BEBAS SIKLUS agar penjadwalan (forward/backward pass) valid.
 * - Semua fungsi tahan data rusak: edge yang menunjuk id tidak ada diabaikan.
 */

/** Peta adjacency: id tugas → daftar id tugas penerima (successor). */
export type Adjacency = Map<string, string[]>;

/**
 * Bangun adjacency dari daftar tugas + dependensi.
 * Edge rusak (id tidak ada / self-loop) dibuang agar graf selalu valid.
 */
export function buildAdjacency(tugas: Tugas[], dependensi: Dependensi[]): Adjacency {
  const adj: Adjacency = new Map();
  const valid = new Set(tugas.map((t) => t.id));
  for (const t of tugas) adj.set(t.id, []);
  for (const d of dependensi) {
    if (!valid.has(d.predecessorId) || !valid.has(d.successorId)) continue;
    if (d.predecessorId === d.successorId) continue; // self-loop = rusak
    adj.get(d.predecessorId)?.push(d.successorId);
  }
  return adj;
}

/** Peta adjacency terbalik: id tugas → daftar pendahulunya (predecessor). */
export function buildReverseAdjacency(tugas: Tugas[], dependensi: Dependensi[]): Adjacency {
  const radj: Adjacency = new Map();
  const valid = new Set(tugas.map((t) => t.id));
  for (const t of tugas) radj.set(t.id, []);
  for (const d of dependensi) {
    if (!valid.has(d.predecessorId) || !valid.has(d.successorId)) continue;
    if (d.predecessorId === d.successorId) continue;
    radj.get(d.successorId)?.push(d.predecessorId);
  }
  return radj;
}

/**
 * Topological sort (Kahn). Mengembalikan urutan id tugas, atau `null`
 * bila graf mengandung siklus (dalam kasus itu, semua id yang terlibat
 * siklus tetap tersedia di `cyclicIds` untuk pesan error yang membantu).
 */
export function topoSort(
  tugas: Tugas[],
  dependensi: Dependensi[],
): { order: string[]; cyclicIds: string[] } {
  const adj = buildAdjacency(tugas, dependensi);
  const indeg = new Map<string, number>();
  for (const t of tugas) indeg.set(t.id, 0);
  for (const [, succ] of adj) {
    for (const s of succ) indeg.set(s, (indeg.get(s) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const t of tugas) if ((indeg.get(t.id) ?? 0) === 0) queue.push(t.id);

  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    order.push(id);
    for (const s of adj.get(id) ?? []) {
      const next = (indeg.get(s) ?? 0) - 1;
      indeg.set(s, next);
      if (next === 0) queue.push(s);
    }
  }

  if (order.length === tugas.length) return { order, cyclicIds: [] };
  // Sisa id yang belum keluar = bagian dari (atau bergantung pada) siklus.
  const placed = new Set(order);
  return { order, cyclicIds: tugas.map((t) => t.id).filter((id) => !placed.has(id)) };
}

/** Apakah graf dependensi bebas siklus? */
export function hasCycle(tugas: Tugas[], dependensi: Dependensi[]): boolean {
  return topoSort(tugas, dependensi).cyclicIds.length > 0;
}

/**
 * Apakah menambahkan edge `predecessorId → successorId` akan membentuk siklus?
 * Ya, jika di graf saat ini `successorId` sudah bisa mencapai `predecessorId`
 * (atau keduanya sama).
 */
export function wouldCreateDependencyCycle(
  tugas: Tugas[],
  dependensi: Dependensi[],
  predecessorId: string,
  successorId: string,
): boolean {
  if (predecessorId === successorId) return true;
  const adj = buildAdjacency(tugas, dependensi);
  // DFS dari successor: jika bisa sampai ke predecessor → siklus.
  const seen = new Set<string>();
  const stack: string[] = [successorId];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (cur === predecessorId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const s of adj.get(cur) ?? []) stack.push(s);
  }
  return false;
}

/** Alasan penolakan dependensi (null = valid). */
export type DependencyIssue =
  | 'predecessor-missing'
  | 'successor-missing'
  | 'self'
  | 'duplicate'
  | 'cycle';

/**
 * Validasi kandidat dependensi terhadap state saat ini.
 * Dipakai reducer (tolak data rusak sebelum masuk state) dan form UI.
 * `excludeId` = id dependensi yang dikecualikan dari cek duplikat (saat UPDATE).
 */
export function validateDependency(
  tugas: Tugas[],
  dependensi: Dependensi[],
  candidate: { predecessorId: string; successorId: string },
  excludeId?: string,
): DependencyIssue | null {
  const { predecessorId, successorId } = candidate;
  const ada = new Set(tugas.map((t) => t.id));
  if (!ada.has(predecessorId)) return 'predecessor-missing';
  if (!ada.has(successorId)) return 'successor-missing';
  if (predecessorId === successorId) return 'self';
  const duplikat = dependensi.some(
    (d) =>
      d.id !== excludeId &&
      d.predecessorId === predecessorId &&
      d.successorId === successorId,
  );
  if (duplikat) return 'duplicate';
  if (wouldCreateDependencyCycle(tugas, dependensi, predecessorId, successorId)) return 'cycle';
  return null;
}

/** Pesan error berbahasa Indonesia untuk tiap jenis penolakan. */
export function dependencyIssueMessage(issue: DependencyIssue): string {
  switch (issue) {
    case 'predecessor-missing':
      return 'Tugas pendahulu tidak ditemukan.';
    case 'successor-missing':
      return 'Tugas penerima tidak ditemukan.';
    case 'self':
      return 'Tugas tidak boleh bergantung pada dirinya sendiri.';
    case 'duplicate':
      return 'Dependensi antara kedua tugas tersebut sudah ada.';
    case 'cycle':
      return 'Dependensi ini akan membentuk siklus (saling ketergantungan).';
  }
}

/** Tugas yang menjadi akar proyek (tanpa pendahulu) — untuk filter visual. */
export function rootTaskIds(tugas: Tugas[], dependensi: Dependensi[]): string[] {
  const radj = buildReverseAdjacency(tugas, dependensi);
  return tugas.filter((t) => (radj.get(t.id) ?? []).length === 0).map((t) => t.id);
}
