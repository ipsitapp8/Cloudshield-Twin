// Small hand-authored line-icon set (24x24, stroke=currentColor) -- no icon library
// dependency. Generic geometric shapes only, sized/colored via className.
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function base(props: IconProps, children: React.ReactNode) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  )
}

export const ShieldIcon = (p: IconProps) =>
  base(p, <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />)

export const EyeIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </>,
  )

export const NetworkIcon = (p: IconProps) =>
  base(
    p,
    <>
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="M12 7v5m0 0l-5.5 5M12 12l5.5 5" />
    </>,
  )

export const PlayIcon = (p: IconProps) => base(p, <path d="M7 4l13 8-13 8V4z" />)

export const WrenchIcon = (p: IconProps) =>
  base(
    p,
    <path d="M14.5 6.5a4 4 0 00-5.4 5.1L3 17.7 6.3 21l6-6a4 4 0 005.2-5.4l-2.7 2.7-2.6-.6-.6-2.6 2.9-2.6z" />,
  )

export const CheckShieldIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </>,
  )

export const GlobeIcon = (p: IconProps) =>
  base(
    p,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3z" />
    </>,
  )

export const DatabaseIcon = (p: IconProps) =>
  base(
    p,
    <>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
      <path d="M5 5.5V18c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5.5" />
      <path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </>,
  )

export const ServerIcon = (p: IconProps) =>
  base(
    p,
    <>
      <rect x="4" y="4" width="16" height="6.5" rx="1.2" />
      <rect x="4" y="13.5" width="16" height="6.5" rx="1.2" />
      <path d="M7.5 7.25h.01M7.5 16.75h.01" />
    </>,
  )

export const SparklesIcon = (p: IconProps) =>
  base(
    p,
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2zM4.5 15.5l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7z" />,
  )

export const WarningTriangleIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M12 3.5L2.5 20h19L12 3.5z" />
      <path d="M12 10v4.5M12 17.5h.01" />
    </>,
  )

export const CheckCircleIcon = (p: IconProps) =>
  base(
    p,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </>,
  )

export const XCircleIcon = (p: IconProps) =>
  base(
    p,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>,
  )

export const ArrowRightIcon = (p: IconProps) => base(p, <path d="M4 12h15m0 0l-5-5m5 5l-5 5" />)

export const ArrowDownIcon = (p: IconProps) => base(p, <path d="M12 4v15m0 0l-5-5m5 5l5-5" />)

export const ReportIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v4h4M9 12h6M9 16h6M9 8h2" />
    </>,
  )

export const UserCircleIcon = (p: IconProps) =>
  base(
    p,
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 19a6 6 0 0111 0" />
    </>,
  )

export const ChevronRightIcon = (p: IconProps) => base(p, <path d="M9 5l7 7-7 7" />)

export const BoltIcon = (p: IconProps) => base(p, <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />)

export const CloudIcon = (p: IconProps) =>
  base(p, <path d="M7 18a4.5 4.5 0 01-.5-8.97A5 5 0 0116.5 8 4 4 0 0117 16H7z" />)

export const BarChartIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M5 20V11M11 20V6M17 20v-7" />
      <path d="M3 20h18" />
    </>,
  )

export const LineChartIcon = (p: IconProps) => base(p, <path d="M3 17l5-6 4 3 5-7 4 4" />)

export const SunIcon = (p: IconProps) =>
  base(
    p,
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8" />
    </>,
  )
