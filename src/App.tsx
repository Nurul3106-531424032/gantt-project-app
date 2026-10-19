import { useCallback, useEffect, useState } from 'react';
import { AppProvider } from './store/AppContext';
import { useApp } from './store/useApp';
import { STORAGE_KEY } from './store/persistence';
import { DashboardView } from './views/DashboardView';
import { AnggotaView } from './views/AnggotaView';
import { KegiatanView } from './views/KegiatanView';
import { TugasView } from './views/TugasView';
import { DependensiView } from './views/DependensiView';
import { KalenderView } from './views/KalenderView';
import { GanttView } from './views/GanttView';
import { PertView } from './views/PertView';
import { DataView } from './views/DataView';
import './App.css';

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/** Daftar tab navigasi. `id` = fragmen URL (#gantt, dst.) agar bisa dibuka langsung. */
const VIEWS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'anggota', label: 'Anggota' },
  { id: 'kegiatan', label: 'Kegiatan' },
  { id: 'tugas', label: 'Tugas' },
  { id: 'dependensi', label: 'Dependensi' },
  { id: 'kalender', label: 'Kalender' },
  { id: 'gantt', label: 'Gantt Chart' },
  { id: 'pert', label: 'PERT & Kritis' },
  { id: 'data', label: 'Data & Cadangan' },
] as const;

type ViewId = (typeof VIEWS)[number]['id'];

function viewFromHash(): ViewId {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const found = VIEWS.find((v) => v.id === raw);
  return found ? found.id : 'dashboard';
}

function TopBar() {
  const { state, dispatch } = useApp();
  const hariKerja = state.kalender.workingDays.map((d) => HARI[d] ?? String(d)).join(', ');
  return (
    <header className="topbar">
      <div className="stats">
        <span className="stat">{state.anggota.length} anggota</span>
        <span className="stat">{state.kegiatan.length} kegiatan</span>
        <span className="stat">{state.tugas.length} tugas</span>
        <span className="stat">{state.dependensi.length} dependensi</span>
        <span className="stat">
          Hari kerja: {hariKerja} · {state.kalender.holidays.length} libur
        </span>
      </div>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => {
          if (window.confirm('Ganti data saat ini dengan data contoh? Data tersimpan akan ditimpa.')) {
            dispatch({ type: 'RESET_TO_SEED' });
          }
        }}
      >
        Muat ulang data contoh
      </button>
    </header>
  );
}

function Shell() {
  const [view, setView] = useState<ViewId>(viewFromHash);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((id: ViewId) => {
    if (window.location.hash.replace(/^#\/?/, '') !== id) {
      window.location.hash = id; // memicu hashchange → setView
    } else {
      setView(id);
    }
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            OP
          </span>
          <span className="brand-text">
            <strong>OrgaPlan</strong>
            <small>Organisasi Mahasiswa</small>
          </span>
        </div>
        <nav className="nav" aria-label="Navigasi utama">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={view === v.id ? 'nav-btn active' : 'nav-btn'}
              aria-current={view === v.id ? 'page' : undefined}
              onClick={() => go(v.id)}
            >
              {v.label}
            </button>
          ))}
        </nav>
        <p className="sidebar-note">Tersimpan otomatis di browser</p>
      </aside>
      <div className="main">
        <TopBar />
        <main className="content">
          {view === 'dashboard' ? <DashboardView /> : null}
          {view === 'anggota' ? <AnggotaView /> : null}
          {view === 'kegiatan' ? <KegiatanView /> : null}
          {view === 'tugas' ? <TugasView /> : null}
          {view === 'dependensi' ? <DependensiView /> : null}
          {view === 'kalender' ? <KalenderView /> : null}
          {view === 'gantt' ? <GanttView /> : null}
          {view === 'pert' ? <PertView /> : null}
          {view === 'data' ? <DataView /> : null}
        </main>
        <footer className="app-footer shell-footer">
          OrgaPlan · data tersimpan di <code>{STORAGE_KEY}</code>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
