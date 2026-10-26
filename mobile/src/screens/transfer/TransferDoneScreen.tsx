// Confirmación de una transferencia, con puntos ganados y opción de compartir el comprobante.
import { useNavigation } from '@react-navigation/native';
import { Share, View } from 'react-native';

import type { RootProps } from '../../navigation';
import { Btn, Done, Tag } from '../../ui/kit';

export function TransferDoneScreen({ route }: RootProps<'TransferDone'>) {
  const nav = useNavigation();
  const { title, sub, points, shareText } = route.params;
  return (
    <Done
      title={title}
      sub={sub}
      extra={
        points ? (
          <View style={{ marginTop: 8 }}>
            <Tag center>{`+${points} puntos`}</Tag>
          </View>
        ) : null
      }
    >
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        {shareText && (
          <Btn label="Compartir" variant="o" onPress={() => Share.share({ message: shareText })} style={{ flex: 1 }} />
        )}
        <Btn label="Listo" onPress={() => nav.navigate('Tabs', { screen: 'Home' })} style={{ flex: 1 }} />
      </View>
    </Done>
  );
}
