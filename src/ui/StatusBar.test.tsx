// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import type { Doc, Tab } from '~/app/store'
import { StatusBar } from './StatusBar'

let root: Root | null = null

function mount(node: React.ReactElement) {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(node))
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

const tab: Tab = {
  id: 'base:notas/reuniao.md',
  baseId: 'base',
  path: 'notas/reuniao.md',
  name: 'reuniao.md',
  preview: false,
}

const doc = {
  text: 'uma linha de texto',
  shape: { eol: '\n', encoding: 'utf-8', lossy: false },
  dirty: false,
  conflict: false,
  gone: false,
} as unknown as Doc

const base = { id: 'base', name: 'Notas' } as never
const nothing = () => {}

const version = () => document.querySelector('.status-version')?.textContent
const trail = () =>
  [...document.querySelectorAll('.status .crumbs .crumb')].map((c) => c.textContent)

describe('StatusBar', () => {
  it('carries the folder trail at the foot, not the top', () => {
    mount(<StatusBar tab={tab} doc={doc} base={base} onReload={nothing} onSave={nothing} />)
    // The base's name opens the trail, then the folders, then the file.
    expect(trail()).toEqual(['Notas', '/notas', '/reuniao.md'])
  })

  it('shows the version', () => {
    mount(<StatusBar tab={tab} doc={doc} base={base} onReload={nothing} onSave={nothing} />)
    expect(version()).toBe(__APP_VERSION__)
    expect(version()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('still shows the version with no file open, where the rest has nothing to say', () => {
    mount(<StatusBar tab={null} doc={null} base={undefined} onReload={nothing} onSave={nothing} />)
    expect(version()).toBe(__APP_VERSION__)
    expect(trail()).toEqual([])
  })
})
