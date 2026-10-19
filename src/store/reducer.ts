import { seedData } from '../data/seed';
import type { Anggota, AppState, Dependensi, KalenderKerja, Kegiatan, Tugas } from '../types';
import { APP_STATE_VERSION } from '../types';
import { validateDependency, type DependencyIssue } from '../utils/dependencies';
import { isValidISO } from '../utils/dateUtils';

/**
 * Aksi dasar untuk mengelola data organisasi.
 * Setiap aksi menjaga konsistensi referensi antar-anggota, kegiatan,
 * tugas, sub-tugas, dan dependensi (lihat catatan di tiap case).
 */
export type Action =
  | { type: 'ADD_ANGGOTA'; payload: Omit<Anggota, 'id'> & { id?: string } }
  | { type: 'UPDATE_ANGGOTA'; payload: Anggota }
  | { type: 'DELETE_ANGGOTA'; payload: { id: string } }
  | { type: 'ADD_KEGIATAN'; payload: Omit<Kegiatan, 'id'> & { id?: string } }
  | { type: 'UPDATE_KEGIATAN'; payload: Kegiatan }
  | { type: 'DELETE_KEGIATAN'; payload: { id: string } }
  | { type: 'ADD_TUGAS'; payload: Omit<Tugas, 'id'> & { id?: string } }
  | { type: 'UPDATE_TUGAS'; payload: Tugas }
  | { type: 'DELETE_TUGAS'; payload: { id: string } }
  | { type: 'ADD_DEPENDENSI'; payload: Omit<Dependensi, 'id'> & { id?: string } }
  | { type: 'UPDATE_DEPENDENSI'; payload: Dependensi }
  | { type: 'DELETE_DEPENDENSI'; payload: { id: string } }
  | { type: 'UPDATE_KALENDER'; payload: KalenderKerja }
  | { type: 'IMPORT_STATE'; payload: AppState }
  | { type: 'RESET_TO_SEED' };

/**
 * Validasi kandidat dependensi terhadap state saat ini — dipanggil FORM UI
 * sebelum dispatch untuk menampilkan alasan penolakan (pesan Indonesia).
 * Mengembalikan null bila valid.
 */
export function checkDependency(
  state: AppState,
  candidate: { predecessorId: string; successorId: string },
  excludeId?: string,
): DependencyIssue | null {
  return validateDependency(state.tugas, state.dependensi, candidate, excludeId);
}

/** Validasi + sanitasi payload kalender. null = tolak (tidak ada hari kerja). */
export function sanitizeKalender(kal: KalenderKerja): KalenderKerja | null {
  if (!kal || !Array.isArray(kal.workingDays) || !Array.isArray(kal.holidays)) return null;
  const workingDays = [
    ...new Set(
      kal.workingDays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6),
    ),
  ].sort((a, b) => a - b);
  if (workingDays.length === 0) return null; // tanpa hari kerja, penjadwalan tidak bisa jalan
  const holidays = [...new Set(kal.holidays.filter((h) => isValidISO(h)))].sort();
  return { workingDays, holidays };
}

/** Membuat id unik baru. Dipanggil reducer bila payload tidak membawa id. */
export function makeId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

function cleanStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function cloneSeed(): AppState {
  return JSON.parse(JSON.stringify(seedData)) as AppState;
}

/** Kumpulkan id tugas + seluruh sub-tugas turunannya (untuk hapus berantai). */
function collectDescendants(tugas: Tugas[], rootId: string): Set<string> {
  const removed = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const t of tugas) {
      if (!removed.has(t.id) && t.parentId !== undefined && removed.has(t.parentId)) {
        removed.add(t.id);
        added = true;
      }
    }
  }
  return removed;
}

