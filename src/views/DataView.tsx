import { useRef, useState, type ChangeEvent } from 'react';
import { useApp } from '../store/useApp';
import { sanitizeState, STORAGE_KEY } from '../store/persistence';
import { todayISO } from '../utils/dateUtils';
import type { AppState } from '../types';

interface FileInfo {
  name: string;
  size: number;
  parsed: AppState | null;
  error: string | null;
}

function ringkas(data: AppState): string {
  return `${data.anggota.length} anggota · ${data.kegiatan.length} kegiatan · ${data.tugas.length} tugas · ${data.dependensi.length} dependensi · ${data.kalender.holidays.length} hari libur`;
}

function formatKB(byte: number): string {
  return `${(byte / 1024).toFixed(1)} KB`;
}

export function DataView() {
  const { state, dispatch } = useApp();
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'err'; teks: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ukuranKini = new Blob([JSON.stringify(state)]).size;

  // ── Ekspor: unduh seluruh state sebagai file JSON ──
  const ekspor = () => {
    try {
      const teks = JSON.stringify(state, null, 2);
      const blob = new Blob([teks], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orgaplan-cadangan-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setPesan({ tipe: 'ok', teks: `Cadangan diunduh (${formatKB(blob.size)}).` });
    } catch {
      setPesan({ tipe: 'err', teks: 'Gagal membuat file cadangan.' });
    }
  };

  // ── Impor: baca + validasi file terpilih (tanpa mengubah state dulu) ──
  const pilihFile = async (e: ChangeEvent<HTMLInputElement>) => {
    setPesan(null);
    const f = e.target.files?.[0];
    if (!f) {
      setFileInfo(null);
      return;
    }
    let parsed: AppState | null = null;
    let error: string | null = null;
    try {
      const teks = await f.text();
      let obj: unknown;
      try {
        obj = JSON.parse(teks);
      } catch {
        error = 'File bukan JSON yang valid.';
      }
      if (!error) {
        parsed = sanitizeState(obj);
        if (!parsed) {
          error = 'Struktur data tidak dikenali — bukan file cadangan OrgaPlan yang valid.';
        }
      }
    } catch {
      error = 'File gagal dibaca.';
    }
    setFileInfo({ name: f.name, size: f.size, parsed, error });
  };

  const impor = () => {
    if (!fileInfo?.parsed) return;
    const konfirmasi = window.confirm(
      `Impor dari "${fileInfo.name}" (${ringkas(fileInfo.parsed)}) akan MENGGANTI SELURUH data saat ini. Lanjutkan?`,
    );
    if (!konfirmasi) return;
    dispatch({ type: 'IMPORT_STATE', payload: fileInfo.parsed });
    setFileInfo(null);
    if (inputRef.current) inputRef.current.value = '';
    setPesan({ tipe: 'ok', teks: 'Data berhasil diimpor.' });
  };

  const reset = () => {
    if (!window.confirm('Ganti data saat ini dengan data contoh bawaan? Data tersimpan akan ditimpa.')) {
      return;
    }
    dispatch({ type: 'RESET_TO_SEED' });
    setFileInfo(null);
    if (inputRef.current) inputRef.current.value = '';
    setPesan({ tipe: 'ok', teks: 'Data contoh dimuat ulang.' });
  };

  return (
    <div className="view">
      <section className="card">
        <h2>Data saat ini</h2>
        <div className="stats">
          <span className="stat">{ringkas(state)}</span>
          <span className="stat">Ukuran: {formatKB(ukuranKini)}</span>
          <span className="stat">Kunci: {STORAGE_KEY}</span>
        </div>
      </section>

      <section className="card">
        <div className="toolbar">
          <h2>Ekspor (cadangan)</h2>
          <button type="button" className="btn btn-primary" onClick={ekspor}>
            ⬇ Unduh JSON
          </button>
        </div>
        <p className="hint">
          File berisi seluruh data (anggota, kegiatan, tugas, dependensi, kalender). Simpan sebagai
          cadangan, atau kirimkan ke pengurus lain untuk diimpor.
        </p>
        {pesan?.teks.includes('diunduh') ? <p className="hint">✓ {pesan.teks}</p> : null}
      </section>

      <section className="card">
        <h2>Impor (ganti data)</h2>
        <p className="hint">
          Pilih file cadangan OrgaPlan (.json). Data akan divalidasi dulu, lalu{' '}
          <strong>mengganti seluruh data saat ini</strong> bila Anda konfirmasi.
        </p>
        <div className="inline-form" style={{ marginTop: 10 }}>
          <input
            ref={inputRef}
            id="imp-file"
            className="input input-inline"
            type="file"
            accept="application/json,.json"
            onChange={pilihFile}
          />
        </div>

        {fileInfo ? (
          <div className="form-panel" style={{ marginTop: 12 }}>
            <h3 className="form-title">{fileInfo.name}</h3>
            <div className="stats">
              <span className="stat">Ukuran: {formatKB(fileInfo.size)}</span>
              {fileInfo.parsed ? <span className="stat">{ringkas(fileInfo.parsed)}</span> : null}
            </div>
            {fileInfo.parsed ? (
              <p className="hint">
                Kegiatan di file: {fileInfo.parsed.kegiatan.slice(0, 4).map((k) => k.name).join(', ') || '—'}
                {fileInfo.parsed.kegiatan.length > 4 ? ', …' : ''}
              </p>
            ) : null}
            {fileInfo.error ? (
              <p className="error">✗ {fileInfo.error}</p>
            ) : (
              <p className="hint">✓ File valid — siap diimpor.</p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={impor}
                disabled={!fileInfo.parsed}
              >
                Impor & ganti data
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>Reset ke data contoh</h2>
        <p className="hint">Mengembalikan seluruh data ke seed bawaan aplikasi.</p>
        <div className="form-actions">
          <button type="button" className="btn btn-danger" onClick={reset}>
            Muat ulang data contoh
          </button>
        </div>
      </section>

      {pesan ? (
        <p className={pesan.tipe === 'ok' ? 'hint' : 'error'}>
          {pesan.tipe === 'ok' ? '✓ ' : '✗ '}
          {pesan.teks}
        </p>
      ) : null}
    </div>
  );
}
