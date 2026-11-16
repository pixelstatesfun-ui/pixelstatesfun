import { memo } from 'preact/compat';

const COLORS = {
  Bronze: ['#ffcc83', '#9c4e1b', '#542b17'],
  Silver: ['#ffffff', '#9aa5b7', '#525260'],
  Gold: ['#fff0a0', '#e08b1d', '#75400e'],
  Turquoise: ['#a4ffff', '#21b8b8', '#075c69'],
  Amethyst: ['#ffd4ff', '#bd55ff', '#571675'],
};

const LEAF_POSITIONS = [
  [14, 17], [11, 22], [9, 27], [8, 32], [9, 37], [11, 42], [14, 47],
];

function Star({ x, y, size, fill, stroke }) {
  const points = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? size : size * 0.43;
    const angle = (Math.PI * i) / 5 - Math.PI / 2;
    points.push(`${x + Math.cos(angle) * radius},${y + Math.sin(angle) * radius}`);
  }
  return (
    <polygon
      points={points.join(' ')}
      fill={fill}
      stroke={stroke}
      strokeWidth="0.7"
      strokeLinejoin="round"
    />
  );
}

function LaurelWreath({ light, shade, gradient }) {
  return (
    <>
      <g fill={`url(#${gradient})`} stroke={shade} strokeWidth="0.45">
        <path d="M17 49C6 43 4 31 8 20c2-6 6-10 10-13-5 7-7 14-7 21 0 8 3 15 8 19Z" />
        <g>
          {LEAF_POSITIONS.map(([x, y], index) => (
            <path
              key={y}
              d={`M${x} ${y}c-5-1-7-4-7-7 4 0 7 2 9 6m${-2} 7c-5 0-8-2-9-5 4-1 7 0 10 4`}
              transform={index % 2 ? 'rotate(-8 12 30)' : undefined}
            />
          ))}
        </g>
      </g>
      <g transform="translate(64 0) scale(-1 1)" aria-hidden="true">
        <g fill={`url(#${gradient})`} stroke={shade} strokeWidth="0.45">
          <path d="M17 49C6 43 4 31 8 20c2-6 6-10 10-13-5 7-7 14-7 21 0 8 3 15 8 19Z" />
          <g>
            {LEAF_POSITIONS.map(([x, y]) => (
              <path
                key={y}
                d={`M${x} ${y}c-5-1-7-4-7-7 4 0 7 2 9 6m-2 7c-5 0-8-2-9-5 4-1 7 0 10 4`}
              />
            ))}
          </g>
        </g>
      </g>
      <Star x={32} y={54} size={5} fill={light} stroke={shade} />
    </>
  );
}

function BronzeSymbol({ level, light, shade }) {
  const count = (level % 4) + 1;
  return Array.from({ length: count }, (_, index) => {
    const y = 40 - index * 6;
    return (
      <path
        key={index}
        d={`M21 ${y}l11 -8 11 8-3 2-8-6-8 6Z`}
        fill={light}
        stroke={shade}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    );
  });
}

function SilverSymbol({ level, light, shade }) {
  if (level === 4) {
    return (
      <g fill={light} stroke={shade} strokeWidth="0.8" strokeLinejoin="round">
        <path d="M32 17c-4 0-6 4-5 8l-9-3 7 7-5 1 8 3 4 7 4-7 8-3-5-1 7-7-9 3c1-4-1-8-5-8Z" />
        <path d="M28 37h8l-4 7Z" />
      </g>
    );
  }
  const count = level + 1;
  const gap = 3.2;
  const start = 32 - ((count - 1) * gap) / 2;
  return Array.from({ length: count }, (_, index) => (
    <rect
      key={index}
      x={start + index * gap - 1}
      y="21"
      width="2"
      height="23"
      rx="0.7"
      fill={light}
      stroke={shade}
      strokeWidth="0.65"
    />
  ));
}

function GoldSymbol({ level, light, shade }) {
  const positions = [
    [[32, 30]],
    [[26, 30], [38, 30]],
    [[26, 33], [38, 33], [32, 24]],
    [[25, 33], [39, 33], [27, 24], [37, 24]],
    [[24, 33], [40, 33], [28, 24], [36, 24], [32, 17]],
  ][level];
  return positions.map(([x, y], index) => (
    <Star
      key={index}
      x={x}
      y={y}
      size={level === 0 ? 9 : 5}
      fill={light}
      stroke={shade}
    />
  ));
}

