import { createContext, type Dispatch } from 'react';
import type { AppState } from '../types';
import type { Action } from './reducer';

export interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<Action>;
}

/** Context global OrgaPlan. Diimpor oleh AppProvider dan useApp. */
export const AppContext = createContext<AppContextValue | null>(null);
