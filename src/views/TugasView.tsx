import { useMemo, useState, type FormEvent } from 'react';
import { useApp } from '../store/useApp';
import { computeSchedule } from '../utils/scheduler';
import type { Tugas } from '../types';

interface FormState {
  name: string;
  description: string;
  activityId: string;
  parentId: string;
  assigneeId: string;
  duration: string;
  startDate: string;
  progress: string;
  pertO: string;
  pertM: string;
  pertP: string;
}

const KOSONG: FormState = {
  name: '',
  description: '',
  activityId: '',
  parentId: '',
  assigneeId: '',
  duration: '1',
  startDate: '',
  progress: '0',
  pertO: '',
  pertM: '',
  pertP: '',
};

/** true bila `candidateParentId` adalah diri sendiri atau turunan dari `childId` (mencegah siklus parent). */
function merupakanTurunan(tugas: Tugas[], candidateParentId: string, childId: string): boolean {
  let cur: string | undefined = candidateParentId;
  const seen = new Set<string>();
  while (cur !== undefined && !seen.has(cur)) {
    if (cur === childId) return true;
    seen.add(cur);
    cur = tugas.find((t) => t.id === cur)?.parentId;
  }
  return false;
}

export function TugasView() {
  const { state, dispatch } = useApp();
  const [buka, setBuka] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState<FormState>(KOSONG);
  const [err, setErr] = useState('');
  const [filterKegiatan, setFilterKegiatan] = useState('');

  const schedule = useMemo(
    () => computeSchedule(state.tugas, state.dependensi, state.kalender),
    [state.tugas, state.dependensi, state.kalender],
  );

  const tugasTampil = filterKegiatan
    ? state.tugas.filter((t) => t.activityId === filterKegiatan)
    : state.tugas;

  const namaKegiatan = (id: string) => state.kegiatan.find((k) => k.id === id)?.name ?? '?';
  const namaAnggota = (id?: string) =>
    (id && state.anggota.find((a) => a.id === id)?.name) || 'Belum ditentukan';

  const mulaiTambah = () => {
    setEditId(null);
    setF({
      ...KOSONG,
      activityId: filterKegiatan || state.kegiatan[0]?.id || '',
      assigneeId: state.anggota[0]?.id ?? '',
    });
    setErr('');
    setBuka(true);
  };

  const mulaiEdit = (t: Tugas) => {
    setEditId(t.id);
    setF({
      name: t.name,
      description: t.description ?? '',
      activityId: t.activityId,
      parentId: t.parentId ?? '',
      assigneeId: t.assigneeId ?? '',
      duration: String(t.duration),
      startDate: t.startDate ?? '',
      progress: String(t.progress ?? 0),
      pertO: t.pert ? String(t.pert.optimistic) : '',
      pertM: t.pert ? String(t.pert.mostLikely) : '',
      pertP: t.pert ? String(t.pert.pessimistic) : '',
    });
    setErr('');
    setBuka(true);
  };

  const batal = () => {
    setBuka(false);
    setErr('');
  };

  const pilihKegiatanForm = (activityId: string) => {
    // Induk harus se-kegiatan → bila pindah kegiatan, lepas induk yang tidak cocok.
    const indukOk =
      f.parentId &&
      state.tugas.some((t) => t.id === f.parentId && t.activityId === activityId);
    setF({ ...f, activityId, parentId: indukOk ? f.parentId : '' });
  };

  const simpan = (e: FormEvent) => {
    e.preventDefault();
    const name = f.name.trim();
    if (!name) {
      setErr('Nama tugas wajib diisi.');
      return;
    }
    if (!state.kegiatan.some((k) => k.id === f.activityId)) {
      setErr('Pilih kegiatan induk.');
      return;
    }
    const durasiNum = Number(f.duration);
    if (!Number.isFinite(durasiNum) || durasiNum < 1) {
      setErr('Durasi minimal 1 hari kerja.');
      return;
    }
    const progressNum = Math.min(100, Math.max(0, Number(f.progress) || 0));

    // PERT: kosong semua = tanpa PERT; terisi sebagian = error; lengkap = validasi O ≤ M ≤ P.
    const adaPert = f.pertO !== '' || f.pertM !== '' || f.pertP !== '';
    let pert: { optimistic: number; mostLikely: number; pessimistic: number } | undefined;
    if (adaPert) {
      if (f.pertO === '' || f.pertM === '' || f.pertP === '') {
        setErr('Estimasi PERT harus lengkap (optimis, paling mungkin, pesimis) atau dikosongkan.');
        return;
      }
      const o = Number(f.pertO);
      const m = Number(f.pertM);
      const p = Number(f.pertP);
      if (![o, m, p].every((n) => Number.isFinite(n) && n >= 0)) {
        setErr('Estimasi PERT harus angka ≥ 0.');
        return;
      }
      if (!(o <= m && m <= p)) {
        setErr('Estimasi PERT harus berurutan: optimis ≤ paling mungkin ≤ pesimis.');
        return;
      }
      pert = { optimistic: o, mostLikely: m, pessimistic: p };
    }

    const payload: Omit<Tugas, 'id'> & { id?: string } = {
      name,
      description: f.description.trim() || undefined,
      activityId: f.activityId,
      duration: Math.round(durasiNum),
      progress: progressNum,
      ...(f.parentId ? { parentId: f.parentId } : {}),
      ...(f.assigneeId ? { assigneeId: f.assigneeId } : {}),
      ...(f.startDate ? { startDate: f.startDate } : {}),
      ...(pert ? { pert } : {}),
    };

    if (editId) {
      dispatch({ type: 'UPDATE_TUGAS', payload: { ...payload, id: editId } });
    } else {
      dispatch({ type: 'ADD_TUGAS', payload });
    }
    setBuka(false);
    setErr('');
  };

  const hapus = (t: Tugas) => {
    const anak = state.tugas.filter((x) => x.parentId === t.id).length;
    const pesan = anak
      ? `Hapus "${t.name}"? ${anak} sub-tugas turunannya ikut terhapus.`
      : `Hapus tugas "${t.name}"?`;
    if (window.confirm(pesan)) dispatch({ type: 'DELETE_TUGAS', payload: { id: t.id } });
  };

  // Opsi induk: se-kegiatan, bukan diri sendiri, bukan turunan (anti-siklus).
  const opsiInduk = state.tugas.filter(
    (t) =>
      t.activityId === f.activityId &&
      t.id !== editId &&
      (editId === null || !merupakanTurunan(state.tugas, t.id, editId)),
  );

  return (
    <div className="view">
      <section className="card">
        <div className="toolbar">
          <h2>
            Tugas <span className="count">{state.tugas.length}</span>
          </h2>
          <div className="toolbar-actions">
            <select
              className="input input-inline"
              value={filterKegiatan}
              onChange={(e) => setFilterKegiatan(e.target.value)}
              aria-label="Filter kegiatan"
            >
              <option value="">Semua kegiatan</option>
              {state.kegiatan.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              onClick={buka ? batal : mulaiTambah}
              disabled={state.kegiatan.length === 0}
            >
              {buka ? 'Tutup form' : '+ Tambah tugas'}
            </button>
          </div>
        </div>

        {state.kegiatan.length === 0 ? (
          <p className="empty">Buat kegiatan dulu di tab Kegiatan — tugas harus punya induk kegiatan.</p>
        ) : null}

        {buka ? (
          <form className="form-panel" onSubmit={simpan}>
            <h3 className="form-title">{editId ? 'Edit tugas' : 'Tambah tugas'}</h3>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="t-name">Nama tugas *</label>
                <input
                  id="t-name"
                  className="input"
                  value={f.name}
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                  placeholder="mis. Pemesanan tempat"
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="t-keg">Kegiatan induk *</label>
                <select
                  id="t-keg"
                  className="input"
                  value={f.activityId}
                  onChange={(e) => pilihKegiatanForm(e.target.value)}
                >
                  {state.kegiatan.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="t-parent">Induk tugas (sub-tugas)</label>
                <select
                  id="t-parent"
                  className="input"
                  value={f.parentId}
                  onChange={(e) => setF({ ...f, parentId: e.target.value })}
                >
                  <option value="">— Tugas utama (bukan sub-tugas) —</option>
                  {opsiInduk.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="t-pj">Penanggung jawab</label>
                <select
                  id="t-pj"
                  className="input"
                  value={f.assigneeId}
                  onChange={(e) => setF({ ...f, assigneeId: e.target.value })}
                >
                  <option value="">— Belum ditentukan —</option>
                  {state.anggota.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="t-dur">Durasi (hari kerja) *</label>
                <input
                  id="t-dur"
                  className="input"
                  type="number"
                  min={1}
                  max={365}
                  value={f.duration}
                  onChange={(e) => setF({ ...f, duration: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="t-start">Tanggal mulai (opsional)</label>
                <input
                  id="t-start"
                  className="input"
                  type="date"
                  value={f.startDate}
                  onChange={(e) => setF({ ...f, startDate: e.target.value })}
                />
                <span className="hint">Kosong = mengikuti dependensi & jadwal proyek.</span>
              </div>
              <div className="field">
                <label htmlFor="t-prog">Progres (%)</label>
                <input
                  id="t-prog"
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  value={f.progress}
                  onChange={(e) => setF({ ...f, progress: e.target.value })}
                />
              </div>
              <div className="field field-wide">
                <label htmlFor="t-desc">Deskripsi</label>
                <textarea
                  id="t-desc"
                  className="input"
                  rows={2}
                  value={f.description}
                  onChange={(e) => setF({ ...f, description: e.target.value })}
                />
              </div>
              <div className="field field-wide">
                <label>Estimasi PERT (hari kerja) — opsional</label>
                <div className="pert-inputs">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    placeholder="Optimis (O)"
                    value={f.pertO}
                    onChange={(e) => setF({ ...f, pertO: e.target.value })}
                    aria-label="Optimis"
                  />
                  <input
                    className="input"
                    type="number"
                    min={0}
                    placeholder="Paling mungkin (M)"
                    value={f.pertM}
                    onChange={(e) => setF({ ...f, pertM: e.target.value })}
                    aria-label="Paling mungkin"
                  />
                  <input
                    className="input"
                    type="number"
                    min={0}
                    placeholder="Pesimis (P)"
                    value={f.pertP}
                    onChange={(e) => setF({ ...f, pertP: e.target.value })}
                    aria-label="Pesimis"
                  />
                </div>
              </div>
            </div>
            {err ? <p className="error">{err}</p> : null}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editId ? 'Simpan perubahan' : 'Tambah'}
              </button>
              <button type="button" className="btn" onClick={batal}>
                Batal
              </button>
            </div>
          </form>
        ) : null}

        {tugasTampil.length === 0 ? (
          <p className="empty">Belum ada tugas{filterKegiatan ? ' pada kegiatan ini' : ''}.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tugas</th>
                  <th>Kegiatan</th>
                  <th>PJ</th>
                  <th>Durasi</th>
                  <th>Mulai (hitung)</th>
                  <th>Selesai (hitung)</th>
                  <th>Progres</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {tugasTampil.map((t) => {
                  const s = schedule.tasks.get(t.id);
                  return (
                    <tr key={t.id}>
                      <td className="strong">
                        {t.parentId ? <span className="indent" aria-hidden="true">└ </span> : null}
                        {t.name}
                        {t.parentId ? <span className="badge-sub">sub</span> : null}
                        {s?.isCritical ? (
                          <span className="badge-critical" title="Jalur kritis">
                            ★ kritis
                          </span>
                        ) : null}
                      </td>
                      <td>{namaKegiatan(t.activityId)}</td>
                      <td>{namaAnggota(t.assigneeId)}</td>
                      <td>{t.duration} hari</td>
                      <td>{s ? s.startDate : '—'}</td>
                      <td>{s ? s.endDate : '—'}</td>
                      <td>
                        <div className="progress-mini" title={`${t.progress ?? 0}%`}>
                          <div
                            className="progress-mini-fill"
                            style={{ width: `${Math.min(100, Math.max(0, t.progress ?? 0))}%` }}
                          />
                        </div>
                        {t.progress ?? 0}%
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => mulaiEdit(t)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => hapus(t)}
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!schedule.ok ? (
          <p className="error">⚠ Siklus dependensi terdeteksi — periksa tab Dependensi.</p>
        ) : null}
      </section>
    </div>
  );
}
