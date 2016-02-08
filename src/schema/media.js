require('./media.css')

import {Block, Attribute} from 'prosemirror/src/model'

export class Media extends Block {
  static get kinds () { return 'block' }
  get isBlock () { return true }
  get locked () { return true }
  get contains () { return null }
  get canBeEmpty () { return true }
  get attrs () {
    return {
      id: new Attribute({default: 'uuid-0000'}),
      type: new Attribute({default: 'media'})
    }
  }
}
Media.register('parseDOM', 'div', {
  tag: 'div',
  parse: function (dom, state) {
    state.insert(this, {
      id: dom.getAttribute('grid-id') || null,
      type: dom.getAttribute('grid-type') || null
    })
  }
})
Media.prototype.serializeDOM = (node, s) => s.elt('div',
  {
    'class': 'EdSchemaMedia',
    'grid-id': node.attrs.id,
    'grid-type': node.attrs.type,
    'title': `${node.attrs.type} widget here`,
    'contenteditable': 'false'
  }
)
