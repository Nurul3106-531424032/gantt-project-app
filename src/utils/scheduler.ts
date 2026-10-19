import type { Dependensi, ISODate, KalenderKerja, Tugas } from '../types';
import { topoSort } from './dependencies';
import { isValidISO, todayISO } from './dateUtils';
import {
  durationToEndDate,
  toWorkingDay,
  shiftWorkingDays,
  workingDaysBetween,
  workingDaysInclusive,
} from './workingCalendar';

/**
 * Penjadwalan CPM (Critical Path Method) untuk OrgaPlan.
 *
 * Prinsip:
 * - Durasi dalam HARI KERJA (mengikuti KalenderKerja).
 * - Forward pass  → Early Start (ES) & Early Finish (EF): kapan tugas BISA
 *   paling cepat mengingat dependensi + tanggal mulai manual.
 * - Backward pass → Late Start (LS) & Late Finish (LF): kapan tugas BISA
 *   paling lambat tanpa menunda selesai proyek.
 * - Slack = LS − ES (dalam hari kerja). Slack 0 → tugas KRITIS.
 * - Tipe dependensi:
 *     FS + lag : successor mulai ≥ lag hari kerja SETELAH pendahulu selesai.
 *     SS + lag : successor mulai ≥ lag hari kerja SETELAH pendahulu mulai.
 *
 * Semua tanggal hasil = hari kerja. Bila graf mengandung siklus, hasil
 * `ok: false` + `cyclicIds` (UI menampilkan pesan, tidak crash).
 */

export interface TaskSchedule {
  id: string;
  /** Early Start — tanggal mulai paling cepat (hari kerja). */
  earlyStart: ISODate;
  /** Early Finish — selesai paling cepat (inklusif, hari kerja). */
  earlyFinish: ISODate;
  /** Late Start — paling lambat mulai tanpa menunda proyek. */
  lateStart: ISODate;
  /** Late Finish — paling lambat selesai. */
  lateFinish: ISODate;
  /** Selisih hari kerja LS − ES (0 = kritikal; bisa < 0 pada data anomali). */
  slackDays: number;
  /** true bila slack ≤ 0 (anggota jalur kritis). */
  isCritical: boolean;
  /** Alias praktis untuk UI/gantt = earlyStart. */
  startDate: ISODate;
  /** Alias praktis untuk UI/gantt = earlyFinish. */
  endDate: ISODate;
}

export interface ScheduleResult {
  /** false bila graf dependensi mengandung siklus (tasks kosong saat itu). */
  ok: boolean;
  /** Id tugas yang terlibat/terdampak siklus (kosong bila ok). */
  cyclicIds: string[];
  /** Jadwal per tugas. */
  tasks: Map<string, TaskSchedule>;
  /** Hari kerja pertama proyek (tanpa tugas → undefined). */
  projectStart?: ISODate;
  /** Hari kerja terakhir proyek (EF terjauh). */
  projectEnd?: ISODate;
  /** Durasi proyek dalam hari kerja inklusif. */
  projectDuration?: number;
  /** Id tugas jalur kritis, urut topologis. */
  criticalIds: string[];
}

function sanitizedDuration(d: number): number {
  return typeof d === 'number' && Number.isFinite(d) ? Math.max(1, Math.round(d)) : 1;
}

function sanitizedLag(lag: number | undefined): number {
  return typeof lag === 'number' && Number.isFinite(lag) ? Math.trunc(lag) : 0;
}

