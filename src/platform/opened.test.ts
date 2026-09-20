import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
const listen = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: (...args: unknown[]) => listen(...args) }))

/** Lets the dynamic imports inside the listener settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  // What the platform check looks for to decide this is the desktop build.
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
  invoke.mockReset()
  listen.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('arquivos entregues pelo sistema', () => {
  it('entrega o que chegou antes da interface existir', async () => {
    const { onOpenedPaths } = await import('./opened')
    invoke.mockResolvedValue(['/notas/a.md', '/notas/b.md'])
    listen.mockResolvedValue(() => {})

    const handle = vi.fn()
    onOpenedPaths(handle)
    await settle()

    expect(invoke).toHaveBeenCalledWith('take_opened_paths')
    expect(handle).toHaveBeenCalledWith(['/notas/a.md', '/notas/b.md'])
  })

  it('não chama à toa quando não havia nada esperando', async () => {
    const { onOpenedPaths } = await import('./opened')
    invoke.mockResolvedValue([])
    listen.mockResolvedValue(() => {})

    const handle = vi.fn()
    onOpenedPaths(handle)
    await settle()
    expect(handle).not.toHaveBeenCalled()
  })

  it('entrega também o que chega com o app já aberto', async () => {
    const { onOpenedPaths } = await import('./opened')
    invoke.mockResolvedValue([])
    let emit: ((event: { payload: string[] }) => void) | null = null
    listen.mockImplementation((_name: string, callback: (event: { payload: string[] }) => void) => {
      emit = callback
      return Promise.resolve(() => {})
    })

    const handle = vi.fn()
    onOpenedPaths(handle)
    await settle()

    expect(listen).toHaveBeenCalledWith('files-opened', expect.any(Function))
    emit!({ payload: ['/notas/c.md'] })
    expect(handle).toHaveBeenCalledWith(['/notas/c.md'])
  })

  it('parar antes da escuta começar não deixa escuta pendurada', async () => {
    const { onOpenedPaths } = await import('./opened')
    const unlisten = vi.fn()
    invoke.mockResolvedValue([])
    listen.mockResolvedValue(unlisten)

    const stop = onOpenedPaths(vi.fn())
    stop()
    await settle()
    expect(unlisten).toHaveBeenCalledOnce()
  })

  it('fora do desktop não escuta nada', async () => {
    vi.stubGlobal('window', {})
    const { onOpenedPaths } = await import('./opened')
    const handle = vi.fn()
    onOpenedPaths(handle)()
    await settle()
    expect(invoke).not.toHaveBeenCalled()
    expect(handle).not.toHaveBeenCalled()
  })
})
