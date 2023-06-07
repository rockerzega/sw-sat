import Debug from 'debug'
import { getParser } from '@nodecfdi/cfdiutils-common'
import { Token } from './clases/token'
import moment from 'moment'

const debug = Debug('api:src:assets:utils')

function readXmlDocument(source: string): Document {
  if (source === '') {
      throw new Error('No se puede cargar un xml vacio')
  }
  debug('Obteniendo el documento')
  return getParser().parseFromString(source, 'text/xml');
}

export function readXmlElement(source: string): Element {
  const document = readXmlDocument(source)
  const element = document.documentElement

  return element
}

export function findContents(element: Element, ...names: string[]): string[] {
  return findElements(element, ...names).map((element) => extractElementContent(element))
}

export function findContent(element: Element, ...names: string[]): string {
  const found = findElement(element, ...names)
  if (!found) {
      return ''
  }

  return extractElementContent(found);
}

function findElement(element: Element, ...names: string[]): Element | undefined {
  const first = names.shift()
  const current = first ? first.toLowerCase() : ''

  const children = element.childNodes

  let index = 0
  for (index; index < children.length; index++) {
    const child = children[index]
    if (child.ELEMENT_NODE === 1) {
      const localName = (child as Element).localName?.toLowerCase()
      if (localName === current) {
        if (names.length > 0) {
          return this.findElement(child as Element, ...names)
        } else {
          return child as Element
        }
      }
    }
  }

  return undefined;
}

function findElements(element: Element, ...names: string[]): Element[] {
  const last = names.pop()
  const current = last ? last.toLowerCase() : ''
  const tempElement = this.findElement(element, ...names)
  if (!tempElement) {
      return []
  }
  element = tempElement;

  const found: Element[] = []
  const children = element.childNodes
  let index = 0
  for (index; index < children.length; index++) {
      const child = children[index]
      if (child.ELEMENT_NODE === 1) {
          const localName = (child as Element).localName?.toLowerCase()
          if (localName === current) {
              found.push(child as Element)
          }
      }
  }

  return found
}

function extractElementContent(element: Element): string {
  const buffer: string[] = []
  const children = element.childNodes
  let index = 0
  for (index; index < children.length; index++) {
      const child = children[index]
      if ((child as Element).nodeType === 3) {
          const c = child
          if (c?.textContent !== null) {
              buffer.push(c.textContent)
          }
      }
  }

  return buffer.join('')
}

export function nospaces(input: string): string {
  return (
      input
          .replace(/^\s*/gm, '') //  A: remove horizontal spaces at beginning
          .replace(/\s*\r?\n/gm, '') // B: remove horizontal spaces + optional CR + LF
          .replace(/\?></gm, '?>\n<') || // C: xml definition on its own line
      ''
  )
}

export function createTokenFromSoapResponse(content: string): Token {
  const env = readXmlElement (content)
  let timeContent = findContent(env, 'header', 'security', 'timestamp', 'created')
  const created = timeContent !== '' ? moment(timeContent).toString() : undefined
  timeContent = findContent(env, 'header', 'security', 'timestamp', 'expires')
  const expires = timeContent !== '' ? moment(timeContent).toString() : undefined
  const value = findContent(env, 'body', 'autenticaResponse', 'autenticaResult')

  return new Token(created, expires, value);
}
