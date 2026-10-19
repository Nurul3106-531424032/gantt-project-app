/**
 * OrgaPlan — Tipe data inti.
 *
 * Konteks: MANAJEMEN KEGIATAN ORGANISASI MAHASISWA (bukan perusahaan).
 * Karena itu:
 *  - Anggota TIDAK memiliki atribut gaji/salary.
 *  - Tidak ada fitur penggajian atau perhitungan gaji di aplikasi ini.
 *  - Atribut anggota: id, name, email, role (jabatan), division (divisi).
 */

/** Tanggal dalam format ISO sederhana: 'YYYY-MM-DD' (aman dari masalah zona waktu). */
export type ISODate = string;

/** Tipe hubungan antar tugas (dependensi). */
export type DependencyType = 'FS' | 'SS';
// FS (Finish-to-Start) : tugas penerima mulai SETELAH tugas pendahulu selesai.
// SS (Start-to-Start)  : tugas penerima mulai BERSAMAAN tugas pendahulu dimulai.

/**
 * Satu anggota organisasi mahasiswa.
 * CATATAN: tidak ada atribut `salary`/gaji — aplikasi ini murni manajemen kegiatan.
 */
export interface Anggota {
  /** Kunci unik, mis. 'a1'. */
  id: string;
  /** Nama lengkap anggota. */
  name: string;
  /** Email anggota, mis. 'rizky@kampus.ac.id'. */
  email: string;
  /** Jabatan, mis. 'Ketua', 'Sekretaris', 'Bendahara', 'Koordinator', 'Anggota'. */
  role: string;
  /** Divisi, mis. 'Divisi Acara', 'Divisi Perlengkapan', 'Divisi Publikasi'. */
  division: string;
}

/**
 * Satu kegiatan (acara/proyek) organisasi.
 * Setiap kegiatan wajib punya penanggung jawab utama (`leadId` → Anggota.id).
 */
export interface Kegiatan {
  /** Kunci unik, mis. 'k1'. */
  id: string;
  /** Nama kegiatan, mis. 'Seminar Nasional Mahasiswa'. */
  name: string;
  /** Penjelasan singkat kegiatan. */
  description?: string;
  /** Penanggung jawab UTAMA kegiatan → merujuk ke Anggota.id (wajib). */
  leadId: string;
  /** Divisi yang menangani kegiatan. */
  division: string;
  /** Warna bar pada Gantt Chart, format '#RRGGBB'. */
  color?: string;
}

/**
 * Satu tugas (atau sub-tugas) di dalam sebuah kegiatan.
 * Setiap tugas punya penanggung jawab (`assigneeId` → Anggota.id),
 * sehingga setiap anggota dapat dialokasikan ke tugas/sub-tugas tertentu.
 */
export interface Tugas {
  /** Kunci unik, mis. 't1'. */
  id: string;
  /** Kegiatan induk → merujuk ke Kegiatan.id. */
  activityId: string;
  /** Induk tugas jika ini sub-tugas → merujuk ke Tugas.id lain. */
  parentId?: string;
  /** Nama tugas. */
  name: string;
  /** Penjelasan singkat tugas. */
  description?: string;
  /** Penanggung jawab tugas → merujuk ke Anggota.id (bisa dialokasikan per tugas). */
  assigneeId?: string;
  /** Tanggal mulai efektif (dihitung otomatis dari dependensi + hari kerja bila tidak diisi manual). */
  startDate?: ISODate;
  /** Durasi dalam HARI KERJA (mengikuti KalenderKerja, bukan hari kalender biasa). */
  duration: number;
  /** Kemajuan 0–100 (default 0). */
  progress?: number;
  /**
   * Estimasi PERT (dalam hari kerja): optimis, paling mungkin, pesimis.
   * Nilai tengah dihitung: TE = (O + 4M + P) / 6.
   */
  pert?: { optimistic: number; mostLikely: number; pessimistic: number };
}

/** Hubungan predecessor → successor antar tugas. */
export interface Dependensi {
  /** Kunci unik, mis. 'd1'. */
  id: string;
  /** Tugas pendahulu (predecessor) → Tugas.id. */
  predecessorId: string;
  /** Tugas penerima (successor) → Tugas.id. */
  successorId: string;
  /** Tipe hubungan: 'FS' (Finish-to-Start) atau 'SS' (Start-to-Start). */
  type: DependencyType;
  /** Jeda tambahan dalam hari kerja (default 0). */
  lag?: number;
}

/** Pengaturan kalender hari kerja organisasi. */
export interface KalenderKerja {
  /**
   * Hari kerja dalam seminggu: 0 = Minggu, 1 = Senin, ..., 6 = Sabtu.
   * Contoh: [1,2,3,4,5] = Senin–Jumat.
   */
  workingDays: number[];
  /** Hari libur tambahan (per hari), format 'YYYY-MM-DD'. */
  holidays: ISODate[];
}

/**
 * Seluruh data aplikasi yang disimpan di localStorage.
 * `version` dipakai untuk migrasi skema di masa depan.
 */
export interface AppState {
  /** Versi skema data. Lihat APP_STATE_VERSION. */
  version: number;
  anggota: Anggota[];
  kegiatan: Kegiatan[];
  tugas: Tugas[];
  dependensi: Dependensi[];
  kalender: KalenderKerja;
}

/** Versi skema localStorage saat ini. Ubah angka ini bila bentuk AppState berubah. */
export const APP_STATE_VERSION = 1;
