import { useState, type FormEvent } from 'react';
import { useApp } from '../store/useApp';
import { checkDependency } from '../store/reducer';
import { dependencyIssueMessage } from '../utils/dependencies';
import type { DependencyType, Dependensi } from '../types';

interface FormState {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lag: string;
}

const KOSONG: FormState = { predecessorId: '', successorId: '', type: 'FS', lag: '0' };

export function DependensiView() {
  const { state, dispatch } = useApp();
  const [buka, setBuka] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState<FormState>(KOSONG);
  const [err, setErr] = useState('');

  const namaTugas = (id: string) => state.tugas.find((t) => t.id === id)?.name ?? '(terhapus)';

  // Validasi live: tampilkan alasan bila kandidat tidak valid.
  const issueLive =
    buka && f.predecessorId && f.successorId
      ? checkDependency(
          state,
          { predecessorId: f.predecessorId, successorId: f.successorId },
          editId ?? undefined,
        )
      : null;

  const mulaiTambah = () => {
    setEditId(null);
    setF({
      ...KOSONG,
      predecessorId: state.tugas[0]?.id ?? '',
      successorId: state.tugas[1]?.id ?? state.tugas[0]?.id ?? '',
    });
    setErr('');
    setBuka(true);
  };

  const mulaiEdit = (d: Dependensi) => {
    setEditId(d.id);
    setF({
      predecessorId: d.predecessorId,
      successorId: d.successorId,
      type: d.type,
      lag: String(d.lag ?? 0),
    });
    setErr('');
    setBuka(true);
  };

  const batal = () => {
    setBuka(false);
    setErr('');
  };

  const simpan = (e: FormEvent) => {
    e.preventDefault();
    if (!f.predecessorId || !f.successorId) {
      setErr('Pilih tugas pendahulu dan tugas penerima.');
      return;
    }
    const lagNum = Number(f.lag || '0');
    if (!Number.isFinite(lagNum) || lagNum < 0) {
      setErr('Lag harus angka ≥ 0 hari kerja.');
      return;
    }
    const issue = checkDependency(
      state,
      { predecessorId: f.predecessorId, successorId: f.successorId },
      editId ?? undefined,
    );
    if (issue) {
      setErr(dependencyIssueMessage(issue));
      return;
    }
    const payload = {
      predecessorId: f.predecessorId,
      successorId: f.successorId,
      type: f.type,
      lag: Math.trunc(lagNum),
    };
    if (editId) {
      dispatch({ type: 'UPDATE_DEPENDENSI', payload: { ...payload, id: editId } });
    } else {
      dispatch({ type: 'ADD_DEPENDENSI', payload });
    }
    setBuka(false);
    setErr('');
  };

  const hapus = (d: Dependensi) => {
    if (
      window.confirm(
        `Hapus dependensi "${namaTugas(d.predecessorId)}" → "${namaTugas(d.successorId)}"?`,
      )
    ) {
      dispatch({ type: 'DELETE_DEPENDENSI', payload: { id: d.id } });
    }
  };

  const tipeLabel = (t: DependencyType) =>
    t === 'FS' ? 'FS — selesai → mulai' : 'SS — mulai → mulai';

  return (
    <div className="view">
      <section className="card">
        <div className="toolbar">
          <h2>
            Dependensi <span className="count">{state.dependensi.length}</span>
          </h2>
          <button
            type="button"
            className="btn btn-primary"
            onClick={buka ? batal : mulaiTambah}
            disabled={state.tugas.length < 2 && !buka}
          >
            {buka ? 'Tutup form' : '+ Tambah dependensi'}
          </button>
        </div>

        <p className="hint">
          Hubungan antar tugas: <strong>FS</strong> (penerima mulai setelah pendahulu selesai) atau{' '}
          <strong>SS</strong> (penerima mulai bersamaan pendahulu), dengan jeda lag opsional.
          Siklus ditolak otomatis.
        </p>

        {state.tugas.length < 2 ? (
          <p className="empty">Minimal 2 tugas diperlukan untuk membuat dependensi.</p>
        ) : null}

        {buka ? (
          <form className="form-panel" onSubmit={simpan}>
            <h3 className="form-title">{editId ? 'Edit dependensi' : 'Tambah dependensi'}</h3>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="d-pred">Tugas pendahulu *</label>
                <select
                  id="d-pred"
                  className="input"
                  value={f.predecessorId}
                  onChange={(e) => setF({ ...f, predecessorId: e.target.value })}
                >
                  <option value="">— Pilih tugas —</option>
                  {state.tugas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="d-succ">Tugas penerima *</label>
                <select
                  id="d-succ"
                  className="input"
                  value={f.successorId}
                  onChange={(e) => setF({ ...f, successorId: e.target.value })}
                >
                  <option value="">— Pilih tugas —</option>
                  {state.tugas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="d-type">Tipe hubungan</label>
                <select
                  id="d-type"
                  className="input"
                  value={f.type}
                  onChange={(e) => setF({ ...f, type: e.target.value as DependencyType })}
                >
                  <option value="FS">FS — selesai → mulai</option>
                  <option value="SS">SS — mulai → mulai</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="d-lag">Lag (hari kerja)</label>
                <input
                  id="d-lag"
                  className="input"
                  type="number"
                  min={0}
                  value={f.lag}
                  onChange={(e) => setF({ ...f, lag: e.target.value })}
                />
              </div>
            </div>
            {issueLive ? (
              <p className="error">✗ {dependencyIssueMessage(issueLive)}</p>
            ) : null}
            {err ? <p className="error">{err}</p> : null}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={issueLive !== null}>
                {editId ? 'Simpan perubahan' : 'Tambah'}
              </button>
              <button type="button" className="btn" onClick={batal}>
                Batal
              </button>
            </div>
          </form>
        ) : null}

        {state.dependensi.length === 0 ? (
          <p className="empty">Belum ada dependensi — tugas akan dijadwalkan bebas paralel.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Pendahulu</th>
                  <th />
                  <th>Penerima</th>
                  <th>Tipe</th>
                  <th>Lag</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {state.dependensi.map((d) => (
                  <tr key={d.id}>
                    <td className="strong">{namaTugas(d.predecessorId)}</td>
                    <td aria-hidden="true" className="dep-arrow">
                      →
                    </td>
                    <td className="strong">{namaTugas(d.successorId)}</td>
                    <td>
                      <span className={d.type === 'FS' ? 'chip chip-fs' : 'chip chip-ss'}>
                        {d.type}
                      </span>
                      <span className="hint"> {d.type === 'FS' ? 'selesai→mulai' : 'mulai→mulai'}</span>
                    </td>
                    <td>{d.lag ? `${d.lag} hari` : '0'}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => mulaiEdit(d)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => hapus(d)}
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">Contoh: {tipeLabel('FS')}</p>
      </section>
    </div>
  );
}
