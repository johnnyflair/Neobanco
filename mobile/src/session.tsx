// Sesión compartida: cualquier pantalla puede cerrar sesión sin pasar props por toda la navegación.
import { createContext, useContext } from 'react';

type Session = {
  signOut: () => void;
  /** Demo para visitantes (solo mirar). */
  demo?: boolean;
  /** Sale de la demo y lleva a abrir la cuenta. */
  openAccount?: () => void;
};
export const SessionContext = createContext<Session>({ signOut: () => {} });
export const useSession = () => useContext(SessionContext);
