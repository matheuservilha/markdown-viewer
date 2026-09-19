import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isDesktop } from '~/platform'
import { App } from '~/ui/App'
import '~/ui/styles.css'

// The desktop window has no title bar of its own, so the interface has to leave
// room for the system's window buttons and offer somewhere to drag from.
if (isDesktop()) document.documentElement.dataset.desktop = 'true'

const root = document.getElementById('root')
if (!root) throw new Error('Elemento #root não encontrado')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
