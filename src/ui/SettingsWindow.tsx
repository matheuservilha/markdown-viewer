import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { EDITOR_BINDINGS, SHORTCUTS, editorCap, keyCap, onApple } from './shortcuts'
import { FONT_LABELS, LIMITS, type BodyFont, type Settings, type ThemeMode } from '~/app/settings'
import { CloseIcon, GripIcon } from './icons'

const POSITION_KEY = 'markdown-viewer.settings.position'

interface Position {
  x: number
  y: number
}

function loadPosition(): Position | null {
  try {
    const stored = localStorage.getItem(POSITION_KEY)
    return stored ? (JSON.parse(stored) as Position) : null
  } catch {
    return null
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

interface Props {
  settings: Settings
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  reset: () => void
  onClose: () => void
  /** Raised while a width control has focus, so the column guides can show. */
  onMeasureFocus: (active: boolean) => void
}

export function SettingsWindow({ settings, update, reset, onClose, onMeasureFocus }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<Position | null>(loadPosition)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // A window dropped off-screen would be unreachable, so it is pulled back in
  // whenever the viewport changes size.
  useEffect(() => {
    const onResize = () =>
      setPosition((current) => {
        const element = panel.current
        if (!current || !element) return current
        return {
          x: clamp(current.x, 8, window.innerWidth - element.offsetWidth - 8),
          y: clamp(current.y, 8, window.innerHeight - element.offsetHeight - 8),
        }
      })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /**
   * The drag listens on the window instead of capturing the pointer. Capture
   * would swallow the click on the close button inside the same header, and it
   * silently drops the drag whenever the pointer leaves the header.
   */
  const startDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const element = panel.current
    if (!element || event.button !== 0) return
    if ((event.target as HTMLElement).closest('button')) return

    // Without this the drag turns into a text selection across the page.
    event.preventDefault()

    const box = element.getBoundingClientRect()
    const dx = event.clientX - box.left
    const dy = event.clientY - box.top

    const onMove = (move: PointerEvent) => {
      setPosition({
        x: clamp(move.clientX - dx, 8, window.innerWidth - element.offsetWidth - 8),
        y: clamp(move.clientY - dy, 8, window.innerHeight - element.offsetHeight - 8),
      })
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setPosition((current) => {
        if (current) {
          try {
            localStorage.setItem(POSITION_KEY, JSON.stringify(current))
          } catch {
            // A window that cannot be remembered is still a window that moved.
          }
        }
        return current
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [])

  const placement: CSSProperties = position
    ? { left: position.x, top: position.y }
    : { right: 22, bottom: 48 }

  return (
    <div
      ref={panel}
      className="settings"
      style={placement}
      role="dialog"
      aria-label="Ajustes de leitura"
    >
      <div className="settings-head" onPointerDown={startDrag}>
        <GripIcon size={15} className="settings-grip" />
        <span className="settings-title">Ajustes</span>
        <button type="button" className="icon-button" aria-label="Fechar ajustes" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="settings-body">
        <p className="section-label">Leitura</p>

        <Slider
          label="Largura"
          value={settings.measurePx}
          limits={LIMITS.measurePx}
          format={(value) => value + 'px'}
          onChange={(value) => update('measurePx', value)}
          onFocusChange={onMeasureFocus}
        />
        <Slider
          label="Tamanho"
          value={settings.fontSize}
          limits={LIMITS.fontSize}
          format={(value) => value + 'px'}
          onChange={(value) => update('fontSize', value)}
        />
        <Slider
          label="Entrelinha"
          value={settings.lineHeight}
          limits={LIMITS.lineHeight}
          format={(value) => value.toFixed(2)}
          onChange={(value) => update('lineHeight', value)}
        />
        <Segmented
          label="Fonte"
          value={settings.bodyFont}
          options={(['sans', 'serif', 'mono'] as BodyFont[]).map((font) => ({
            value: font,
            label: FONT_LABELS[font],
          }))}
          onChange={(value) => update('bodyFont', value)}
        />

        <div className="settings-divider" />
        <p className="section-label">Aparência</p>

        <Slider
          label="Interface"
          value={settings.uiScale}
          limits={LIMITS.uiScale}
          format={(value) => Math.round(value * 100) + '%'}
          onChange={(value) => update('uiScale', value)}
        />
        <Segmented
          label="Tema"
          value={settings.themeMode}
          options={[
            { value: 'system' as ThemeMode, label: 'Sistema' },
            { value: 'light' as ThemeMode, label: 'Claro' },
            { value: 'dark' as ThemeMode, label: 'Escuro' },
          ]}
          onChange={(value) => update('themeMode', value)}
        />

        <div className="settings-divider" />
        <p className="section-label">Árvore</p>

        <button
          type="button"
          className="settings-row is-clickable"
          aria-pressed={settings.showAllFiles}
          onClick={() => update('showAllFiles', !settings.showAllFiles)}
        >
          <span className="settings-label">Outros arquivos</span>
          <span className="switch" data-on={settings.showAllFiles} />
        </button>

        <div className="settings-divider" />
        <p className="section-label">Edição</p>

        <button
          type="button"
          className="settings-row is-clickable"
          aria-pressed={settings.autosave}
          onClick={() => update('autosave', !settings.autosave)}
        >
          <span className="settings-label">Salvar sozinho</span>
          <span className="switch" data-on={settings.autosave} />
        </button>

        <button
          type="button"
          className="settings-row is-clickable"
          aria-pressed={settings.readOnly}
          onClick={() => update('readOnly', !settings.readOnly)}
        >
          <span className="settings-label">Somente leitura</span>
          <span className="switch" data-on={settings.readOnly} />
        </button>

        <div className="settings-divider" />
        <p className="section-label">Atalhos</p>

        <div className="shortcut-list">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.id} className="shortcut-row">
              <span className="settings-label">{shortcut.label}</span>
              <kbd>{keyCap(shortcut)}</kbd>
            </div>
          ))}
          <div className="shortcut-row">
            <span className="settings-label">Ir para a aba</span>
            <kbd>{onApple() ? '⌘1…9' : 'Ctrl+1…9'}</kbd>
          </div>
          {EDITOR_BINDINGS.map((binding) => (
            <div key={binding.label} className="shortcut-row">
              <span className="settings-label">{binding.label}</span>
              <kbd>{editorCap(binding)}</kbd>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-foot">
        <button type="button" className="settings-reset" onClick={reset}>
          Restaurar padrões
        </button>
      </div>
    </div>
  )
}

interface SliderProps {
  label: string
  value: number
  limits: { min: number; max: number; step: number }
  format: (value: number) => string
  onChange: (value: number) => void
  onFocusChange?: (active: boolean) => void
}

function Slider({ label, value, limits, format, onChange, onFocusChange }: SliderProps) {
  const id = useId()
  const fill = ((value - limits.min) / (limits.max - limits.min)) * 100

  return (
    <div className="settings-row">
      <label className="settings-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="slider"
        type="range"
        min={limits.min}
        max={limits.max}
        step={limits.step}
        value={value}
        style={{ '--fill': fill + '%' } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
      />
      <span className="settings-value">{format(value)}</span>
    </div>
  )
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="settings-row">
      <span className="settings-label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
