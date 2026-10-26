// Tokens de diseño aprobados en el prototipo (paleta "Sustainable / eco-friendly").
export const colors = {
  navy: '#0D1B45',
  emerald: '#3FA592',
  primary: '#17806C', // botones: esmeralda oscuro (contraste AA con texto blanco)
  primaryPress: '#0F6E56',
  primarySoft: '#E1F5EE',
  primaryInk: '#085041',
  lime: '#00E676', // solo acentos, nunca con texto blanco encima
  orange: '#E8742E',
  ink: '#0D1B45',
  muted: '#667085',
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
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 24 };

export const type = {
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.ink },
  itemTitle: { fontSize: 15, fontWeight: '600' as const, color: colors.ink },
  itemSub: { fontSize: 12, color: colors.muted },
  amount: { fontSize: 14, fontWeight: '600' as const, color: colors.ink, fontVariant: ['tabular-nums' as const] },
};

// Borde con destello de la tarjeta "Mis cuentas" (al 50 % de intensidad, como se aprobó).
export const accountsGlow = ['rgba(0,230,118,0.5)', 'rgba(23,128,108,0.5)', 'rgba(13,27,69,0.5)', 'rgba(232,116,46,0.5)'] as const;
