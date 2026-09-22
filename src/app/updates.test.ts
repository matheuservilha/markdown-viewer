import { describe, expect, it } from 'vitest'
import { advance, NOT_STARTED, percent, type DownloadEvent } from './updates'

const started = (contentLength?: number): DownloadEvent => ({
  event: 'Started',
  data: { contentLength },
})
const chunk = (chunkLength: number): DownloadEvent => ({ event: 'Progress', data: { chunkLength } })
const finished: DownloadEvent = { event: 'Finished' }

/** Folds a whole run of reports, the way the updater delivers them. */
const run = (events: DownloadEvent[]) => events.reduce(advance, NOT_STARTED)

describe('advance', () => {
  it('takes the total from the start and counts nothing yet', () => {
    expect(run([started(400)])).toEqual({ total: 400, received: 0 })
  })

  it('sums the chunks as they land', () => {
    expect(run([started(400), chunk(100), chunk(50)])).toEqual({ total: 400, received: 150 })
  })

  it('counts from zero again when a download starts over', () => {
    expect(run([started(400), chunk(300), started(400), chunk(10)])).toEqual({
      total: 400,
      received: 10,
    })
  })

  it('is whole once it finishes, even if the chunks did not add up', () => {
    expect(run([started(400), chunk(100), finished])).toEqual({ total: 400, received: 400 })
  })

  it('finishing without an announced total takes the total from what arrived', () => {
    expect(run([started(), chunk(120), finished])).toEqual({ total: 120, received: 120 })
  })
})

describe('percent', () => {
  it('is nothing while the size is unknown, so no bar is drawn', () => {
    expect(percent(run([started()]))).toBeNull()
    expect(percent(run([started(), chunk(90)]))).toBeNull()
  })

  it('reports how far along it is', () => {
    expect(percent(run([started(400), chunk(100)]))).toBe(25)
  })

  it('rounds rather than showing a fraction of a percent', () => {
    expect(percent(run([started(3), chunk(1)]))).toBe(33)
  })

  it('never passes 100, even if more arrives than was announced', () => {
    expect(percent(run([started(100), chunk(250)]))).toBe(100)
  })

  it('is 100 once it finishes', () => {
    expect(percent(run([started(400), chunk(1), finished]))).toBe(100)
  })
})
