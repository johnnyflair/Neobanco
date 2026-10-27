// "Transferir dinero": enviar (SINPE Móvil, IBAN) y traer (de mi cuenta en otro banco, recibir).
import { useNavigation } from '@react-navigation/native';

import { api } from '../../api/client';
import { useLoad } from '../../api/hooks';
import { Row, Screen, Sect } from '../../ui/kit';
import { Frequents } from './SinpeScreens';

export function TransferHubScreen() {
  const nav = useNavigation();
  const recent = useLoad(api.sinpeRecent);
  return (
    <Screen title="Transferir dinero">
      <Sect first>Enviar</Sect>
      <Row icon="phone" title="SINPE Móvil" sub="A un número de celular, al instante" onPress={() => nav.navigate('SinpeNumber')} first />
      <Row icon="bank" title="Cuenta IBAN" sub="A cualquier cuenta en otro banco o cooperativa" onPress={() => nav.navigate('Iban')} />
      <Sect>Traer</Sect>
      <Row
        icon="pull"
        title="Traer de mi cuenta en otro banco"
        sub="Pasá plata de tu BAC, BN, BCR o Popular a esta cuenta"
        onPress={() => nav.navigate('Pull')}
        first
      />
      <Row icon="qr" title="Recibir dinero" sub="Compartí tu número o IBAN" onPress={() => nav.navigate('Receive')} />
      {recent.data && recent.data.length > 0 && (
        <>
          <Sect>Frecuentes</Sect>
          <Frequents contacts={recent.data} onPick={(c) => nav.navigate('SendAmount', { kind: 'sinpe', to: c.phone, name: c.name, isNew: false })} />
        </>
      )}
    </Screen>
  );
}
