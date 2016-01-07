import {Block, Attribute} from 'prosemirror/src/model'
import {elt} from 'prosemirror/src/dom'

export function makeMediaDom (attrs) {
  let {title, description} = attrs
  let element = elt('div', {},
    elt('p', {}, (description || ''))
  )
  return element
}

export class Media extends Block {
  static get kinds() { return 'doc media' }
  get attrs() {
    return {
      id: new Attribute({default: 'uuid-0000'}),
      type: new Attribute({default: 'media'})
    }
  }
}
Media.register('parseDOM', {
  tag: 'div',
  parse: function (dom, state) {
    console.log(dom, state)
    state.insert(this, {
      id: dom.getAttribute('grid-id') || null,
      type: dom.getAttribute('grid-type') || null
    })
  }
})
Media.prototype.serializeDOM = (node, s) => s.elt('div', {
  'grid-id': node.attrs.id,
  'grid-type': node.attrs.type
}, `${node.attrs.type} media block`)
