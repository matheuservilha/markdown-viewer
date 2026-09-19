import type { Tab } from '~/app/store'
import type { Base } from '~/platform/fs'

interface Props {
  tab: Tab
  base: Base | undefined
}

/**
 * The trail of folders above the editor. The file name is not repeated here: it
 * is the title at the top of the page.
 */
export function Breadcrumbs({ tab, base }: Props) {
  const segments = tab.path.split('/')
  segments.pop()
  const folders = base ? [base.name, ...segments] : segments

  return (
    <nav className="crumbs" aria-label="Caminho do arquivo" title={tab.path}>
      {folders.map((folder, index) => (
        <span key={index} className="crumb">
          {index > 0 && (
            <span className="crumb-sep" aria-hidden="true">
              ›
            </span>
          )}
          {folder}
        </span>
      ))}
    </nav>
  )
}
