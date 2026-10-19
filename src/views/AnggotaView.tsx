import { useState, type FormEvent } from 'react';
import { useApp } from '../store/useApp';
import type { Anggota } from '../types';

const KOSONG = { name: '', email: '', role: '', division: '' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SARAN_ROLE = ['Ketua', 'Sekretaris', 'Bendahara', 'Koordinator', 'Anggota'];

export function AnggotaView() {
  const { state, dispatch } = useApp();
  const [buka, setBuka] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState(KOSONG);
  const [err, setErr] = useState('');

  const divisiSaran = [...new Set(state.anggota.map((a) => a.division).filter(Boolean))];

  const mulaiTambah = () => {
    setEditId(null);
    setF(KOSONG);
    setErr('');
    setBuka(true);
  };

  const mulaiEdit = (a: Anggota) => {
    setEditId(a.id);
    setF({ name: a.name, email: a.email, role: a.role, division: a.division });
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
    const email = f.email.trim();
    if (!name || !email) {
      setErr('Nama dan email wajib diisi.');
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setErr('Format email tidak valid (contoh: nama@kampus.ac.id).');
      return;
    }
    const duplikat = state.anggota.some(
      (a) => a.id !== editId && a.email.toLowerCase() === email.toLowerCase(),
    );
    if (duplikat) {
      setErr('Email sudah dipakai anggota lain.');
      return;
    }
    if (editId) {
      dispatch({
        type: 'UPDATE_ANGGOTA',
        payload: { id: editId, name, email, role: f.role.trim(), division: f.division.trim() },
      });
    } else {
      dispatch({
        type: 'ADD_ANGGOTA',
        payload: { name, email, role: f.role.trim(), division: f.division.trim() },
      });
    }
    setBuka(false);
    setErr('');
  };

  const hapus = (a: Anggota) => {
    const alokasi = state.tugas.filter((t) => t.assigneeId === a.id).length;
    const pesan =
      alokasi > 0
        ? `Hapus "${a.name}"? ${alokasi} tugas akan kehilangan penanggung jawab.`
        : `Hapus anggota "${a.name}"?`;
    if (window.confirm(pesan)) dispatch({ type: 'DELETE_ANGGOTA', payload: { id: a.id } });
  };

  const jumlahTugas = (id: string) => state.tugas.filter((t) => t.assigneeId === id).length;

  return (
    <div className="view">
      <section className="card">
        <div className="toolbar">
          <h2>
            Anggota <span className="count">{state.anggota.length}</span>
          </h2>
          <button type="button" className="btn btn-primary" onClick={buka ? batal : mulaiTambah}>
            {buka ? 'Tutup form' : '+ Tambah anggota'}
          </button>
        </div>

        {buka ? (
          <form className="form-panel" onSubmit={simpan}>
            <h3 className="form-title">{editId ? 'Edit anggota' : 'Tambah anggota'}</h3>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="a-name">Nama lengkap *</label>
                <input
                  id="a-name"
                  className="input"
                  value={f.name}
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                  placeholder="mis. Rizky Ramadhan"
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="a-email">Email *</label>
                <input
                  id="a-email"
                  className="input"
                  type="email"
                  value={f.email}
                  onChange={(e) => setF({ ...f, email: e.target.value })}
                  placeholder="nama@kampus.ac.id"
                />
              </div>
              <div className="field">
                <label htmlFor="a-role">Jabatan</label>
                <input
                  id="a-role"
                  className="input"
                  list="daftar-role"
                  value={f.role}
                  onChange={(e) => setF({ ...f, role: e.target.value })}
                  placeholder="mis. Koordinator"
                />
                <datalist id="daftar-role">
                  {SARAN_ROLE.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="a-div">Divisi</label>
                <input
                  id="a-div"
                  className="input"
                  list="daftar-div"
                  value={f.division}
                  onChange={(e) => setF({ ...f, division: e.target.value })}
                  placeholder="mis. Divisi Acara"
                />
                <datalist id="daftar-div">
                  {divisiSaran.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
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

        {state.anggota.length === 0 ? (
          <p className="empty">Belum ada anggota. Tekan “+ Tambah anggota” untuk memulai.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Jabatan</th>
                <th>Divisi</th>
                <th>Alokasi tugas</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {state.anggota.map((a) => (
                <tr key={a.id}>
                  <td className="strong">{a.name}</td>
                  <td>{a.email}</td>
                  <td>
                    <span className="chip">{a.role || '—'}</span>
                  </td>
                  <td>{a.division || '—'}</td>
                  <td>{jumlahTugas(a.id)} tugas</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn btn-sm" onClick={() => mulaiEdit(a)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => hapus(a)}
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {state.anggota.length <= 1 ? (
          <p className="hint">Minimal satu anggota wajib ada agar tiap kegiatan tetap punya PJ.</p>
        ) : null}
      </section>
    </div>
  );
}
