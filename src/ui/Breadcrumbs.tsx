import type { Tab } from '~/app/store'
import type { Base } from '~/platform/fs'

interface Props {
  tab: Tab
  base: Base | undefined
}

/**
 * The folder trail above the editor, ending in the open file. The title at the
 * top of the page scrolls away; this line does not.
 */
export function Breadcrumbs({ tab, base }: Props) {
  const segments = tab.path.split('/')
  const name = segments.pop() ?? tab.name
  const folders = base ? [base.name, ...segments] : segments

  return (
    <nav className="crumbs" aria-label="Caminho do arquivo" title={tab.path}>
      {folders.map((folder, index) => (
        <span key={index} className="crumb">
          {index > 0 && (
            <span className="crumb-sep" aria-hidden="true">
              /
            </span>
          )}
          {folder}
        </span>
      ))}
      <span className="crumb is-current">
        {folders.length > 0 && (
          <span className="crumb-sep" aria-hidden="true">
            /
          </span>
        )}
        {name}
      </span>
    </nav>
  )
}