function TurquoiseSymbol({ level, light, shade }) {
  const common = {
    fill: light,
    stroke: shade,
    strokeWidth: 0.8,
    strokeLinejoin: 'round',
  };
  switch (level) {
    case 0:
      return (
        <g {...common}>
          <path d="m32 20 3 6 13-5-8 9 7 3-12 1-3 8-3-8-12-1 7-3-8-9 13 5Z" />
          <circle cx="32" cy="21" r="2" />
        </g>
      );
    case 1:
      return (
        <g {...common}>
          <path d="M21 31c0-9 4-16 11-18 7 2 11 9 11 18l-5 2-1 10-5-5-5 5-1-10Z" />
          <path d="M32 14v20m-10-3h10" fill="none" />
        </g>
      );
    case 2:
      return (
        <g {...common}>
          <path d="M26 17h12v5l-2 2v14l3 3v3H25v-3l3-3V24l-2-2Z" />
          <path d="M28 27h8m-8 8h8M24 43h16" fill="none" />
        </g>
      );
    case 3:
      return (
        <g {...common}>
          <path d="m17 25 15-10 15 10v3H17Zm4 4h4v13h-4Zm9 0h4v13h-4Zm9 0h4v13h-4ZM18 43h28v3H18Z" />
        </g>
      );
    default:
      return (
        <g {...common}>
          <path d="M32 16c-4-5-10-4-13 0 5 0 7 3 8 6l-12-3 9 8-8 2 14 2 2 10 2-10 14-2-8-2 9-8-12 3c1-3 3-6 8-6-3-4-9-5-13 0Z" />
          <path d="m26 17 2-5 4 4 4-4 2 5" />
        </g>
      );
  }
}

function AmethystSymbol({ level, light, shade }) {
  const common = {
    fill: light,
    stroke: shade,
    strokeWidth: 0.8,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
  };
  switch (level) {
    case 0:
      return (
        <g {...common}>
          <path d="m32 14 12 9v13l-12 9-12-9V23Z" />
          <path d="m32 14 1 17 11-8m-11 8 11 5m-11-5-12-8m12 8-12 5" fill="none" />
        </g>
      );
    case 1:
      return (
        <g {...common}>
          <path d="M22 22h20v18L32 46 22 40Z" />
          <path d="M32 27a4 4 0 1 0-3 4v9h3v-4h3v-3h-3v-2a4 4 0 0 0 0-4Z" />
          <path d="m26 19 3-4 3 3 3-3 3 4" />
        </g>
      );
    case 2:
      return (
        <g {...common}>
          <path d="M22 38c2-9 6-18 16-21l-2 6c5 1 7 5 6 10l-4 1 3 5-7-1-5 5-4-4Z" />
          <path d="m28 25 3 2-4 2m4 10 5 1" fill="none" />
          <path d="m26 18 2-4 4 3 4-4 2 5" />
        </g>
      );
    case 3:
      return (
        <g {...common}>
          <path d="M16 24 27 26 32 19l5 7 11-2-7 8 4 4-10-1-3 9-3-9-10 1 4-4Z" />
          <path d="m32 19 1 14 14-9m-14 9 14 4m-14-4-16-9m16 9-12 4" fill="none" />
          <path d="m26 18 2-5 4 4 4-4 2 5" />
        </g>
      );
    default:
      return (
        <g {...common}>
          <circle cx="32" cy="30" r="16" fill="none" strokeWidth="2" />
          <path d="m32 17 4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1Z" />
          <path d="m24 13 3-6 5 4 5-4 3 6" />
        </g>
      );
  }
}

function PixelRankBadge({ rank, size = 24 }) {
  if (!rank?.id) return null;
  const [light, mid, shade] = COLORS[rank.metalKey] || COLORS.Bronze;
  const gradient = `pixel-rank-metal-${rank.id}`;
  const level = Math.max(0, Math.min(4, (rank.id - 1) % 5));
  let symbol;

  if (rank.metalKey === 'Bronze') {
    symbol = <BronzeSymbol level={level} light={light} shade={shade} />;
  } else if (rank.metalKey === 'Silver') {
    symbol = <SilverSymbol level={level} light={light} shade={shade} />;
  } else if (rank.metalKey === 'Gold') {
    symbol = <GoldSymbol level={level} light={light} shade={shade} />;
  } else if (rank.metalKey === 'Turquoise') {
    symbol = <TurquoiseSymbol level={level} light={light} shade={shade} />;
  } else {
    symbol = <AmethystSymbol level={level} light={light} shade={shade} />;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`${rank.name} (${rank.metal})`}
      title={`${rank.name} · ${rank.metal}`}
      style={{ verticalAlign: '-5px', marginRight: '4px', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="0.48" stopColor={mid} />
          <stop offset="1" stopColor={shade} />
        </linearGradient>
      </defs>
      <LaurelWreath
        light={light}
        shade={shade}
        gradient={gradient}
      />
      {symbol}
    </svg>
  );
}

export default memo(PixelRankBadge);