/** Bandingkan tanggal ISO: kecil < besar → -1 (leksikografis = kronologis). */
function isoMin(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}
function isoMax(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/** Index ketergantungan yang sudah dibersihkan dari edge rusak/self-loop. */
function edgeIndex(tugas: Tugas[], dependensi: Dependensi[]) {
  const inEdges = new Map<string, Dependensi[]>();
  const outEdges = new Map<string, Dependensi[]>();
  const valid = new Set(tugas.map((t) => t.id));
  for (const t of tugas) {
    inEdges.set(t.id, []);
    outEdges.set(t.id, []);
  }
  for (const d of dependensi) {
    if (!valid.has(d.predecessorId) || !valid.has(d.successorId)) continue;
    if (d.predecessorId === d.successorId) continue;
    outEdges.get(d.predecessorId)?.push(d);
    inEdges.get(d.successorId)?.push(d);
  }
  return { inEdges, outEdges };
}

/**
 * Hitung jadwal seluruh tugas.
 * @param nowISO tanggal hari ini (bisa dioverride untuk tes deterministik).
 */
export function computeSchedule(
  tugas: Tugas[],
  dependensi: Dependensi[],
  kal: KalenderKerja,
  nowISO: ISODate = todayISO(),
): ScheduleResult {
  const { order, cyclicIds } = topoSort(tugas, dependensi);
  if (cyclicIds.length > 0) {
    return { ok: false, cyclicIds, tasks: new Map(), criticalIds: [] };
  }
  if (tugas.length === 0) {
    return { ok: true, cyclicIds: [], tasks: new Map(), criticalIds: [] };
  }

  const { inEdges, outEdges } = edgeIndex(tugas, dependensi);
  const byId = new Map(tugas.map((t) => [t.id, t]));

  // Anchor proyek: tanggal mulai manual paling awal; bila tidak ada → hari ini
  // (disejajarkan ke hari kerja).
  let projectStart: ISODate | undefined;
  for (const t of tugas) {
    if (isValidISO(t.startDate)) {
      projectStart = projectStart === undefined ? (t.startDate as ISODate) : isoMin(projectStart, t.startDate as ISODate);
    }
  }
  projectStart = toWorkingDay(projectStart ?? nowISO, kal);

  // ── Forward pass (ES/EF) ────────────────────────────────────────────────
  const sched = new Map<string, TaskSchedule>();
  const ef = new Map<string, ISODate>();
  const es = new Map<string, ISODate>();

  for (const id of order) {
    const t = byId.get(id);
    if (!t) continue;
    const manual = isValidISO(t.startDate) ? (t.startDate as ISODate) : undefined;

    // Kandidat batas bawah: dependensi + (tanggal manual ATAU projectStart).
    let earliest: ISODate = manual ?? projectStart;
    for (const e of inEdges.get(id) ?? []) {
      const pes = es.get(e.predecessorId);
      const pef = ef.get(e.predecessorId);
      if (pes === undefined || pef === undefined) continue; // pendahulu belum diproses (tidak terjadi pada topo order valid)
      const lag = sanitizedLag(e.lag);
      const cand =
        e.type === 'FS'
          ? shiftWorkingDays(pef, 1 + lag, kal) // mulai setelah pendahulu selesai + lag
          : shiftWorkingDays(pes, lag, kal); // mulai bersamaan pendahulu + lag
      earliest = isoMax(earliest, cand);
    }

    const start = toWorkingDay(earliest, kal);
    const finish = durationToEndDate(start, sanitizedDuration(t.duration), kal);
    es.set(id, start);
    ef.set(id, finish);
    sched.set(id, {
      id,
      earlyStart: start,
      earlyFinish: finish,
      lateStart: start, // sementara; diisi backward pass
      lateFinish: finish,
      slackDays: 0,
      isCritical: true,
      startDate: start,
      endDate: finish,
    });
  }

  // Akhir proyek = EF terjauh.
  let projectEnd: ISODate = projectStart;
  for (const finish of ef.values()) projectEnd = isoMax(projectEnd, finish);

  // ── Backward pass (LS/LF) ───────────────────────────────────────────────
  const lf = new Map<string, ISODate>();
  const ls = new Map<string, ISODate>();

  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const t = byId.get(id);
    if (!t) continue;
    const outgoing = outEdges.get(id) ?? [];
    const dur = sanitizedDuration(t.duration);

    // LF = min(projectEnd, semua batas dari successor).
    // Cap di projectEnd WAJIB: tugas tidak boleh selesai melewati akhir proyek
    // (penting untuk SS di mana pendahulu bisa outlast successornya — tanpa cap,
    // slack menjadi salah/besar).
    let latest: ISODate = projectEnd;
    for (const e of outgoing) {
      const sls = ls.get(e.successorId);
      if (sls === undefined) continue;
      const lag = sanitizedLag(e.lag);
      // Inversi batasan forward:
      //   FS : LF ≤ LS(successor) − (1 + lag) hari kerja
      //   SS : LF ≤ LS(successor) − lag + (dur − 1) hari kerja
      const cand =
        e.type === 'FS'
          ? shiftWorkingDays(sls, -(1 + lag), kal)
          : shiftWorkingDays(sls, dur - 1 - lag, kal);
      latest = isoMin(latest, cand);
    }

    // LF tidak boleh lebih awal dari EF (pengaman terhadap data anomali).
    const finish = isoMax(latest, ef.get(id) ?? latest);
    const start = shiftWorkingDays(finish, -(dur - 1), kal);
    lf.set(id, finish);
    ls.set(id, start);
    sched.set(id, {
      id,
      earlyStart: es.get(id) as ISODate,
      earlyFinish: ef.get(id) as ISODate,
      lateStart: start,
      lateFinish: finish,
      slackDays: workingDaysBetween(es.get(id) as ISODate, start, kal),
      isCritical: workingDaysBetween(es.get(id) as ISODate, start, kal) <= 0,
      startDate: es.get(id) as ISODate,
      endDate: ef.get(id) as ISODate,
    });
  }

  // Jalur kritis urut topologis.
  const criticalIds = order.filter((id) => sched.get(id)?.isCritical === true);

  return {
    ok: true,
    cyclicIds: [],
    tasks: sched,
    projectStart,
    projectEnd,
    projectDuration: workingDaysInclusive(projectStart, projectEnd, kal),
    criticalIds,
  };
}
