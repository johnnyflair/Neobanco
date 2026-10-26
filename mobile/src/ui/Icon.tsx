// Íconos de línea del prototipo (mismos trazos SVG), para que la App y el diseño aprobado coincidan.
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '../theme';

export type IconName =
  | 'home' | 'card' | 'grow' | 'chat' | 'phone' | 'bank' | 'pull' | 'qr' | 'back' | 'chev' | 'check'
  | 'lock' | 'eye' | 'eyeOff' | 'share' | 'receipt' | 'file' | 'star' | 'send' | 'swap' | 'copy' | 'cash' | 'hands' | 'pig' | 'chevDown' | 'chevUp';

const stroke = { fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function shapes(name: IconName, c: string) {
  const p = { ...stroke, stroke: c };
  switch (name) {
    case 'home':
      return <Path {...p} d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" />;
    case 'card':
      return (
        <>
          <Rect {...p} x={3} y={5} width={18} height={14} rx={2} />
          <Path {...p} d="M3 10h18M7 15h3" />
        </>
      );
    case 'grow':
      return <Path {...p} d="M4 18l6-6 4 4 6-8M15 8h5v5" />;
    case 'chat':
      return <Path {...p} d="M4 5h16v11H9l-5 4z" />;
    case 'phone':
      return (
        <>
          <Rect {...p} x={7} y={3} width={10} height={18} rx={2} />
          <Path {...p} d="M11 18h2" />
        </>
      );
    case 'bank':
      return <Path {...p} d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18" />;
    case 'pull':
      return <Path {...p} d="M12 3v11M7 9l5 5 5-5M4 17v3h16v-3" />;
    case 'qr':
      return (
        <>
          <Rect {...p} x={4} y={4} width={6} height={6} />
          <Rect {...p} x={14} y={4} width={6} height={6} />
          <Rect {...p} x={4} y={14} width={6} height={6} />
          <Path {...p} d="M14 14h3v3h3M20 20h-3" />
        </>
      );
    case 'back':
      return <Path {...p} strokeWidth={2} d="M15 5l-7 7 7 7" />;
    case 'chev':
      return <Path {...p} strokeWidth={2} d="M9 5l7 7-7 7" />;
    case 'check':
      return <Path {...p} strokeWidth={2.6} d="M5 12l5 5 9-10" />;
    case 'lock':
      return (
        <>
          <Rect {...p} x={5} y={11} width={14} height={10} rx={2} />
          <Path {...p} d="M8 11V8a4 4 0 0 1 8 0v3" />
        </>
      );
    case 'eye':
      return (
        <>
          <Path {...p} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <Circle {...p} cx={12} cy={12} r={3} />
        </>
      );
    case 'eyeOff':
      return <Path {...p} d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.5-.5 4.9-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2" />;
    case 'share':
      return <Path {...p} d="M12 15V3M8 7l4-4 4 4M6 11H5v10h14V11h-1" />;
    case 'receipt':
      return <Path {...p} d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />;
    case 'file':
      return <Path {...p} d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" />;
    case 'star':
      return <Path {...p} d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />;
    case 'send':
      return <Path {...p} d="M21 3L3 11l7 3 3 7zM10 14l11-11" />;
    case 'swap':
      return <Path {...p} d="M7 7h13l-4-4M17 17H4l4 4" />;
    case 'cash':
      return (
        <>
          <Rect {...p} x={3} y={6} width={18} height={12} rx={2} />
          <Circle {...p} cx={12} cy={12} r={2.5} />
        </>
      );
    // Manos con corazón (capital social: ser parte de la cooperativa) y chanchito (ahorros),
    // trazos de Tabler Icons (MIT), igual que el mockup aprobado.
    case 'hands':
      return (
        <>
          <Path {...p} d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572" />
          <Path {...p} d="M12 6l-3.293 3.293a1 1 0 0 0 0 1.414l.543 .543c.69 .69 1.81 .69 2.5 0l1 -1a3.182 3.182 0 0 1 4.5 0l2.25 2.25" />
          <Path {...p} d="M12.5 15.5l2 2M15 13l2 2" />
        </>
      );
    case 'pig':
      return (
        <>
          <Path {...p} d="M15 11v.01" />
          <Path {...p} d="M5.173 8.378a3 3 0 1 1 4.656 -1.377" />
          <Path {...p} d="M16 4v3.803a6.019 6.019 0 0 1 2.658 3.197h1.341a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-1.342c-.336 .95 -.907 1.8 -1.658 2.473v2.027a1.5 1.5 0 0 1 -3 0v-.583a6.04 6.04 0 0 1 -1 .083h-4a6.04 6.04 0 0 1 -1 -.083v.583a1.5 1.5 0 0 1 -3 0v-2.027a6 6 0 0 1 4 -10.473h2.5l4.5 -3z" />
        </>
      );
    case 'chevDown':
      return <Path {...p} strokeWidth={2} d="M6 9l6 6 6-6" />;
    case 'chevUp':
      return <Path {...p} strokeWidth={2} d="M6 15l6-6 6 6" />;
    case 'copy':
      return (
        <>
          <Rect {...p} x={8} y={8} width={12} height={12} rx={2} />
          <Path {...p} d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
        </>
      );
  }
}

export function Icon({ name, size = 22, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {shapes(name, color)}
    </Svg>
  );
}
