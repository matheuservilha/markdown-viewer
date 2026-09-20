import { describe, expect, it } from 'vitest'
import { parseCallout } from './callouts'

describe('parseCallout', () => {
  it('lê o tipo e onde o marcador começa e acaba', () => {
    const callout = parseCallout('> [!tip] Uma dica')
    expect(callout).toEqual({ type: 'tip', markFrom: 2, markTo: 9 })
  })

  it('aceita os apelidos que as notas usam na prática', () => {
    expect(parseCallout('> [!summary] x')?.type).toBe('abstract')
    expect(parseCallout('> [!check] x')?.type).toBe('success')
    expect(parseCallout('> [!error] x')?.type).toBe('failure')
    expect(parseCallout('> [!faq] x')?.type).toBe('question')
  })

  it('não diferencia maiúscula de minúscula', () => {
    expect(parseCallout('> [!WARNING] x')?.type).toBe('warning')
  })

  it('cai no neutro quando o tipo é desconhecido', () => {
    expect(parseCallout('> [!inventado] x')?.type).toBe('note')
  })

  it('aceita o sinal de dobrar do Obsidian', () => {
    expect(parseCallout('> [!note]- fechado')?.type).toBe('note')
    expect(parseCallout('> [!note]+ aberto')?.type).toBe('note')
  })

  it('devolve nulo para uma citação comum', () => {
    expect(parseCallout('> só uma citação')).toBeNull()
    expect(parseCallout('sem citação nenhuma')).toBeNull()
  })
})
