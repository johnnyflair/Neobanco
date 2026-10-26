// Secciones del prototipo que todavía no están construidas en la App (Invertir, Ayuda).
import { useRoute } from '@react-navigation/native';

import { Screen, Small } from '../ui/kit';

export function ComingSoonScreen() {
  const route = useRoute();
  const title = route.name === 'Grow' ? 'Invertir' : 'Ayuda';
  return (
    <Screen title={title} back={false}>
      <Small>Esta sección ya está diseñada en el prototipo y se construye en la próxima etapa.</Small>
    </Screen>
  );
}
