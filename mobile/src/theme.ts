// Tokens de diseño de Kooa (marca aprobada: logo con ojos, "Dinero con buena cara").
// Reglas: fondo blanco siempre; el lima es solo acento (cejas, puntos, subrayados); el naranja
// solo para puntos y préstamos; los botones principales van en esmeralda.
export const colors = {
  navy: '#0D1B45',
  teal: '#0B4F4A', // color de la marca: logo, ojos, tarjeta de débito
  emerald: '#3FA592',
  primary: '#17806C', // botones: esmeralda oscuro (contraste AA con texto blanco)
  primaryPress: '#0F6E56',
  primarySoft: '#E1F5EE',
  primaryInk: '#085041',
  lime: '#C6F432', // acento de marca: nunca con texto blanco encima, nunca como fondo de pantalla
  limeSoft: '#F1FBD6',
  limeInk: '#3D4D06',
  orange: '#E8742E',
  ink: '#0D1B45',
  muted: '#475467', // texto de apoyo: gris oscuro (contraste ~7:1, pensado en vista cansada)
  line: '#E6E8EE',
  card: '#F5F7FA',
  white: '#FFFFFF',
  danger: '#A32D2D',
  dangerSoft: '#FCEBEB',
  emeraldDark: '#0F6E56',
  mint: '#E1F5EE',
  amberBg: '#FAEEDA',
  amberFg: '#633806',
  fieldBorder: '#CBD2DC',
  optOn: '#F7FCFA',
  whatsapp: '#DCF8C6',
  heroSub: '#9FE1CB',
  orangeSoft: '#FCEFE6', // fondo del acceso a préstamos (naranja de la paleta)
  orangeInk: '#B85A1F',
  amount: '#344054', // todos los montos: gris muy oscuro, para leerse como dinero y no como texto
  // Sombra larga de los ojos y el logo: siempre un tono del mismo fondo.
  shadowOnWhite: '#D3EFE6',
  shadowOnTeal: '#073A36',
  shadowOnNavy: '#070F2B',
  tealWatermark: '#17655F',
  navyWatermark: '#1E2C5A',
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 24 };

export const type = {
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.ink },
  itemTitle: { fontSize: 16, fontWeight: '600' as const, color: colors.ink },
  itemSub: { fontSize: 14, color: colors.muted },
  amount: { fontSize: 16, fontWeight: '600' as const, color: colors.amount, fontVariant: ['tabular-nums' as const] },
};

/** Tope del tamaño de letra del teléfono (igual que en Trueque): con letra «enorme» la App crece
 *  hasta 25 % más que el diseño y no más, para que siga leyéndose sin deformarse. */
export const MAX_FONT_SCALE = 1.25;
/** Tope más bajo para etiquetas que deben caber en un renglón (menú, accesos rápidos). */
export const MAX_FONT_SCALE_TIGHT = 1.1;
