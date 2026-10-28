// Hoja que sube desde abajo con los datos de una cuenta para recibir dinero (opción A aprobada):
// titular, IBAN, cuenta cliente y SINPE Móvil (solo colones), sin saldo. Se copian con un toque
// o se comparten por WhatsApp, por el menú del teléfono o como QR.
import { useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { api } from '../api/client';
import { errorMessage } from '../api/hooks';
import type { Account, AccountDetail } from '../api/types';
import { dayMonth, formatIban, formatPhone, money } from '../format';
import { colors } from '../theme';
import { BottomSheet } from '../ui/BottomSheet';
import { Text } from '../ui/typography';
import { Icon } from '../ui/Icon';
import { Btn, ErrorText, Small } from '../ui/kit';

type Props = {
  account: Account | null;
  sinpePhone?: string;
  onClose: () => void;
  onMovements?: (a: Account) => void;
};

export function AccountSheet({ account, sinpePhone, onClose, onMovements }: Props) {
  const nav = useNavigation();
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    setDetail(null);
    setError(null);
    setShowQr(false);
    if (!account) return;
    api.account(account.id).then(setDetail, (e) => setError(errorMessage(e)));
  }, [account]);

  const isCrc = account?.currency === 'CRC';
  const shareable = account?.type === 'savings';
  const title = !account
    ? ''
    : account.type === 'savings'
      ? isCrc
        ? 'Cuenta colones'
        : 'Cuenta dólares'
      : account.name;
  const SUBTITLE: Record<string, string> = {
    savings: `Ahorro a la vista · ${account?.currency ?? ''}`,
    capital: 'Tu aporte como asociado',
    envelope: 'Sobre a la vista · sacás cuando querés',
    term: 'Ahorro a plazo',
  };
  const phone = isCrc && sinpePhone ? formatPhone(sinpePhone) : null;
  const iban = detail?.iban ? formatIban(detail.iban) : null;

  const text = detail
    ? [
        'Mis datos para transferirme:',
        detail.holder_name ?? '',
        `${title} (${account?.currency})`,
        ...(iban ? [`IBAN: ${iban}`] : []),
        ...(detail.client_account ? [`Cuenta cliente: ${detail.client_account}`] : []),
        ...(phone ? [`SINPE Móvil: ${phone}`] : []),
      ].join('\n')
    : '';

  async function copy(label: string, value: string) {
    await Clipboard.setStringAsync(value);
    setCopied(label);
    setTimeout(() => setCopied((c) => (c === label ? null : c)), 1800);
  }

  const cur = (account?.currency ?? 'CRC') as 'CRC' | 'USD';
  const ON_MATURITY: Record<string, string> = { renew: 'Se renueva', to_account: 'Pasa a tu cuenta', to_envelope: 'Pasa a un sobre' };
  const goal = Number(detail?.goal_amount ?? 0);
  // Cuentas que no reciben dinero (capital, sobres, plazos): sus datos propios, sin compartir.
  const infoRows: { label: string; value: string; raw?: string }[] = !detail
    ? []
    : detail.type === 'capital'
      ? [
          { label: 'Aportado', value: money(detail.balance, cur) },
          ...(detail.monthly_contribution ? [{ label: 'Aporte mensual', value: money(detail.monthly_contribution, cur) }] : []),
          { label: 'Titular', value: detail.holder_name ?? '' },
        ]
      : detail.type === 'envelope'
        ? [
            { label: 'Ahorrado', value: money(detail.balance, cur) },
            ...(goal ? [{ label: 'Meta', value: `${money(goal, cur)} · ${Math.min(100, Math.round((Number(detail.balance) / goal) * 100))}%` }] : []),
            ...(detail.savings_mode ? [{ label: 'Forma de ahorrar', value: detail.savings_mode }] : []),
            ...(detail.rate ? [{ label: 'Tasa', value: `${Number(detail.rate)}% anual` }] : []),
          ]
        : [
            { label: 'Monto', value: money(detail.balance, cur) },
            ...(detail.rate ? [{ label: 'Tasa', value: `${Number(detail.rate)}% anual · ${detail.term_months} meses` }] : []),
            ...(detail.maturity_date ? [{ label: 'Vence', value: dayMonth(detail.maturity_date) }] : []),
            ...(detail.on_maturity ? [{ label: 'Al vencer', value: ON_MATURITY[detail.on_maturity] ?? detail.on_maturity }] : []),
          ];

  const rows: { label: string; value: string; raw?: string }[] = !shareable
    ? infoRows
    : detail
    ? [
        { label: 'Titular', value: detail.holder_name ?? '' },
        ...(iban ? [{ label: 'IBAN', value: iban, raw: detail.iban ?? '' }] : []),
        ...(detail.client_account
          ? [
              {
                label: 'Cuenta cliente',
                value: detail.client_account,
                raw: detail.client_account,
              },
            ]
          : []),
        ...(phone ? [{ label: 'SINPE Móvil', value: phone, raw: sinpePhone }] : []),
      ]
    : [];

  return (
    <BottomSheet visible={account !== null} onClose={onClose}>
      <View style={st.head}>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>{title}</Text>
          <Small>{SUBTITLE[account?.type ?? 'savings']}</Small>
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar">
          <Icon name="x" size={22} color={colors.muted} />
        </Pressable>
      </View>

      {!detail && !error && <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />}
      <ErrorText>{error}</ErrorText>

      {detail && showQr && (
        <View style={st.qrBox}>
          <QRCode value={text} size={190} color={colors.navy} backgroundColor={colors.white} />
          <Small center style={{ marginTop: 10 }}>
            Al escanearlo se ven estos mismos datos, listos para copiar.
          </Small>
        </View>
      )}

      {detail &&
        !showQr &&
        rows.map((r) => (
          <View key={r.label} style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={st.k}>{r.label}</Text>
              <Text style={st.v} selectable>
                {r.value}
              </Text>
            </View>
            {r.raw && (
              <Pressable
                onPress={() => copy(r.label, r.raw!)}
                style={st.copy}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Copiar ${r.label}`}
              >
                <Icon name={copied === r.label ? 'check' : 'copy'} size={19} color={colors.primary} />
              </Pressable>
            )}
          </View>
        ))}

      {detail && !shareable && (
        <>
          {detail.type === 'envelope' && (
            <Btn
              label="Meter o sacar dinero"
              icon="swap"
              onPress={() => {
                onClose();
                nav.navigate('Envelope', { account: detail });
              }}
            />
          )}
          {onMovements && account && <Btn label="Ver movimientos" variant="o" onPress={() => onMovements(account)} />}
        </>
      )}

      {detail && shareable && (
        <>
          <Btn
            label="Compartir por WhatsApp"
            icon="chat"
            onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`)}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn
              label="Otros"
              icon="share"
              variant="o"
              onPress={() => Share.share({ message: text })}
              style={{ flex: 1 }}
            />
            <Btn
              label={showQr ? 'Ver datos' : 'Ver QR'}
              icon={showQr ? 'file' : 'qr'}
              variant="o"
              onPress={() => setShowQr((v) => !v)}
              style={{ flex: 1 }}
            />
          </View>
          {onMovements && account && (
            <Btn label="Ver movimientos" variant="l" onPress={() => onMovements(account)} />
          )}
        </>
      )}
    </BottomSheet>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 19, fontWeight: '700', color: colors.ink },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  k: { fontSize: 12, color: colors.muted },
  v: {
    fontSize: 15.5,
    fontWeight: '600',
    color: colors.ink,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  copy: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrBox: {
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
