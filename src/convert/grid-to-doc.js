import {fromDOM} from 'prosemirror/src/parse/dom'

import GridSchema from '../schema/'
import {makeFigureDom} from '../schema/figure'

const MEDIA_TYPES = [
  'image', 'video', 'audio', 'article', 
  'location', 'share', 'interactive'
]
const HTML_TYPES = [
  'text', 'p', 'code',
  'quote', 'blockquote',
  'list', 'ol', 'ul',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
]

function contains (array, string) {
  return (array.indexOf(string) !== -1)
}

function isMediaType (type) {
  return contains( MEDIA_TYPES, type )
}

function isHTMLType (type) {
  return contains( HTML_TYPES, type )
}

function itemToDOM (item) {
  let {id, type, html, cover, metadata} = item
  let el
  if ( isHTMLType(type) ) {
    let dummy = document.createElement('div')
    dummy.innerHTML = item.html
    el = dummy.firstChild
  } else if ( isMediaType(type) ) {
    if (cover && cover.src) {
      el = makeFigureDom({
        src: cover.src,
        title: metadata.title,
        description: metadata.description
      })
    }
    if (!el) {
      el = document.createElement('div')
      el.innerHTML = `[[${type} block placeholder]]`
      el.contenteditable = 'false'
      el.spellcheck = 'false'
    }
  } else {
    return null
  }
  el.setAttribute('data-grid-id', id)
  return el
}

function itemsToEls (items) {
  return items.map(itemToDOM)
}

export default function (items) {
  let elements = itemsToEls(items)
  var container = document.createElement('div')
  elements.forEach((el) => {
    if (el) container.appendChild(el)
  })
  return fromDOM(GridSchema, container)
}