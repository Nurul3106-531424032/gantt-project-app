import { useMemo, useState } from 'react';
import { useApp } from '../store/useApp';
import { computeSchedule } from '../utils/scheduler';
import { pathProbability, pertForPath, pertForTask, round2 } from '../utils/pert';
import { workingDaysInclusive } from '../utils/workingCalendar';
import { isValidISO } from '../utils/dateUtils';
import type { Tugas } from '../types';

interface EditState {
  optimistic: string;
  mostLikely: string;
  pessimistic: string;
}

export function PertView() {
  const { state, dispatch } = useApp();
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState<EditState>({ optimistic: '', mostLikely: '', pessimistic: '' });
  const [err, setErr] = useState('');
  const [targetDate, setTargetDate] = useState('');

  const kal = state.kalender;
  const schedule = useMemo(
    () => computeSchedule(state.tugas, state.dependensi, kal),
    [state.tugas, state.dependensi, kal],
  );

  const mulaiEdit = (t: Tugas) => {
    setEditId(t.id);
    setF({
      optimistic: t.pert ? String(t.pert.optimistic) : String(t.duration),
      mostLikely: t.pert ? String(t.pert.mostLikely) : String(t.duration),
      pessimistic: t.pert ? String(t.pert.pessimistic) : String(t.duration),
    });
    setErr('');
  };

  const batal = () => {
    setEditId(null);
    setErr('');
  };

  const simpan = () => {
    if (editId === null) return;
    const o = Number(f.optimistic);
    const m = Number(f.mostLikely);
    const p = Number(f.pessimistic);
    if (![o, m, p].every((n) => Number.isFinite(n) && n >= 0)) {
      setErr('Semua estimasi harus angka ≥ 0.');
      return;
    }
    if (!(o <= m && m <= p)) {
      setErr('Urutan harus: optimis ≤ paling mungkin ≤ pesimis.');
      return;
    }
    const task = state.tugas.find((t) => t.id === editId);
    if (!task) return;
    dispatch({
      type: 'UPDATE_TUGAS',
      payload: { ...task, pert: { optimistic: o, mostLikely: m, pessimistic: p } },
    });
    setEditId(null);
    setErr('');
  };

  const hapusPert = () => {
    if (editId === null) return;
    const task = state.tugas.find((t) => t.id === editId);
    if (!task) return;
    const { pert: _pert, ...tanpaPert } = task;
    dispatch({ type: 'UPDATE_TUGAS', payload: tanpaPert });
    setEditId(null);
    setErr('');
  };

  // ── Jalur kritis + agregasi PERT ──
  const criticalTasks = schedule.ok
    ? schedule.criticalIds
        .map((id) => state.tugas.find((t) => t.id === id))
        .filter((t): t is Tugas => t !== undefined)
    : [];
  const pathEst = pertForPath(criticalTasks);

  const efektifTarget =
    targetDate && isValidISO(targetDate)
      ? targetDate
      : (schedule.projectEnd ?? '');
  const tHari =
    schedule.ok && schedule.projectStart && efektifTarget
      ? Math.max(0, workingDaysInclusive(schedule.projectStart, efektifTarget, kal))
      : 0;
  const prob = pathEst && efektifTarget ? pathProbability(pathEst, tHari) : null;

  const adaPert = state.tugas.some((t) => t.pert);

  return (
    <div className="view">
      <section className="card">
        <div className="toolbar">
          <h2>
            PERT <span className="count">{adaPert ? `${state.tugas.filter((t) => t.pert).length} tugas ber-estimate` : 'belum ada estimasi'}</span>
          </h2>
        </div>
        <p className="hint">
          TE = (O + 4M + P) / 6 · Varians = ((P − O) / 6)² · satuan hari kerja. Tugas tanpa
          estimasi PERT dihitung memakai durasi tetap (varians 0).
        </p>

        {state.tugas.length === 0 ? (
          <p className="empty">Belum ada tugas.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tugas</th>
                  <th>Durasi</th>
                  <th>O</th>
                  <th>M</th>
                  <th>P</th>
                  <th>TE</th>
                  <th>Varian</th>
                  <th>σ</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {state.tugas.map((t) => {
                  const est = pertForTask(t);
                  const kritis = schedule.tasks.get(t.id)?.isCritical === true;
                  const sedangEdit = editId === t.id;
                  return (
                    <tr key={t.id} className={kritis ? 'row-critical' : undefined}>
                      <td className="strong">
                        {t.name}
                        {kritis ? <span className="badge-critical">★ kritis</span> : null}
                      </td>
                      <td>{t.duration} hari</td>
                      {sedangEdit ? (
                        <td colSpan={3}>
                          <div className="pert-inputs">
                            <input
                              className="input"
                              type="number"
                              min={0}
                              value={f.optimistic}
                              onChange={(e) => setF({ ...f, optimistic: e.target.value })}
                              aria-label={`Optimis ${t.name}`}
                            />
                            <input
                              className="input"
                              type="number"
                              min={0}
                              value={f.mostLikely}
                              onChange={(e) => setF({ ...f, mostLikely: e.target.value })}
                              aria-label={`Paling mungkin ${t.name}`}
                            />
                            <input
                              className="input"
                              type="number"
                              min={0}
                              value={f.pessimistic}
                              onChange={(e) => setF({ ...f, pessimistic: e.target.value })}
                              aria-label={`Pesimis ${t.name}`}
                            />
                          </div>
                        </td>
                      ) : (
                        <>
                          <td>{t.pert ? t.pert.optimistic : '—'}</td>
                          <td>{t.pert ? t.pert.mostLikely : '—'}</td>
                          <td>{t.pert ? t.pert.pessimistic : '—'}</td>
                        </>
                      )}
                      <td className="strong">{est ? round2(est.te) : t.duration}</td>
                      <td>{est ? round2(est.variance) : '0'}</td>
                      <td>{est ? round2(est.stdDev) : '0'}</td>
                      <td>
                        <div className="row-actions">
                          {sedangEdit ? (
                            <>
                              <button type="button" className="btn btn-sm btn-primary" onClick={simpan}>
                                Simpan
                              </button>
                              <button type="button" className="btn btn-sm" onClick={batal}>
                                Batal
                              </button>
                              {t.pert ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-danger"
                                  onClick={hapusPert}
                                >
                                  Hapus PERT
                                </button>
                              ) : null}
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => mulaiEdit(t)}
                            >
                              {t.pert ? 'Edit' : 'Tambah PERT'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {err ? <p className="error">{err}</p> : null}
      </section>

      <section className="card">
        <h2>
          Jalur kritis & probabilitas{' '}
          <span className="count">{criticalTasks.length} tugas</span>
        </h2>
        {!schedule.ok ? (
          <p className="error">⚠ Siklus dependensi — jalur kritis tidak bisa dihitung.</p>
        ) : criticalTasks.length === 0 ? (
          <p className="empty">Belum ada jalur kritis (tidak ada tugas).</p>
        ) : (
          <>
            <ol className="critical-chain">
              {criticalTasks.map((t) => (
                <li key={t.id}>
                  <span className="chip">{t.duration} hari</span> {t.name}
                  {t.pert ? <span className="hint"> (ada estimasi PERT)</span> : null}
                </li>
              ))}
            </ol>

            {pathEst ? (
              <div className="stats" style={{ marginTop: 10 }}>
                <span className="stat">TE jalur: {round2(pathEst.te)} hari kerja</span>
                <span className="stat">Varian jalur: {round2(pathEst.variance)}</span>
                <span className="stat">σ jalur: {round2(pathEst.stdDev)} hari</span>
                <span className="stat">Durasi awal (CPM): {schedule.projectDuration} hari kerja</span>
              </div>
            ) : null}

            <div className="form-actions" style={{ marginTop: 14 }}>
              <div className="field">
                <label htmlFor="pert-target">Target selesai (tanggal)</label>
                <input
                  id="pert-target"
                  className="input input-inline"
                  type="date"
                  value={efektifTarget}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
              </div>
              {prob !== null ? (
                <p className="prob-result">
                  Probabilitas selesai ≤ {efektifTarget}:{' '}
                  <strong>{round2(prob * 100)}%</strong>
                  <span className="hint"> (dari {tHari} hari kerja sejak {schedule.projectStart})</span>
                </p>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
