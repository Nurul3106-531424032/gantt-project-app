import { useContext } from 'react';
import { AppContext, type AppContextValue } from './context';

/**
 * Ambil state + dispatch aplikasi.
 * Wajib dipakai di dalam <AppProvider>; jika tidak, akan melempar error yang jelas.
 */
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (ctx === null) {
    throw new Error('useApp() harus dipakai di dalam <AppProvider>');
  }
  return ctx;
}
