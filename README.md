# Tampilan Aplikasi

### Beranda
<img width="959" height="500" alt="Screenshot 2026-10-25 130112" src="https://github.com/user-attachments/assets/c431b96b-d4c9-4780-8601-5e3be2860985" />

### Gantt Chart
<img width="953" height="506" alt="Screenshot 2026-10-25 130200" src="https://github.com/user-attachments/assets/28a621b6-2434-4a3a-9bbe-fd0ab4acc2ca" />

### Pert & Kritis
<img width="958" height="505" alt="Screenshot 2026-10-25 130214" src="https://github.com/user-attachments/assets/a6a52fd4-4595-43db-846c-d62f54554ea1" />


# OrgaPlan

**Sistem Manajemen Jadwal dan Kegiatan Organisasi Mahasiswa**

OrgaPlan adalah aplikasi web untuk membantu organisasi mahasiswa menyusun rencana kegiatan secara terstruktur: dari daftar anggota, kegiatan, dan tugas, sampai jadwal visual dalam bentuk Gantt Chart, diagram PERT, dan penentuan jalur kritis (Critical Path).

## Tujuan Proyek

Organisasi mahasiswa sering kesulitan mengatur jadwal kegiatan yang melibatkan banyak orang, banyak tugas, dan tenggat yang saling bergantung. OrgaPlan dirancang agar pengurus dapat:

- Mencatat **kegiatan** dan **tugas** beserta penanggung jawabnya.
- Melihat seluruh jadwal pada **Gantt Chart interaktif** (bisa digeser dan diubah panjangnya).
- Mendefinisikan **dependensi antar tugas** dengan tipe *Finish-to-Start* (FS) dan *Start-to-Start* (SS).
- Mengatur **kalender hari kerja** (hari libur dan akhir pekan) sehingga perhitungan jadwal realistis.
- Mengetahui **Critical Path** (jalur kritis) agar tugas yang paling menentukan tenggat terlihat jelas.
- Melihat **diagram PERT** untuk estimasi durasi tugas dengan pendekatan *optimis, paling mungkin, pesimis*.

Data disimpan di **localStorage** browser, jadi tidak memerlukan server atau database. Saat pertama dibuka, aplikasi diisi **seed data** (data contoh) agar langsung bisa dicoba.

## Teknologi

- **React 19** + **TypeScript** + **Vite 8**
- **Vitest 5** untuk unit test
- Penyimpanan: **localStorage**
- Tanpa backend — murni aplikasi sisi klien

## Cara Menjalankan

```bash
npm install      # sekali saja, mengunduh dependensi
npm run dev      # jalankan aplikasi di mode pengembangan
npm run build    # bangun versi produksi ke folder dist/
npm test         # jalankan unit test (Vitest, 7 file / 66 test)
npm run test:e2e # uji E2E Gantt via Chrome headless (butuh npm run dev aktif)
npm run lint     # periksa kode dengan oxlint
npm run preview  # pratinjau hasil build
```

## Uji E2E Gantt

Selain unit test, terdapat pemeriksaan interaksi nyata (input mouse sungguhan lewat Chrome DevTools Protocol): render bar/grup/panah dependensi, zoom in-out, drag pindah bar, drag resize grip, persistensi setelah reload, dan bebas error JS — **16 pemeriksaan**.

```bash
npm run dev        # terminal 1 — aplikasi harus aktif
npm run test:e2e   # terminal 2 — Chrome headless dijalankan & dimatikan otomatis
```

Skrip memakai profil Chrome sementara dan port debug acak sehingga aman (tidak menyentuh Chrome harian Anda). Butuh Chrome terpasang — bila lokasinya tidak terdeteksi otomatis, set `CHROME_PATH=/lokasi/chrome`. URL tujuan bisa diubah lewat `E2E_URL`.

## Struktur Proyek

```
src/
├── types/        # Definisi tipe data (anggota, kegiatan, tugas, dependensi)
├── data/         # Seed data (data contoh bawaan)
├── store/        # State global + reducer + penyimpanan localStorage
├── utils/        # Logika murni: tanggal, hari kerja, dependensi, scheduler/CPM, PERT
└── views/        # Halaman UI (dashboard, anggota, kegiatan, tugas, dependensi,
                  #              kalender, Gantt Chart + Gantt.css, PERT)
```

## Status

**Aplikasi lengkap.** Seluruh tahap implementasi selesai:

- [x] Tahap 0 — setup proyek (Vite + React 19 + TypeScript)
- [x] Tahap 1 — state global (Context + useReducer) + persistensi localStorage + seed data
- [x] Tahap 2 — CRUD anggota (form UI)
- [x] Tahap 3 — CRUD kegiatan, tugas (induk/sub), penanggung jawab, progres, PERT per tugas
- [x] Tahap 4 — kalender hari kerja (hari efektif + hari libur) dengan pratinjau 14 hari
- [x] Tahap 5 — dependensi FS/SS + lag, validasi anti-siklus (pesan berbahasa Indonesia)
- [x] Tahap 6 — mesin penjadwalan CPM (forward/backward pass) + Critical Path + slack
- [x] Tahap 7 — Gantt Chart interaktif (geser bar, ubah durasi via grip, panah dependensi, zoom, penanda hari ini, jalur kritis)
- [x] Tahap 8 — diagram PERT (TE, varians, σ, jalur kritis, probabilitas selesai)
- [x] Navigasi shell (sidebar + URL hash per tab, mis. `/#gantt`)
- [x] Tab **Data & Cadangan** — ekspor (unduh JSON), impor file cadangan dengan validasi, reset seed

Verifikasi terakhir:

- **`npm test` — 7 file, 66 unit test lulus** (Vitest): utilitas tanggal & hari kerja, dependensi/anti-siklus, scheduler CPM + jalur kritis, PERT, reducer, dan sanitasi persistence.
- oxlint 0/0, `tsc -b` bersih, `vite build` sukses.
- Semua view render tanpa error JS di Chrome headless, dan alur interaksi nyata (drag/resize/zoom Gantt, form, ekspor/impor data, navigasi, persistensi reload) diuji lewat input browser sungguhan via CDP (`npm run test:e2e` — 16 pemeriksaan sentuh Gantt).
