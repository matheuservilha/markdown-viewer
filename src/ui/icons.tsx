/** Small inline icons. They take the colour of the text around them. */

interface IconProps {
  className?: string
}

export function FolderIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M1.5 3.25A1.25 1.25 0 0 1 2.75 2h3.19c.33 0 .64.13.88.37L7.9 3.25h5.35c.69 0 1.25.56 1.25 1.25v7.25c0 .69-.56 1.25-1.25 1.25H2.75c-.69 0-1.25-.56-1.25-1.25v-8.5Z"
      />
    </svg>
  )
}

export function MarkdownIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9.5 1.5H4.25C3.56 1.5 3 2.06 3 2.75v10.5c0 .69.56 1.25 1.25 1.25h7.5c.69 0 1.25-.56 1.25-1.25V5.2L9.5 1.5Z"
        opacity="0.22"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        d="M9.4 1.9H4.25c-.47 0-.85.38-.85.85v10.5c0 .47.38.85.85.85h7.5c.47 0 .85-.38.85-.85V5.35L9.4 1.9Z"
      />
      <path
        fill="currentColor"
        d="M5.2 11.4V7.9h.95l1.05 1.6 1.05-1.6h.95v3.5h-.95V9.5l-1.05 1.5L6.15 9.5v1.9H5.2Zm5.4 0L9.3 9.6h.85V7.9h.95v1.7h.85l-1.35 1.8Z"
      />
    </svg>
  )
}

export function FileIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        d="M9.4 1.9H4.25c-.47 0-.85.38-.85.85v10.5c0 .47.38.85.85.85h7.5c.47 0 .85-.38.85-.85V5.35L9.4 1.9Z"
      />
      <path fill="none" stroke="currentColor" strokeWidth="1.1" d="M9.3 2v3.3h3.3" />
    </svg>
  )
}
