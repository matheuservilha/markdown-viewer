/**
 * The PDF, made inside the app rather than handed to a print dialog.
 *
 * Both builds run the same web engine on this code, so the file comes out the
 * same on desktop and in the browser, and it is always on white paper: a PDF
 * carrying somebody's dark theme is a PDF nobody can print.
 *
 * The page is rendered off screen and rasterised, which is what makes it look
 * exactly like what was on the screen. The cost is that the text in the PDF is
 * a picture of text: it is not selectable, and it is drawn at 2.5x so that it
 * still holds up on paper.
 */

/** Width of the rendered page, in CSS px, before rasterising. */
const PAGE_WIDTH = 820

/**
 * 2x over an A4 text column lands around 220 dpi, which holds up on paper. Each
 * step above this costs about half a megabyte per page for no visible gain at
 * reading size, measured on a nine page note.
 */
const SCALE = 2
const QUALITY = 0.82

/** A4 in points, which is what jsPDF measures in. */
const A4 = { width: 595.28, height: 841.89 }
const MARGIN = 28

interface Progress {
  (stage: 'rendering' | 'paginating' | 'writing'): void
}

async function withHiddenFrame<T>(html: string, run: (frame: HTMLIFrameElement) => Promise<T>) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText =
    'position:fixed;left:-20000px;top:0;border:0;background:#fff;width:' +
    PAGE_WIDTH +
    'px;height:100px'

  const ready = new Promise<void>((resolve) => {
    frame.addEventListener('load', () => resolve(), { once: true })
  })

  frame.srcdoc = html
  document.body.append(frame)
  await ready

  try {
    const page = frame.contentDocument
    if (page) {
      // The frame has to be as tall as the document, or html2canvas only sees
      // the first screenful.
      frame.style.height = page.documentElement.scrollHeight + 'px'
      await waitForImages(page)
    }
    return await run(frame)
  } finally {
    frame.remove()
  }
}

/** Things that must not be sliced through, whatever the page height says. */
const ATOMIC = 'img, pre, table, hr'

/**
 * Where a page may end.
 *
 * Every line of text offers its own bottom edge as a candidate, which is what
 * keeps a page break from cutting a line in half. Pictures, code blocks and
 * tables are treated as indivisible: a break may land after one, never inside.
 */
function breakPoints(page: Document): { candidates: number[]; forbidden: [number, number][] } {
  const candidates = new Set<number>([0])
  const forbidden: [number, number][] = []

  for (const element of page.body.querySelectorAll(ATOMIC)) {
    const box = element.getBoundingClientRect()
    forbidden.push([box.top, box.bottom])
    candidates.add(box.bottom)
  }

  const range = page.createRange()
  const walker = page.createTreeWalker(page.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue?.trim()) continue
    range.selectNodeContents(node)
    for (const rect of range.getClientRects()) candidates.add(rect.bottom)
  }

  for (const element of page.body.children) {
    candidates.add(element.getBoundingClientRect().bottom)
  }

  return {
    candidates: [...candidates].toSorted((a, b) => a - b),
    forbidden,
  }
}

/** The last place a page can end without cutting through anything. */
function lastBreakBefore(
  limit: number,
  after: number,
  { candidates, forbidden }: ReturnType<typeof breakPoints>,
): number | null {
  for (let index = candidates.length - 1; index >= 0; index--) {
    const point = candidates[index]!
    if (point > limit || point <= after) continue
    if (forbidden.some(([top, bottom]) => point > top && point < bottom)) continue
    return point
  }
  return null
}

/** A picture that has not loaded yet rasterises as a blank box. */
async function waitForImages(scope: Document): Promise<void> {
  const images = [...scope.querySelectorAll('img')]
  await Promise.all(
    images.map(
      (image) =>
        image.complete ||
        new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true })
          image.addEventListener('error', () => resolve(), { once: true })
        }),
    ),
  )
  // Fonts as well: a page rasterised mid-swap comes out in the fallback face.
  if (scope.fonts) await scope.fonts.ready
}

export async function htmlToPdf(
  html: string,
  onProgress?: Progress,
): Promise<Uint8Array<ArrayBuffer>> {
  // Loaded on demand: together these are most of a megabyte, and most sessions
  // never export anything.
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  onProgress?.('rendering')

  let breaks: ReturnType<typeof breakPoints> = { candidates: [0], forbidden: [] }

  const canvas = await withHiddenFrame(html, async (frame) => {
    const body = frame.contentDocument?.body
    if (!body) throw new Error('A página não pôde ser montada para virar PDF.')
    breaks = breakPoints(frame.contentDocument!)
    return html2canvas(body, {
      scale: SCALE,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: PAGE_WIDTH,
      width: PAGE_WIDTH,
    })
  })

  onProgress?.('paginating')

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const printable = { width: A4.width - MARGIN * 2, height: A4.height - MARGIN * 2 }

  // How many source pixels fit on one page, once the canvas is scaled to the
  // printable width.
  const pixelsPerPage = (canvas.width * printable.height) / printable.width

  const slice = document.createElement('canvas')
  const context = slice.getContext('2d')
  if (!context) throw new Error('O navegador não deu um canvas para desenhar o PDF.')

  let top = 0
  let first = true
  while (top < canvas.height) {
    const limit = Math.min(top + pixelsPerPage, canvas.height)
    // Snap the cut to a line boundary, unless nothing fits, in which case the
    // page is filled to the brim and the cut falls where it falls.
    const snapped =
      limit >= canvas.height
        ? canvas.height
        : (lastBreakBefore(limit / SCALE, top / SCALE, breaks) ?? 0) * SCALE
    const bottom = snapped > top ? snapped : limit
    const height = Math.ceil(bottom - top)

    slice.width = canvas.width
    slice.height = height
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, slice.width, slice.height)
    context.drawImage(canvas, 0, top, canvas.width, height, 0, 0, canvas.width, height)

    if (!first) pdf.addPage()
    first = false
    pdf.addImage(
      slice.toDataURL('image/jpeg', QUALITY),
      'JPEG',
      MARGIN,
      MARGIN,
      printable.width,
      (height * printable.width) / canvas.width,
      undefined,
      'FAST',
    )

    top = bottom
  }

  onProgress?.('writing')
  return new Uint8Array(pdf.output('arraybuffer') as ArrayBuffer)
}
