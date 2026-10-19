import { useEffect, useReducer, type ReactNode } from 'react';
import { AppContext } from './context';
import { loadState, saveState } from './persistence';
import { appReducer } from './reducer';

/**
 * Penyedia state global OrgaPlan.
 * - Saat mount: memuat data dari localStorage (fallback seed bila belum ada/rusak).
 * - Setiap perubahan state: otomatis disimpan kembali ke localStorage.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}
