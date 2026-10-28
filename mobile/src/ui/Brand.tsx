// Piezas de la marca Kooa: el logo, los ojos (con sus expresiones) y el subrayado lima.
// Los ojos son exactamente las dos "o" del logo: misma separación, grosor y cejas; solo cambia
// la posición de las cejas. Siempre llevan la sombra larga, en un tono del fondo donde van.
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

import { colors } from '../theme';
import { FONT, Text } from './typography';

export type Expression = 'contenta' | 'guau' | 'picara' | 'firme';

const BROWS: Record<Expression, [string, string]> = {
  contenta: ['M61,33 Q74,22 87,33', 'M105,33 Q118,22 131,33'],
  guau: ['M61,26 Q74,15 87,26', 'M105,26 Q118,15 131,26'],
  picara: ['M61,32 L87,32', 'M105,28 Q118,15 132,22'],
  firme: ['M60,34 L88,30', 'M104,30 L132,34'],
};

// La sombra larga se arma repitiendo la figura desplazada 1 px en diagonal, tres veces (opción B:
// corta, para que la sombra de una "o" no se meta en la otra ni la de las cejas toque los aros).
const SHADOW_STEPS = [1, 2, 3];

// Área de dibujo de los ojos (incluye la sombra): 106 × 82 unidades.
const EYES_BOX = { x: 46, y: 8, w: 106, h: 82 };

function Rings({ color }: { color: string }) {
  return (
    <>
      <Circle cx={74} cy={60} r={15.5} fill="none" stroke={color} strokeWidth={9} />
      <Circle cx={118} cy={60} r={15.5} fill="none" stroke={color} strokeWidth={9} />
    </>
  );
}

function Brows({ expression, color }: { expression: Expression; color: string }) {
  const [l, r] = BROWS[expression];
  return (
    <>
      <Path d={l} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" />
      <Path d={r} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" />
    </>
  );
}

type EyesProps = {
  /** Ancho en px; el alto sale de la proporción. */
  size: number;
  expression?: Expression;
  color?: string;
  browColor?: string;
  shadowColor?: string | null;
  /** Las cejas se levantan cada pocos segundos, como saludando (bienvenida). */
  greet?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function KooaEyes({
  size,
  expression = 'contenta',
  color = colors.teal,
  browColor = colors.primary,
  shadowColor = colors.shadowOnWhite,
  greet = false,
  style,
}: EyesProps) {
  const h = (size * EYES_BOX.h) / EYES_BOX.w;
  const vb = `${EYES_BOX.x} ${EYES_BOX.y} ${EYES_BOX.w} ${EYES_BOX.h}`;
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!greet) return;
    const up = (-7 * size) / EYES_BOX.w;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2000),
        Animated.timing(lift, { toValue: up, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.delay(380),
        Animated.timing(lift, { toValue: 0, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [greet, lift, size]);

  return (
    <View style={[{ width: size, height: h }, style]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={h} viewBox={vb} style={StyleSheet.absoluteFill}>
        {shadowColor &&
          SHADOW_STEPS.map((d) => (
            <G key={d} transform={`translate(${d} ${d})`}>
              <Rings color={shadowColor} />
            </G>
          ))}
        <Rings color={color} />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: lift }] }]}>
        <Svg width={size} height={h} viewBox={vb}>
          {shadowColor &&
            SHADOW_STEPS.map((d) => (
              <G key={d} transform={`translate(${d} ${d})`}>
                <Brows expression={expression} color={shadowColor} />
              </G>
            ))}
          <Brows expression={expression} color={browColor} />
        </Svg>
      </Animated.View>
    </View>
  );
}

type LogoProps = {
  /** Alto en px; el ancho sale de la proporción. */
  height: number;
  color?: string;
  browColor?: string;
  shadowColor?: string | null;
};

function Wordmark({ color, browColor }: { color: string; browColor: string }) {
  return (
    <>
      <SvgText x={30} y={80} textAnchor="middle" fontFamily={FONT.semibold} fontSize={80} fill={color}>
        k
      </SvgText>
      <Rings color={color} />
      <SvgText x={162} y={80} textAnchor="middle" fontFamily={FONT.semibold} fontSize={80} fill={color}>
        a
      </SvgText>
      <Brows expression="contenta" color={browColor} />
    </>
  );
}

/** El logo completo "kooa". Las cejas son siempre las del logo oficial (contenta). */
export function KooaLogo({ height, color = colors.teal, browColor = colors.primary, shadowColor = colors.shadowOnWhite }: LogoProps) {
  const w = (height * 210) / 100;
  return (
    <Svg width={w} height={height} viewBox="0 0 210 100" accessibilityLabel="Kooa" accessibilityRole="image">
      {shadowColor &&
        SHADOW_STEPS.map((d) => (
          <G key={d} transform={`translate(${d} ${d})`}>
            <Wordmark color={shadowColor} browColor={shadowColor} />
          </G>
        ))}
      <Wordmark color={color} browColor={browColor} />
    </Svg>
  );
}

/** Texto con el subrayado lima de marca (montos, el eslogan, el nombre al celebrar). */
export function Highlight({ children, style, align = 'center' }: { children: ReactNode; style?: StyleProp<TextStyle>; align?: 'center' | 'flex-start' }) {
  const fs = (StyleSheet.flatten(style)?.fontSize as number | undefined) ?? 16;
  return (
    <View style={{ alignSelf: align }}>
      <View
        style={{
          position: 'absolute',
          left: -3,
          right: -3,
          bottom: fs * 0.12,
          height: fs * 0.36,
          backgroundColor: colors.lime,
          borderRadius: 3,
        }}
      />
      <Text style={style}>{children}</Text>
    </View>
  );
}

/** Logo blanco con cejas lima para poner sobre la tarjeta (sombra en el tono del fondo). */
export function CardLogo({ kind }: { kind: 'debit' | 'credit' }) {
  return <KooaLogo height={26} color={colors.white} browColor={colors.lime} shadowColor={kind === 'debit' ? colors.shadowOnTeal : colors.shadowOnNavy} />;
}

/** Cara de la tarjeta Kooa: teal (débito) o navy (crédito), con los ojos grandes de marca de agua
 *  en la parte de arriba, tono sobre tono y sin sombra (opción C), lejos del número. */
export function KooaCardFace({
  kind,
  style,
  children,
  accessibilityLabel,
}: {
  kind: 'debit' | 'credit';
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  accessibilityLabel?: string;
}) {
  const debit = kind === 'debit';
  return (
    <View
      style={[{ backgroundColor: debit ? colors.teal : colors.navy, overflow: 'hidden' }, style]}
      accessibilityLabel={accessibilityLabel}
    >
      <KooaEyes
        size={220}
        color={debit ? '#125A54' : '#16244F'}
        browColor={debit ? '#125A54' : '#16244F'}
        shadowColor={null}
        style={{ position: 'absolute', right: -30, top: -40 }}
      />
      {children}
    </View>
  );
}

/** Chip dorado y símbolo de pago sin contacto, como en la tarjeta aprobada. */
export function CardChip({ kind }: { kind: 'debit' | 'credit' }) {
  const wave = kind === 'debit' ? '#BFD9D6' : '#A9B3D1';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessible={false}>
      <View style={{ width: 40, height: 30, borderRadius: 6, backgroundColor: '#D9C27A' }} />
      <Svg width={24} height={24} viewBox="0 0 24 24">
        <Path
          d="M8 7a7 7 0 0 1 0 10M12 5a10 10 0 0 1 0 14M16 3a13 13 0 0 1 0 18"
          fill="none"
          stroke={wave}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
