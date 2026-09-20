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
const SCALE = 2.5

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

  const canvas = await withHiddenFrame(html, async (frame) => {
    const body = frame.contentDocument?.body
    if (!body) throw new Error('A página não pôde ser montada para virar PDF.')
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
  const pixelsPerPage = Math.floor((canvas.width * printable.height) / printable.width)
  const pages = Math.max(1, Math.ceil(canvas.height / pixelsPerPage))

  const slice = document.createElement('canvas')
  const context = slice.getContext('2d')
  if (!context) throw new Error('O navegador não deu um canvas para desenhar o PDF.')

  for (let page = 0; page < pages; page++) {
    const top = page * pixelsPerPage
    const height = Math.min(pixelsPerPage, canvas.height - top)

    slice.width = canvas.width
    slice.height = height
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, slice.width, slice.height)
    context.drawImage(canvas, 0, top, canvas.width, height, 0, 0, canvas.width, height)

    if (page > 0) pdf.addPage()
    pdf.addImage(
      slice.toDataURL('image/jpeg', 0.92),
      'JPEG',
      MARGIN,
      MARGIN,
      printable.width,
      (height * printable.width) / canvas.width,
      undefined,
      'FAST',
    )
  }

  onProgress?.('writing')
  return new Uint8Array(pdf.output('arraybuffer') as ArrayBuffer)
}
