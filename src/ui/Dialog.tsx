import { useEffect, useRef } from 'react'

export interface DialogChoice {
  label: string
  /** Drawn as the one the Enter key takes. */
  primary?: boolean
  /** Drawn in the warning colour, for the choice that throws something away. */
  destructive?: boolean
  onSelect: () => void
}

interface Props {
  title: string
  body?: string
  choices: DialogChoice[]
  onCancel: () => void
}

/**
 * A question the app has to ask before going on.
 *
 * The system's own `confirm` would do the job, but it looks like it came from
 * another program, it cannot offer a third choice, and on the desktop build it
 * steals the window. This is the same question in the app's own clothes.
 */
export function Dialog({ title, body, choices, onCancel }: Props) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // The keyboard lands on the suggested choice, so Enter answers and Escape
    // backs out without the pointer ever being used.
    panel.current?.querySelector<HTMLButtonElement>('.dialog-button.is-primary')?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
    // Captured, so it answers before the shortcuts of the app behind it.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onCancel])

  return (
    <div className="dialog-backdrop" onPointerDown={onCancel} role="presentation">
      <div
        ref={panel}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="dialog-title">{title}</p>
        {body ? <p className="dialog-body">{body}</p> : null}
        <div className="dialog-choices">
          {choices.map((choice) => (
            <button
              key={choice.label}
              type="button"
              className={
                'dialog-button' +
                (choice.primary ? ' is-primary' : '') +
                (choice.destructive ? ' is-destructive' : '')
              }
              onClick={choice.onSelect}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
