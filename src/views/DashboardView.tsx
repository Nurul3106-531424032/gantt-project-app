import { useMemo } from 'react';
import { useApp } from '../store/useApp';
import { computeSchedule } from '../utils/scheduler';
import { STORAGE_KEY } from '../store/persistence';
import type { Anggota, Tugas } from '../types';

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function findName(anggota: Anggota[], id?: string): string {
  if (!id) return 'Belum ditentukan';
  return anggota.find((a) => a.id === id)?.name ?? 'Belum ditentukan';
}

function AnggotaSection() {
  const { state } = useApp();
  const jumlahTugas = (id: string) => state.tugas.filter((t) => t.assigneeId === id).length;
  return (
    <section className="card">
      <h2>
        Anggota <span className="count">{state.anggota.length}</span>
      </h2>
      {state.anggota.length === 0 ? (
        <p className="empty">Belum ada anggota.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Email</th>
              <th>Jabatan</th>
              <th>Divisi</th>
              <th>Alokasi tugas</th>
            </tr>
          </thead>
          <tbody>
            {state.anggota.map((a) => (
              <tr key={a.id}>
                <td className="strong">{a.name}</td>
                <td>{a.email}</td>
                <td>
                  <span className="chip">{a.role}</span>
                </td>
                <td>{a.division}</td>
                <td>{jumlahTugas(a.id)} tugas</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function KegiatanSection() {
  const { state } = useApp();
  return (
    <section className="card">
      <h2>
        Kegiatan <span className="count">{state.kegiatan.length}</span>
      </h2>
      {state.kegiatan.length === 0 ? (
        <p className="empty">Belum ada kegiatan.</p>
      ) : (
        <div className="cards">
          {state.kegiatan.map((k) => {
            const tugasKegiatan = state.tugas.filter((t) => t.activityId === k.id);
            return (
              <article className="kegiatan-card" key={k.id}>
                <div className="kegiatan-head">
                  <span className="dot" style={{ background: k.color ?? 'var(--accent)' }} aria-hidden="true" />
                  <h3>{k.name}</h3>
                </div>
                {k.description ? <p className="desc">{k.description}</p> : null}
                <div className="kegiatan-meta">
                  <span className="chip">PJ Utama: {findName(state.anggota, k.leadId)}</span>
                  <span className="chip">{k.division || 'Tanpa divisi'}</span>
                  <span className="chip">{tugasKegiatan.length} tugas</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TaskTree({ tasks, all }: { tasks: Tugas[]; all: Tugas[] }) {
  const { state } = useApp();
  return (
    <ul className="task-list">
      {tasks.map((t) => {
        const anak = all.filter((c) => c.parentId === t.id);
        const masuk = state.dependensi.filter((d) => d.successorId === t.id);
        return (
          <li key={t.id}>
            <div className="task-item">
              <div className="task-row">
                <span className="task-name">
                  {t.name}
                  {t.parentId ? <span className="badge-sub">sub-tugas</span> : null}
                </span>
                <span className="task-duration">{t.duration} hari kerja</span>
              </div>
              <div className="task-sub">
                <span className="chip">PJ: {findName(state.anggota, t.assigneeId)}</span>
                {masuk.map((d) => {
                  const pred = state.tugas.find((x) => x.id === d.predecessorId);
                  return (
                    <span className="dep-chip" key={d.id} title={`Dependensi ${d.type}`}>
                      ← {pred?.name ?? '?'} ({d.type})
                    </span>
                  );
                })}
              </div>
            </div>
            {anak.length > 0 ? <TaskTree tasks={anak} all={all} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function TugasSection() {
  const { state } = useApp();
  return (
    <section className="card">
      <h2>
        Tugas <span className="count">{state.tugas.length}</span>
      </h2>
      {state.tugas.length === 0 ? (
        <p className="empty">Belum ada tugas.</p>
      ) : (
        state.kegiatan.map((k) => {
          const tugasKegiatan = state.tugas.filter((t) => t.activityId === k.id);
          const akar = tugasKegiatan.filter((t) => t.parentId === undefined);
          if (tugasKegiatan.length === 0) return null;
          return (
            <div className="tugas-group" key={k.id}>
              <h3 className="tugas-group-title">{k.name}</h3>
              <TaskTree tasks={akar} all={tugasKegiatan} />
            </div>
          );
        })
      )}
    </section>
  );
}

/** Ringkasan jadwal: hasil penjadwalan CPM + jalur kritis. */
function RingkasanJadwal() {
  const { state } = useApp();
  const schedule = useMemo(
    () => computeSchedule(state.tugas, state.dependensi, state.kalender),
    [state.tugas, state.dependensi, state.kalender],
  );
  if (state.tugas.length === 0) return null;
  const hariKerja = state.kalender.workingDays.map((d) => HARI[d] ?? String(d)).join(', ');
  if (!schedule.ok) {
    return (
      <section className="card">
        <h2>Ringkasan jadwal</h2>
        <p className="error">
          ⚠ Dependensi membentuk siklus — jadwal tidak bisa dihitung. Periksa tab Dependensi.
        </p>
      </section>
    );
  }
  return (
    <section className="card">
      <h2>Ringkasan jadwal</h2>
      <div className="stats">
        <span className="stat">
          Mulai: {schedule.projectStart} → Selesai: {schedule.projectEnd}
        </span>
        <span className="stat">Durasi: {schedule.projectDuration} hari kerja</span>
        <span className="stat">
          Jalur kritis: {schedule.criticalIds.length}/{state.tugas.length} tugas
        </span>
        <span className="stat">Hari kerja: {hariKerja}</span>
        <span className="stat">{state.kalender.holidays.length} hari libur</span>
      </div>
    </section>
  );
}

export function DashboardView() {
  return (
    <div className="view">
      <RingkasanJadwal />
      <AnggotaSection />
      <KegiatanSection />
      <TugasSection />
      <footer className="app-footer">
        Data tersimpan otomatis di browser (<code>{STORAGE_KEY}</code>). Muat ulang data contoh akan
        menimpa data tersimpan.
      </footer>
    </div>
  );
}
