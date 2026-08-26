import {
  LOGO_COLORS,
  LOGO_PATHS,
  LOGO_VIEWBOX,
  RUPEE_SEGMENT_WIDTH,
  rupeeSegments,
} from '@/lib/brand/logo';

interface PotliLogoProps {
  className?: string;
  /** Draws the rounded brand-coloured tile behind the bag, as on the app icon. */
  withBackdrop?: boolean;
  title?: string;
}

/**
 * The Potli mark. Shares its geometry with the PNG icon generator, so what is on the
 * home screen and what is on the login screen are the same drawing.
 */
export function PotliLogo({ className, withBackdrop = false, title }: PotliLogoProps) {
  const segments = rupeeSegments();
  const clipId = 'potli-bag-clip';

  return (
    <svg
      viewBox={`0 0 ${LOGO_VIEWBOX} ${LOGO_VIEWBOX}`}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}

      <defs>
        <clipPath id={clipId}>
          <path d={LOGO_PATHS[1]!.d} />
        </clipPath>
      </defs>

      {withBackdrop ? (
        <rect
          width={LOGO_VIEWBOX}
          height={LOGO_VIEWBOX}
          rx={LOGO_VIEWBOX * 0.22}
          fill={LOGO_COLORS.backdrop}
        />
      ) : null}

      <g transform={withBackdrop ? 'translate(9 9) scale(0.82)' : undefined}>
        {LOGO_PATHS.map((path, index) => (
          <path
            key={index}
            d={path.d}
            fill={LOGO_COLORS[path.fill]}
            clipPath={path.clip ? `url(#${clipId})` : undefined}
          />
        ))}

        {segments.map((segment, index) => (
          <line
            key={index}
            x1={segment.x1}
            y1={segment.y1}
            x2={segment.x2}
            y2={segment.y2}
            stroke={LOGO_COLORS.rupee}
            strokeWidth={RUPEE_SEGMENT_WIDTH}
            strokeLinecap="round"
          />
        ))}
      </g>
    </svg>
  );
}
