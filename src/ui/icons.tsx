/**
 * Thin outline icons, in the house geometry: 17px box, 1.5 stroke, and the
 * colour of the text around them. Nothing here is filled or multicoloured.
 */

import type { ReactNode, SVGProps } from 'react'

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number
}

function Icon({ size = 17, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

/** The brand mark: a rounded square with an offset notch. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="6" fill="var(--accent)" />
      <path
        d="M7.5 16.5V8.2c0-.3.4-.5.6-.2l3.4 4.2c.2.3.6.3.8 0l3.4-4.2c.2-.3.6-.1.6.2v8.3"
        fill="none"
        stroke="var(--accent-on)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const FolderIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l1.8 2H19.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z" />
  </Icon>
)

export const MarkdownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5" />
    <path d="M8.2 17v-4l1.9 2.3L12 13v4" />
    <path d="M14.6 13v2.6m0 0 1.3-1.3m-1.3 1.3-1.3-1.3" />
  </Icon>
)

export const FileIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5" />
  </Icon>
)

export const FilePlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
    <path d="M14 3v5h5v3" />
    <path d="M17 14.5v5M14.5 17h5" />
  </Icon>
)

export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 5.5 15.5 12 9 18.5" />
  </Icon>
)

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Icon>
)

export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
  </Icon>
)

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </Icon>
)

export const SidebarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="M9.5 4.5v15" />
  </Icon>
)

export const FolderPlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l1.8 2H19.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z" />
    <path d="M12 11.5v4M10 13.5h4" />
  </Icon>
)

export const EyeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.6" />
  </Icon>
)

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4.5 21 19.5H3L12 4.5Z" />
    <path d="M12 10v4M12 16.6v.4" />
  </Icon>
)

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
  </Icon>
)

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="2.8" />
    <path d="M19 12a7 7 0 0 0-.1-1.1l1.8-1.4-1.8-3.1-2.1.8a7 7 0 0 0-1.9-1.1L14.5 4h-3.6l-.4 2.1a7 7 0 0 0-1.9 1.1l-2.1-.8-1.8 3.1 1.8 1.4a7 7 0 0 0 0 2.2l-1.8 1.4 1.8 3.1 2.1-.8a7 7 0 0 0 1.9 1.1l.4 2.1h3.6l.4-2.1a7 7 0 0 0 1.9-1.1l2.1.8 1.8-3.1-1.8-1.4A7 7 0 0 0 19 12Z" />
  </Icon>
)

export const GripIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="7" r="0.9" />
    <circle cx="15" cy="7" r="0.9" />
    <circle cx="9" cy="12" r="0.9" />
    <circle cx="15" cy="12" r="0.9" />
    <circle cx="9" cy="17" r="0.9" />
    <circle cx="15" cy="17" r="0.9" />
  </Icon>
)

export const CollapseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 4.5h12M8 12h12M8 19.5h12" />
    <path d="m5.5 7 -2 -2.5L1.5 7M5.5 17l-2 2.5L1.5 17" />
  </Icon>
)

export const CrosshairIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
  </Icon>
)

export const MoreIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="12" r="1.1" />
    <circle cx="12" cy="12" r="1.1" />
    <circle cx="18" cy="12" r="1.1" />
  </Icon>
)
