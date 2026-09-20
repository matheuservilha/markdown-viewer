/**
 * The layout engine ships no types. Only the three entry points this project
 * touches are declared, which is more honest than pulling in a description of
 * an API we do not use.
 */

declare module 'pdfmake/build/pdfmake' {
  const pdfMake: {
    addFontContainer: (container: unknown) => void
    createPdf: (definition: Record<string, unknown>) => {
      getBlob: () => Promise<Blob>
    }
  }
  export default pdfMake
}

declare module 'pdfmake/build/fonts/Roboto' {
  const container: unknown
  export default container
}

declare module 'pdfmake/build/standard-fonts/Courier' {
  const container: unknown
  export default container
}
