// Sesión compartida: cualquier pantalla puede cerrar sesión sin pasar props por toda la navegación.
import { createContext, useContext } from 'react';

export const SessionContext = createContext<{ signOut: () => void }>({ signOut: () => {} });
export const useSession = () => useContext(SessionContext);
