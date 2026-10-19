import { useState } from 'react';
import { useApp } from '../store/useApp';
import { isWorkingDay } from '../utils/workingCalendar';
import { addCalendarDays, dayNameShort, isValidISO, monthName, todayISO } from '../utils/dateUtils';

const HARI = [
  { idx: 0, nama: 'Minggu' },
  { idx: 1, nama: 'Senin' },
  { idx: 2, nama: 'Selasa' },
  { idx: 3, nama: 'Rabu' },
  { idx: 4, nama: 'Kamis' },
  { idx: 5, nama: 'Jumat' },
  { idx: 6, nama: 'Sabtu' },
];

export function KalenderView() {
  const { state, dispatch } = useApp();
  const [tanggalBaru, setTanggalBaru] = useState('');
  const [err, setErr] = useState('');

  const { workingDays, holidays } = state.kalender;

  const toggleHari = (idx: number) => {
    const ada = workingDays.includes(idx);
    const berikut = ada ? workingDays.filter((d) => d !== idx) : [...workingDays, idx].sort((a, b) => a - b);
    if (berikut.length === 0) {
      setErr('Minimal satu hari kerja harus tetap aktif.');
      return;
    }
    setErr('');
    dispatch({ type: 'UPDATE_KALENDER', payload: { workingDays: berikut, holidays } });
  };

  const tambahLibur = () => {
    if (!isValidISO(tanggalBaru)) {
      setErr('Pilih tanggal libur yang valid.');
      return;
    }
    if (holidays.includes(tanggalBaru)) {
      setErr('Tanggal tersebut sudah masuk daftar libur.');
      return;
    }
    setErr('');
    dispatch({
      type: 'UPDATE_KALENDER',
      payload: { workingDays, holidays: [...holidays, tanggalBaru].sort() },
    });
    setTanggalBaru('');
  };

  const hapusLibur = (t: string) => {
    setErr('');
    dispatch({ type: 'UPDATE_KALENDER', payload: { workingDays, holidays: holidays.filter((h) => h !== t) } });
  };

  // Pratinjau 14 hari ke depan agar dampak pengaturan langsung terlihat.
  const hariIni = todayISO();
  const pratinjau = Array.from({ length: 14 }, (_, i) => addCalendarDays(hariIni, i));

  return (
    <div className="view">
      <section className="card">
        <div className="toolbar">
          <h2>Kalender hari kerja</h2>
        </div>
        <p className="hint">
          Hari kerja menentukan perhitungan durasi, jadwal, Gantt, Critical Path, dan PERT. Hari
          libur menimpa hari kerja.
        </p>

        <div className="field" style={{ marginTop: 8 }}>
          <label>Hari kerja dalam seminggu</label>
          <div className="day-toggles">
            {HARI.map((h) => {
              const aktif = workingDays.includes(h.idx);
              return (
                <button
                  key={h.idx}
                  type="button"
                  className={aktif ? 'day-toggle on' : 'day-toggle'}
                  aria-pressed={aktif}
                  onClick={() => toggleHari(h.idx)}
                >
                  {h.nama.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="hol-date">Hari libur tambahan</label>
          <div className="inline-form">
            <input
              id="hol-date"
              className="input input-inline"
              type="date"
              value={tanggalBaru}
              onChange={(e) => setTanggalBaru(e.target.value)}
            />
            <button type="button" className="btn btn-primary" onClick={tambahLibur}>
              Tambah libur
            </button>
          </div>
        </div>

        {holidays.length === 0 ? (
          <p className="empty">Belum ada hari libur tambahan.</p>
        ) : (
          <div className="holiday-list">
            {holidays.map((h) => (
              <span className="holiday-chip" key={h}>
                {dayNameShort(h)}, {h} ({monthName(h)})
                <button
                  type="button"
                  className="holiday-remove"
                  aria-label={`Hapus libur ${h}`}
                  onClick={() => hapusLibur(h)}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {err ? <p className="error">{err}</p> : null}
      </section>

      <section className="card">
        <h2>
          Pratinjau 14 hari <span className="count">{workingDays.length} hari kerja/minggu</span>
        </h2>
        <div className="calendar-preview">
          {pratinjau.map((d) => {
            const kerja = isWorkingDay(d, state.kalender);
            const libur = holidays.includes(d);
            return (
              <div
                key={d}
                className={
                  kerja ? 'cal-cell work' : libur ? 'cal-cell holiday' : 'cal-cell off'
                }
                title={
                  libur ? 'Hari libur (kalender)' : kerja ? 'Hari kerja' : 'Bukan hari kerja'
                }
              >
                <span className="cal-day">{dayNameShort(d)}</span>
                <span className="cal-date">{d.slice(5)}</span>
                <span className="cal-tag">
                  {libur ? 'Libur' : kerja ? 'Kerja' : 'Libur akhir pekan'}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
