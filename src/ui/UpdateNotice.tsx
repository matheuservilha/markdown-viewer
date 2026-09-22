/**
 * The offer of a new version, and the only place the app interrupts to make it.
 *
 * It looks once, when the app opens, and says nothing at all unless there is
 * something to install. Someone who declines is not asked again in this run:
 * the offer will be waiting the next time the app starts, and a document being
 * written is no place to be nagged.
 */

import { useCallback, useEffect, useState } from 'react'
import { percent, type Download } from '~/app/updates'
import { lookForUpdate, restart, type PendingUpdate } from '~/platform/updater'

type Stage =
  | { kind: 'offered' }
  | { kind: 'installing'; download: Download }
  | { kind: 'installed' }
  | { kind: 'failed' }

export function UpdateNotice() {
  const [update, setUpdate] = useState<PendingUpdate | null>(null)
  const [stage, setStage] = useState<Stage>({ kind: 'offered' })

  useEffect(() => {
    // The app has just opened and has a window to draw: looking for an update
    // is the least urgent thing happening, so it waits for the rest to settle.
    let live = true
    const timer = setTimeout(() => {
      void lookForUpdate().then((found) => {
        if (live && found) setUpdate(found)
      })
    }, 4000)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [])

  const install = useCallback(() => {
    if (!update) return
    setStage({ kind: 'installing', download: { total: 0, received: 0 } })
    update
      .install((download) => setStage({ kind: 'installing', download }))
      .then(() => setStage({ kind: 'installed' }))
      .catch(() => setStage({ kind: 'failed' }))
  }, [update])

  if (!update) return null

  if (stage.kind === 'installing') {
    const done = percent(stage.download)
    return (
      <div className="toast is-busy" role="status">
        <span className="busy-dot" />
        {done === null ? 'Baixando a versão nova…' : `Baixando a versão nova… ${done}%`}
      </div>
    )
  }

  if (stage.kind === 'installed') {
    return (
      <div className="toast" role="alert">
        Versão {update.version} instalada. Reinicie para usá-la.
        <button type="button" onClick={() => void restart()}>
          reiniciar
        </button>
        <button type="button" onClick={() => setUpdate(null)}>
          depois
        </button>
      </div>
    )
  }

  if (stage.kind === 'failed') {
    return (
      <div className="toast" role="alert">
        Não deu para instalar a versão {update.version}.
        <button type="button" onClick={() => setStage({ kind: 'offered' })}>
          tentar de novo
        </button>
        <button type="button" onClick={() => setUpdate(null)}>
          fechar
        </button>
      </div>
    )
  }

  return (
    <div className="toast" role="alert">
      A versão {update.version} saiu.
      <button type="button" onClick={install}>
        atualizar
      </button>
      <button type="button" onClick={() => setUpdate(null)}>
        agora não
      </button>
    </div>
  )
}
