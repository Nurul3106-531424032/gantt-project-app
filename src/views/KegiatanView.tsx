import { useState, type FormEvent } from 'react';
import { useApp } from '../store/useApp';
import type { Kegiatan } from '../types';

const KOSONG = { name: '', description: '', leadId: '', division: '', color: '#2563eb' };

export function KegiatanView() {
  const { state, dispatch } = useApp();
  const [buka, setBuka] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState(KOSONG);
  const [err, setErr] = useState('');

  const divisiSaran = [...new Set(state.kegiatan.map((k) => k.division).filter(Boolean))];
  const kosongAnggota = state.anggota.length === 0;

  const mulaiTambah = () => {
    setEditId(null);
    setF({ ...KOSONG, leadId: state.anggota[0]?.id ?? '' });
    setErr('');
    setBuka(true);
  };

  const mulaiEdit = (k: Kegiatan) => {
    setEditId(k.id);
    setF({
      name: k.name,
      description: k.description ?? '',
      leadId: k.leadId,
      division: k.division,
      color: k.color ?? '#2563eb',
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
    const name = f.name.trim();
    if (!name) {
      setErr('Nama kegiatan wajib diisi.');
      return;
    }
    if (kosongAnggota) {
      setErr('Belum ada anggota — tambah anggota dulu sebelum membuat kegiatan.');
      return;
    }
    const leadValid = state.anggota.some((a) => a.id === f.leadId);
    const leadId = leadValid ? f.leadId : (state.anggota[0]?.id as string);
    if (editId) {
      dispatch({
        type: 'UPDATE_KEGIATAN',
        payload: {
          ...(state.kegiatan.find((k) => k.id === editId) as Kegiatan),
          id: editId,
          name,
          description: f.description.trim() || undefined,
          leadId,
          division: f.division.trim(),
          color: f.color,
        },
      });
    } else {
      dispatch({
        type: 'ADD_KEGIATAN',
        payload: {
          name,
          description: f.description.trim() || undefined,
          leadId,
          division: f.division.trim(),
          color: f.color,
        },
      });
    }
    setBuka(false);
    setErr('');
  };

  const hapus = (k: Kegiatan) => {
    const jumlah = state.tugas.filter((t) => t.activityId === k.id).length;
    const pesan =
      jumlah > 0
        ? `Hapus kegiatan "${k.name}"? ${jumlah} tugas dan dependensinya ikut terhapus.`
        : `Hapus kegiatan "${k.name}"?`;
    if (window.confirm(pesan)) dispatch({ type: 'DELETE_KEGIATAN', payload: { id: k.id } });
  };

  const findName = (id?: string) =>
    (id && state.anggota.find((a) => a.id === id)?.name) || 'Belum ditentukan';

  return (
    <div className="view">
      <section className="card">
        <div className="toolbar">
          <h2>
            Kegiatan <span className="count">{state.kegiatan.length}</span>
          </h2>
          <button type="button" className="btn btn-primary" onClick={buka ? batal : mulaiTambah}>
            {buka ? 'Tutup form' : '+ Tambah kegiatan'}
          </button>
        </div>

        {buka ? (
          <form className="form-panel" onSubmit={simpan}>
            <h3 className="form-title">{editId ? 'Edit kegiatan' : 'Tambah kegiatan'}</h3>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="k-name">Nama kegiatan *</label>
                <input
                  id="k-name"
                  className="input"
                  value={f.name}
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                  placeholder="mis. Seminar Nasional"
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="k-lead">Penanggung jawab utama *</label>
                <select
                  id="k-lead"
                  className="input"
                  value={f.leadId}
                  onChange={(e) => setF({ ...f, leadId: e.target.value })}
                  disabled={kosongAnggota}
                >
                  {state.anggota.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {a.role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="k-div">Divisi</label>
                <input
                  id="k-div"
                  className="input"
                  list="daftar-div-keg"
                  value={f.division}
                  onChange={(e) => setF({ ...f, division: e.target.value })}
                  placeholder="mis. Divisi Acara"
                />
                <datalist id="daftar-div-keg">
                  {divisiSaran.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="k-color">Warna bar Gantt</label>
                <input
                  id="k-color"
                  className="input input-color"
                  type="color"
                  value={f.color}
                  onChange={(e) => setF({ ...f, color: e.target.value })}
                />
              </div>
              <div className="field field-wide">
                <label htmlFor="k-desc">Deskripsi</label>
                <textarea
                  id="k-desc"
                  className="input"
                  rows={2}
                  value={f.description}
                  onChange={(e) => setF({ ...f, description: e.target.value })}
                  placeholder="Singkat tentang kegiatan ini…"
                />
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

        {state.kegiatan.length === 0 ? (
          <p className="empty">Belum ada kegiatan{kosongAnggota ? ' (tambah anggota dulu)' : ''}.</p>
        ) : (
          <div className="cards">
            {state.kegiatan.map((k) => {
              const tugasKegiatan = state.tugas.filter((t) => t.activityId === k.id);
              return (
                <article className="kegiatan-card" key={k.id}>
                  <div className="kegiatan-head">
                    <span
                      className="dot"
                      style={{ background: k.color ?? 'var(--accent)' }}
                      aria-hidden="true"
                    />
                    <h3>{k.name}</h3>
                  </div>
                  {k.description ? <p className="desc">{k.description}</p> : null}
                  <div className="kegiatan-meta">
                    <span className="chip">PJ Utama: {findName(k.leadId)}</span>
                    <span className="chip">{k.division || 'Tanpa divisi'}</span>
                    <span className="chip">{tugasKegiatan.length} tugas</span>
                  </div>
                  <div className="row-actions card-actions">
                    <button type="button" className="btn btn-sm" onClick={() => mulaiEdit(k)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => hapus(k)}
                    >
                      Hapus
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