/** True bila menjadikan `childId` anak dari `newParentId` akan membentuk siklus. */
function wouldCreateCycle(tugas: Tugas[], newParentId: string, childId: string): boolean {
  const seen = new Set<string>();
  let cur: string | undefined = newParentId;
  while (cur !== undefined) {
    if (cur === childId) return true;
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = tugas.find((t) => t.id === cur)?.parentId;
  }
  return false;
}

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    // ── Anggota ────────────────────────────────────────────────────────────
    case 'ADD_ANGGOTA': {
      const p = action.payload;
      if (!isNonEmpty(p.name) || !isNonEmpty(p.email)) return state;
      const baru: Anggota = {
        id: p.id ?? makeId('a'),
        name: cleanStr(p.name),
        email: cleanStr(p.email),
        role: cleanStr(p.role),
        division: cleanStr(p.division),
      };
      if (state.anggota.some((a) => a.id === baru.id)) return state;
      return { ...state, anggota: [...state.anggota, baru] };
    }

    case 'UPDATE_ANGGOTA': {
      const p = action.payload;
      if (!state.anggota.some((a) => a.id === p.id)) return state;
      if (!isNonEmpty(p.name) || !isNonEmpty(p.email)) return state;
      return {
        ...state,
        anggota: state.anggota.map((a) =>
          a.id === p.id
            ? { id: a.id, name: cleanStr(p.name), email: cleanStr(p.email), role: cleanStr(p.role), division: cleanStr(p.division) }
            : a,
        ),
      };
    }

    case 'DELETE_ANGGOTA': {
      const { id } = action.payload;
      if (!state.anggota.some((a) => a.id === id)) return state;
      // Pertahankan minimal satu anggota agar setiap kegiatan tetap punya PJ valid.
      if (state.anggota.length <= 1) return state;
      const anggota = state.anggota.filter((a) => a.id !== id);
      const pengganti = anggota[0].id;
      return {
        ...state,
        anggota,
        // Tugas: PJ-nya dikosongkan (field opsional).
        tugas: state.tugas.map((t) => (t.assigneeId === id ? { ...t, assigneeId: undefined } : t)),
        // Kegiatan: PJ utama dialihkan ke anggota pertama yang tersisa.
        kegiatan: state.kegiatan.map((k) => (k.leadId === id ? { ...k, leadId: pengganti } : k)),
      };
    }

    // ── Kegiatan ───────────────────────────────────────────────────────────
    case 'ADD_KEGIATAN': {
      const p = action.payload;
      if (!isNonEmpty(p.name)) return state;
      const penggantiLead = state.anggota[0]?.id;
      if (state.anggota.length === 0) return state; // tanpa anggota, leadId tidak bisa valid
      const leadValid = isNonEmpty(p.leadId) && state.anggota.some((a) => a.id === p.leadId);
      const baru: Kegiatan = {
        id: p.id ?? makeId('k'),
        name: cleanStr(p.name),
        leadId: leadValid ? cleanStr(p.leadId) : (penggantiLead as string),
        division: cleanStr(p.division),
        ...(isNonEmpty(p.description) ? { description: cleanStr(p.description) } : {}),
        ...(isNonEmpty(p.color) ? { color: cleanStr(p.color) } : {}),
      };
      if (state.kegiatan.some((k) => k.id === baru.id)) return state;
      return { ...state, kegiatan: [...state.kegiatan, baru] };
    }

    case 'UPDATE_KEGIATAN': {
      const p = action.payload;
      const old = state.kegiatan.find((k) => k.id === p.id);
      if (!old || !isNonEmpty(p.name)) return state;
      // leadId tidak valid → perbaiki ke anggota pertama, bukan simpan referensi rusak.
      const leadValid = isNonEmpty(p.leadId) && state.anggota.some((a) => a.id === p.leadId);
      const leadId = leadValid ? cleanStr(p.leadId) : state.anggota[0]?.id ?? '';
      return {
        ...state,
        kegiatan: state.kegiatan.map((k) =>
          k.id === p.id
            ? { ...old, name: cleanStr(p.name), leadId, division: cleanStr(p.division), ...(isNonEmpty(p.description) ? { description: cleanStr(p.description) } : { description: undefined }) }
            : k,
        ),
      };
    }

    case 'DELETE_KEGIATAN': {
      const { id } = action.payload;
      if (!state.kegiatan.some((k) => k.id === id)) return state;
      // Hapus berantai: semua tugas kegiatan ini + dependensi yang menyentuhnya.
      const removedTaskIds = new Set(state.tugas.filter((t) => t.activityId === id).map((t) => t.id));
      return {
        ...state,
        kegiatan: state.kegiatan.filter((k) => k.id !== id),
        tugas: state.tugas.filter((t) => t.activityId !== id),
        dependensi: state.dependensi.filter(
          (d) => !removedTaskIds.has(d.predecessorId) && !removedTaskIds.has(d.successorId),
        ),
      };
    }

    // ── Tugas ──────────────────────────────────────────────────────────────
    case 'ADD_TUGAS': {
      const p = action.payload;
      if (!isNonEmpty(p.name)) return state;
      if (!state.kegiatan.some((k) => k.id === p.activityId)) return state; // kegiatan wajib ada
      const assigneeValid = isNonEmpty(p.assigneeId) && state.anggota.some((a) => a.id === p.assigneeId);
      let parentId = isNonEmpty(p.parentId) ? cleanStr(p.parentId) : undefined;
      if (parentId) {
        const parent = state.tugas.find((t) => t.id === parentId);
        if (!parent || parent.activityId !== p.activityId || wouldCreateCycle(state.tugas, parentId, p.id ?? '')) {
          parentId = undefined;
        }
      }
      const durasi = typeof p.duration === 'number' && Number.isFinite(p.duration) ? Math.max(1, Math.round(p.duration)) : 1;
      const baru: Tugas = {
        id: p.id ?? makeId('t'),
        activityId: p.activityId,
        name: cleanStr(p.name),
        duration: durasi,
        assigneeId: assigneeValid ? cleanStr(p.assigneeId) : undefined,
        parentId,
        ...(isNonEmpty(p.description) ? { description: cleanStr(p.description) } : {}),
        ...(isNonEmpty(p.startDate) ? { startDate: cleanStr(p.startDate) } : {}),
        ...(typeof p.progress === 'number' ? { progress: p.progress } : {}),
        ...(p.pert ? { pert: p.pert } : {}),
      };
      if (state.tugas.some((t) => t.id === baru.id)) return state;
      return { ...state, tugas: [...state.tugas, baru] };
    }

    case 'UPDATE_TUGAS': {
      const p = action.payload;
      const old = state.tugas.find((t) => t.id === p.id);
      if (!old || !isNonEmpty(p.name)) return state;
      // activityId wajib menunjuk kegiatan yang ada — jika tidak, tolak perubahan.
      if (!state.kegiatan.some((k) => k.id === p.activityId)) return state;
      const assigneeValid = isNonEmpty(p.assigneeId) && state.anggota.some((a) => a.id === p.assigneeId);
      let parentId: string | undefined = isNonEmpty(p.parentId) ? cleanStr(p.parentId) : undefined;
      if (parentId) {
        const parent = state.tugas.find((t) => t.id === parentId);
        if (!parent || parent.id === p.id || parent.activityId !== p.activityId || wouldCreateCycle(state.tugas, parentId, p.id)) {
          parentId = undefined; // referensi induk tidak valid → lepas, jangan simpan rusak
        }
      }
      const durasi = typeof p.duration === 'number' && Number.isFinite(p.duration) ? Math.max(1, Math.round(p.duration)) : old.duration;
      const diperbarui: Tugas = {
        ...old,
        ...p,
        name: cleanStr(p.name),
        activityId: p.activityId,
        duration: durasi,
        assigneeId: assigneeValid ? cleanStr(p.assigneeId) : undefined,
        parentId,
      };
      let tugas = state.tugas.map((t) => (t.id === p.id ? diperbarui : t));
      // Jika kegiatan berubah, sub-tugas ikut pindah agar referensi tetap selaras.
      if (p.activityId !== old.activityId) {
        tugas = tugas.map((t) => (t.parentId === p.id ? { ...t, activityId: p.activityId } : t));
      }
      return { ...state, tugas };
    }

    case 'DELETE_TUGAS': {
      const { id } = action.payload;
      if (!state.tugas.some((t) => t.id === id)) return state;
      // Hapus berantai: tugas + seluruh sub-tugas turunannya + dependensinya.
      const removed = collectDescendants(state.tugas, id);
      return {
        ...state,
        tugas: state.tugas.filter((t) => !removed.has(t.id)),
        dependensi: state.dependensi.filter((d) => !removed.has(d.predecessorId) && !removed.has(d.successorId)),
      };
    }

    // ── Dependensi ──────────────────────────────────────────────────────────
    case 'ADD_DEPENDENSI': {
      const p = action.payload;
      const candidate = {
        predecessorId: cleanStr(p.predecessorId),
        successorId: cleanStr(p.successorId),
      };
      // Tolak edge rusak: id tak ada, self, duplikat, atau membentuk siklus.
      if (validateDependency(state.tugas, state.dependensi, candidate)) return state;
      const lag = typeof p.lag === 'number' && Number.isFinite(p.lag) ? Math.trunc(p.lag) : 0;
      const baru: Dependensi = {
        id: p.id ?? makeId('d'),
        predecessorId: candidate.predecessorId,
        successorId: candidate.successorId,
        type: p.type === 'SS' ? 'SS' : 'FS',
        ...(lag > 0 ? { lag } : {}),
      };
      if (state.dependensi.some((d) => d.id === baru.id)) return state;
      return { ...state, dependensi: [...state.dependensi, baru] };
    }

    case 'UPDATE_DEPENDENSI': {
      const p = action.payload;
      const old = state.dependensi.find((d) => d.id === p.id);
      if (!old) return state;
      const candidate = { predecessorId: cleanStr(p.predecessorId), successorId: cleanStr(p.successorId) };
      // `excludeId` = id ini sendiri supaya edge lama tidak dianggap duplikat.
      if (validateDependency(state.tugas, state.dependensi, candidate, p.id)) return state;
      const lag = typeof p.lag === 'number' && Number.isFinite(p.lag) ? Math.trunc(p.lag) : 0;
      return {
        ...state,
        dependensi: state.dependensi.map((d) =>
          d.id === p.id
            ? {
                id: p.id,
                predecessorId: candidate.predecessorId,
                successorId: candidate.successorId,
                type: p.type === 'SS' ? 'SS' : 'FS',
                ...(lag > 0 ? { lag } : {}),
              }
            : d,
        ),
      };
    }

    case 'DELETE_DEPENDENSI': {
      const { id } = action.payload;
      if (!state.dependensi.some((d) => d.id === id)) return state;
      return { ...state, dependensi: state.dependensi.filter((d) => d.id !== id) };
    }

    // ── Kalender hari kerja ─────────────────────────────────────────────────
    case 'UPDATE_KALENDER': {
      const kal = sanitizeKalender(action.payload);
      if (!kal) return state; // minimal 1 hari kerja wajib ada
      return { ...state, kalender: kal };
    }

    // ── Impor file cadangan ─────────────────────────────────────────────────
    case 'IMPORT_STATE': {
      // Payload sudah lewat sanitizeState() di lapisan view; di sini kita
      // kunci versi skema dan kembalikan salinan segar (tanpa alias objek).
      const p = action.payload;
      return {
        version: APP_STATE_VERSION,
        anggota: [...p.anggota],
        kegiatan: [...p.kegiatan],
        tugas: [...p.tugas],
        dependensi: [...p.dependensi],
        kalender: { workingDays: [...p.kalender.workingDays], holidays: [...p.kalender.holidays] },
      };
    }

    case 'RESET_TO_SEED':
      return cloneSeed();

    default:
      return state;
  }
}
