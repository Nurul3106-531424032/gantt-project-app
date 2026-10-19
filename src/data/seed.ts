import type { AppState } from '../types';

/**
 * Seed data — data contoh organisasi mahasiswa "Himpunan Mahasiswa Teknik Informatika".
 * Ditampilkan saat aplikasi dibuka pertama kali (belum ada data tersimpan di localStorage).
 *
 * Konteks organisasi mahasiswa:
 *  - Anggota: id, name, email, role (jabatan), division (divisi) — TANPA gaji/salary.
 *  - Jabatan: Ketua, Sekretaris, Bendahara, Koordinator, Anggota.
 *  - Divisi : Divisi Acara, Divisi Perlengkapan, Divisi Publikasi, Pengurus Inti.
 *  - Setiap tugas punya penanggung jawab (assigneeId) yang menunjuk ke salah satu anggota.
 */

export const seedData: AppState = {
  version: 1,

  // ── Anggota organisasi mahasiswa (tanpa atribut gaji) ──────────────────────
  anggota: [
    { id: 'a1', name: 'Rizky Ramadhan', email: 'rizky@kampus.ac.id', role: 'Ketua', division: 'Pengurus Inti' },
    { id: 'a2', name: 'Siti Nurhaliza', email: 'siti@kampus.ac.id', role: 'Sekretaris', division: 'Pengurus Inti' },
    { id: 'a3', name: 'Bagus Prakoso', email: 'bagus@kampus.ac.id', role: 'Bendahara', division: 'Pengurus Inti' },
    { id: 'a4', name: 'Dewi Lestari', email: 'dewi@kampus.ac.id', role: 'Koordinator', division: 'Divisi Acara' },
    { id: 'a5', name: 'Andi Wijaya', email: 'andi@kampus.ac.id', role: 'Anggota', division: 'Divisi Acara' },
    { id: 'a6', name: 'Nadia Safitri', email: 'nadia@kampus.ac.id', role: 'Koordinator', division: 'Divisi Perlengkapan' },
    { id: 'a7', name: 'Fajar Nugroho', email: 'fajar@kampus.ac.id', role: 'Anggota', division: 'Divisi Perlengkapan' },
    { id: 'a8', name: 'Putri Handayani', email: 'putri@kampus.ac.id', role: 'Koordinator', division: 'Divisi Publikasi' },
  ],

  // ── Kegiatan (masing-masing punya penanggung jawab utama) ─────────────────
  kegiatan: [
    {
      id: 'k1',
      name: 'Seminar Nasional Teknologi Kampus',
      description: 'Seminar nasional hasil kolaborasi tiga divisi.',
      leadId: 'a4', // penanggung jawab utama: Dewi Lestari (Koordinator Divisi Acara)
      division: 'Divisi Acara',
      color: '#2563eb',
    },
    {
      id: 'k2',
      name: 'Pelatihan Internal Pengurus',
      description: 'Pelatihan keorganisasian untuk pengurus baru.',
      leadId: 'a2', // penanggung jawab utama: Siti Nurhaliza (Sekretaris)
      division: 'Pengurus Inti',
      color: '#16a34a',
    },
  ],

  // ── Tugas & sub-tugas (semua punya penanggung jawab) ──────────────────────
  tugas: [
    // Kegiatan k1 — urutan logis: persiapan → pelaksanaan → evaluasi
    { id: 't1', activityId: 'k1', name: 'Pengajuan proposal ke fakultas', assigneeId: 'a2', duration: 4, startDate: '2026-10-19' },
    { id: 't2', activityId: 'k1', name: 'Persetujuan dosen pembina', assigneeId: 'a1', duration: 3 },
    { id: 't3', activityId: 'k1', name: 'Penentuan narasumber & materi', assigneeId: 'a4', duration: 4 },
    { id: 't4', activityId: 'k1', name: 'Pemesanan tempat & perlengkapan', assigneeId: 'a6', duration: 3 },
    { id: 't5', activityId: 'k1', name: 'Publikasi & open registration', assigneeId: 'a8', duration: 5 },
    {
      id: 't5a',
      activityId: 'k1',
      parentId: 't5',
      name: 'Desain poster & banner',
      assigneeId: 'a8',
      duration: 2,
      pert: { optimistic: 1, mostLikely: 2, pessimistic: 4 },
    },
    {
      id: 't5b',
      activityId: 'k1',
      parentId: 't5',
      name: 'Sebar promosi media sosial',
      assigneeId: 'a5',
      duration: 3,
      pert: { optimistic: 2, mostLikely: 3, pessimistic: 5 },
    },
    { id: 't6', activityId: 'k1', name: 'Pelaksanaan seminar hari-H', assigneeId: 'a4', duration: 1 },
    { id: 't7', activityId: 'k1', name: 'Laporan pertanggungjawaban', assigneeId: 'a3', duration: 4 },

    // Kegiatan k2
    { id: 't8', activityId: 'k2', name: 'Penyusunan materi pelatihan', assigneeId: 'a2', duration: 4, startDate: '2026-10-26' },
    { id: 't9', activityId: 'k2', name: 'Penyusunan lembar kerja peserta', assigneeId: 'a7', duration: 3 },
    { id: 't10', activityId: 'k2', name: 'Pelatihan hari pertama', assigneeId: 'a1', duration: 1 },
    { id: 't11', activityId: 'k2', name: 'Pelatihan hari kedua', assigneeId: 'a6', duration: 1 },
    { id: 't12', activityId: 'k2', name: 'Evaluasi & umpan balik', assigneeId: 'a5', duration: 2 },
  ],

  // ── Hubungan predecessor (FS = selesai→mulai, SS = mulai→mulai) ───────────
  dependensi: [
    { id: 'd1', predecessorId: 't1', successorId: 't2', type: 'FS' },
    { id: 'd2', predecessorId: 't2', successorId: 't3', type: 'FS' },
    { id: 'd3', predecessorId: 't2', successorId: 't4', type: 'FS' },
    { id: 'd4', predecessorId: 't3', successorId: 't5', type: 'FS' },
    { id: 'd5', predecessorId: 't4', successorId: 't5', type: 'FS' },
    { id: 'd6', predecessorId: 't5', successorId: 't6', type: 'FS' },
    { id: 'd7', predecessorId: 't6', successorId: 't7', type: 'FS' },
    { id: 'd8', predecessorId: 't8', successorId: 't9', type: 'FS' },
    { id: 'd9', predecessorId: 't9', successorId: 't10', type: 'SS' }, // latihan pertama mulai saat penyusunan lembar kerja masih berjalan
    { id: 'd10', predecessorId: 't10', successorId: 't11', type: 'FS' },
    { id: 'd11', predecessorId: 't11', successorId: 't12', type: 'FS' },
  ],

  // ── Kalender hari kerja organisasi ─────────────────────────────────────────
  kalender: {
    workingDays: [1, 2, 3, 4, 5], // Senin–Jumat
    holidays: ['2026-10-28', '2026-11-16', '2026-12-25', '2027-01-01'],
  },
};
