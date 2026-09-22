import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isDesktop } from '~/platform'
import { windowRole } from '~/platform/window-role'
import { App } from '~/ui/App'
import { Dock } from '~/ui/Dock'
import { Peek } from '~/ui/Peek'
import '~/ui/styles.css'

// The desktop window has no title bar of its own, so the interface has to leave
// room for the system's window buttons and offer somewhere to drag from.
if (isDesktop()) document.documentElement.dataset.desktop = 'true'

// The app, the dock on the edge of the screen, and the note that floats beside
// it are the same bundle in three windows. Which one this is decides what gets
// mounted, and nothing else in the app has to know.
const role = windowRole()
document.documentElement.dataset.window = role

// A panel is told its theme by the app's window, which takes a moment. Until
// then it follows the system, so that nothing is ever painted with no theme
// at all.
if (role !== 'main') {
  document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

const root = document.getElementById('root')
if (!root) throw new Error('Elemento #root não encontrado')

createRoot(root).render(
  <StrictMode>{role === 'dock' ? <Dock /> : role === 'peek' ? <Peek /> : <App />}</StrictMode>,
)
