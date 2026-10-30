// Íconos de línea del prototipo (mismos trazos SVG), para que la App y el diseño aprobado coincidan.
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '../theme';

export type IconName =
  | 'home' | 'card' | 'grow' | 'chat' | 'phone' | 'bank' | 'pull' | 'qr' | 'back' | 'chev' | 'check'
  | 'lock' | 'eye' | 'eyeOff' | 'share' | 'receipt' | 'file' | 'star' | 'send' | 'swap' | 'copy' | 'cash' | 'hands' | 'pig' | 'chevDown' | 'chevUp' | 'x'
  | 'bolt' | 'drop' | 'wifi' | 'search' | 'tv' | 'car' | 'school' | 'shield' | 'building' | 'gift' | 'heart' | 'calendar' | 'user' | 'logout' | 'alert' | 'clock' | 'plus' | 'minus'
  | 'arrowUp' | 'arrowDown' | 'snowflake' | 'sliders' | 'settings' | 'medal' | 'crown' | 'backspace' | 'bell' | 'dots' | 'trash';

const stroke = { fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function shapes(name: IconName, c: string) {
  const p = { ...stroke, stroke: c };
  switch (name) {
    case 'medal':
      return <Path {...p} d="M9 3h6l-2 5h-2zM8 3l2.5 5M16 3l-2.5 5M12 21a6 6 0 1 0 0-12a6 6 0 0 0 0 12zM12 12.5l1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.4 2-.3z" />;
    case 'crown':
      return <Path {...p} d="M12 6l4 6 5-4-2 10H5L3 8l5 4zM5 21h14" />;
    case 'arrowUp':
      return <Path {...p} d="M12 5v14M18 11l-6-6M6 11l6-6" />;
    case 'arrowDown':
      return <Path {...p} d="M12 5v14M18 13l-6 6M6 13l6 6" />;
    case 'snowflake':
      return <Path {...p} d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 6l2.5-1.5M9.5 19.5L12 18l2.5 1.5M4.5 10.2l2.2 -1.3-.1-2.9M17.4 6l-.1 2.9 2.2 1.3M4.5 13.8l2.2 1.3-.1 2.9M17.4 18l-.1-2.9 2.2-1.3" />;
    case 'sliders':
      return <Path {...p} d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h11M19 18h1M12 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M15 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0" />;
    case 'settings':
      return (
        <Path
          {...p}
          d="M10.3 4.3c.4-1.8 2.9-1.8 3.4 0a1.7 1.7 0 0 0 2.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 0 0 1 2.6c1.8.4 1.8 2.9 0 3.4a1.7 1.7 0 0 0-1 2.6c.9 1.5-.8 3.3-2.4 2.4a1.7 1.7 0 0 0-2.6 1c-.4 1.8-2.9 1.8-3.4 0a1.7 1.7 0 0 0-2.6-1c-1.5.9-3.3-.8-2.4-2.4a1.7 1.7 0 0 0-1-2.6c-1.8-.4-1.8-2.9 0-3.4a1.7 1.7 0 0 0 1-2.6c-.9-1.5.8-3.3 2.4-2.4 1 .6 2.3.1 2.6-1.1M9 12a3 3 0 1 0 6 0a3 3 0 0 0-6 0"
        />
      );
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
    case 'backspace':
      return (
        <>
          <Path {...p} d="M21 5H8l-6 7 6 7h13a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" />
          <Path {...p} d="M17 9l-5 5M12 9l5 5" />
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
    case 'trash':
      return <Path {...p} d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />;
    case 'bell':
      return <Path {...p} d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6M9 17v1a3 3 0 0 0 6 0v-1" />;
    case 'dots':
      return <Path {...p} d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3.2} />;
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
    case 'bolt':
      return <Path {...p} d="M13 3l-7 11h6l-1 7 7-11h-6z" />;
    case 'drop':
      return <Path {...p} d="M12 3.5s-6 6.5-6 10.5a6 6 0 0 0 12 0c0-4-6-10.5-6-10.5z" />;
    case 'wifi':
      return <Path {...p} d="M2 9a14 14 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01" />;
    case 'search':
      return (
        <>
          <Circle {...p} cx={11} cy={11} r={6.5} />
          <Path {...p} d="M20 20l-4.3-4.3" />
        </>
      );
    case 'tv':
      return (
        <>
          <Rect {...p} x={3} y={7} width={18} height={13} rx={2} />
          <Path {...p} d="M8 3l4 4 4-4" />
        </>
      );
    case 'car':
      return <Path {...p} d="M5 16h14v-3.5L17 8H7l-2 4.5zM6.5 16v2.5M17.5 16v2.5M5 12.5h14" />;
    case 'school':
      return <Path {...p} d="M3 9l9-5 9 5-9 5zM7 11.2V16c0 1.4 2.3 3 5 3s5-1.6 5-3v-4.8M21 9v6" />;
    case 'shield':
      return <Path {...p} d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z" />;
    case 'building':
      return <Path {...p} d="M4 21V5l8-2v18M12 21h8V9l-8-2M3 21h18M8 8v.01M8 12v.01M8 16v.01M16 12v.01M16 16v.01" />;
    case 'gift':
      return (
        <>
          <Rect {...p} x={3} y={8} width={18} height={4} rx={1} />
          <Path {...p} d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C9.5 3 12 8 12 8s2.5-5 4.5-5a2.5 2.5 0 0 1 0 5" />
        </>
      );
    case 'heart':
      return <Path {...p} d="M19.5 12.6L12 20l-7.5-7.4A5 5 0 1 1 12 6a5 5 0 1 1 7.5 6.6z" />;
    case 'calendar':
      return (
        <>
          <Rect {...p} x={4} y={5} width={16} height={16} rx={2} />
          <Path {...p} d="M16 3v4M8 3v4M4 11h16" />
        </>
      );
    case 'user':
      return (
        <>
          <Circle {...p} cx={12} cy={8} r={4} />
          <Path {...p} d="M5 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1" />
        </>
      );
    case 'logout':
      return <Path {...p} d="M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2M9 12h12l-3-3M21 12l-3 3" />;
    case 'alert':
      return <Path {...p} d="M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />;
    case 'clock':
      return (
        <>
          <Circle {...p} cx={12} cy={12} r={9} />
          <Path {...p} d="M12 7v5l3 3" />
        </>
      );
    case 'plus':
      return <Path {...p} strokeWidth={2} d="M12 5v14M5 12h14" />;
    case 'minus':
      return <Path {...p} strokeWidth={2} d="M5 12h14" />;
    case 'x':
      return <Path {...p} strokeWidth={2} d="M18 6L6 18M6 6l12 12" />;
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
