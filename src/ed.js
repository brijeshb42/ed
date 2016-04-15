import {createElement as el} from 'react'
import ReactDOM from 'react-dom'
import './util/react-tap-hack'
import _ from './util/lodash'
import uuid from 'uuid'

import {TextSelection} from 'prosemirror/src/edit/selection'

import GridToDoc from './convert/grid-to-doc'
import DocToGrid from './convert/doc-to-grid'
import determineFold from './convert/determine-fold'

import App from './components/app'

function noop () {}


export default class Ed {
  constructor (options) {
    if (!options) {
      throw new Error('Missing options')
    }
    if (!options.initialContent) {
      throw new Error('Missing options.initialContent array')
    }
    if (!options.onChange) {
      throw new Error('Missing options.onChange')
    }
    if (!options.onShareUrl) {
      throw new Error('Missing options.onShareUrl')
    }
    if (!options.onShareFile) {
      throw new Error('Missing options.onShareFile')
    }
    if (!options.container) {
      throw new Error('Missing options.container')
    }

    // Initialize store
    this._events = {}
    this._content = {}
    this._coverPreviews = {}
    this._initializeContent(options.initialContent)
    const {media, content} = determineFold(options.initialContent, this._coverPreviews)
    this._foldMedia = (media ? media.id : null)
    options.initialMedia = media
    options.initialContent = content
    options.store = this

    // Events
    this.on('change', options.onChange)
    options.onChange = this.routeChange.bind(this)
    this.onShareUrl = options.onShareUrl
    this.onShareFile = options.onShareFile
    this.onPlaceholderCancel = options.onPlaceholderCancel || noop
    this.onCommandsChanged = options.onCommandsChanged

    // Listen for first render
    this.on('plugin.widget.initialized', options.onMount || noop)

    // Setup main DOM structure
    this.container = options.container
    this.app = el(App, options)
    ReactDOM.render(this.app, options.container)
  }
  teardown () {
    ReactDOM.unmountComponentAtNode(this.container)
  }
  routeChange (type, payload) {
    switch (type) {
      case 'EDITABLE_INITIALIZE':
        this._editableInitialize(payload)
        break
      case 'MEDIA_BLOCK_UPDATE':
        this._updateMediaBlock(payload)
        this.trigger('change')
        break
      case 'MEDIA_BLOCK_UPDATE_META':
        const mutatedBlock = this._updateMetaByPath(payload)
        this.trigger('change')
        return mutatedBlock
      case 'MEDIA_BLOCK_REMOVE':
        this._removeMediaBlock(payload)
        this.trigger('change')
        break
      case 'DEDUPE_IDS':
        this._dedupeIds()
        this.trigger('change')
        break
      case 'PLUGIN_URL':
        const {index, id, block, url} = payload
        this._replaceBlock(index, block)
        this.onShareUrl({block: id, url})
        break
      case 'EDITABLE_CHANGE':
        this.trigger('change')
        break
      case 'FOLD_MEDIA_SHARE':
        // const {url, rest} = payload
        const newId = uuid.v4()
        const share =
          { id: newId
          , type: 'placeholder'
          , metadata:
            { starred: true
            , status: `Sharing... ${payload.url}`
            }
          }
        this._foldMedia = share.id
        this._initializeContent([share])
        this.trigger('fold.media.change', share)
        this.onShareUrl({block: newId, url: payload.url})
        // Make a new text block with rest of above fold text
        if (payload.rest) {
          const belowFold =
            { type: 'text'
            , html: `<p>${payload.rest}</p>`
            }
          this._insertBlocks(0, [belowFold])
          this.trigger('change')
        }
        break
      case 'FOLD_MEDIA_UPLOAD':
        this.onShareFile(0)
        break
      case 'FOLD_MEDIA_INIT':
        this._initializeContent([payload])
        this._foldMedia = payload.id
        this.trigger('fold.media.change', payload)
        this.trigger('change')
        break
      case 'FOLD_MEDIA_CHANGE':
        this._updateMediaBlock(payload)
        this.trigger('fold.media.change', payload)
        this.trigger('change')
        break
      case 'FOLD_TEXT_CHANGE':
        if (!this._foldMedia) {
          const titleBlock =
            { id: uuid.v4()
            , type: 'text'
            , metadata: {starred: true}
            }
          this._initializeContent([titleBlock])
          this._foldMedia = titleBlock.id
        }
        // MUTATION
        const textBlock = this.getBlock(this._foldMedia)
        textBlock.html = `<p>${payload}</p>`
        this.trigger('change')
        break
      case 'PLACEHOLDER_CANCEL':
        this._placeholderCancel(payload)
        break
      default:
        throw new Error(`ed.routeChange '${type}' does not exist`)
    }
  }
  _editableInitialize (editableView) {
    if (this.editableView) {
      throw new Error('Ed._editableInitialize should only be called once')
    }
    this.editableView = editableView
    this.pm = editableView.pm
  }
  _initializeContent (content) {
    for (let i = 0, len = content.length; i < len; i++) {
      const block = content[i]
      if (!block || !block.id) {
        continue
      }
      this._content[block.id] = block
    }
  }
  execCommand (commandName) {
    if (!this.pm || !this.pm.commands || !this.pm.commands[commandName] || !this.pm.commands[commandName].exec) {
      throw new Error('Can not exec this commandName: ' + commandName)
    }
    this.pm.commands[commandName].exec(this.pm)
  }
  on (eventName, func) {
    let events = this._events[eventName]
    if (!events) {
      events = this._events[eventName] = []
    }
    events.push(func)
  }
  off (eventName, func) {
    const events = this._events[eventName]
    if (!events) {
      return
    }
    const index = events.indexOf(func)
    if (index > -1) {
      events.splice(index, 1)
    }
  }
  trigger (eventName, payload) {
    const events = this._events[eventName]
    if (!events) {
      return
    }
    for (let i = 0, len = events.length; i < len; i++) {
      events[i](payload)
    }
  }
  _updateMetaByPath ({id, path, value}) {
    let block = this.getBlock(id)
    if (!block) {
      throw new Error('Can not update this block')
    }
    // MUTATION
    let parent = block.metadata
    for (let i = 0, length = path.length; i < length - 1; i++) {
      parent = parent[path[i]]
    }
    parent[path[path.length - 1]] = value

    return block
  }
  _updateMediaBlock (block) {
    // Widgets and components route here
    if (!block || !block.id) {
      throw new Error('Can not update this block')
    }
    const currentBlock = this.getBlock(block.id)
    if (!currentBlock) {
      throw new Error('Can not find this block')
    }

    // MUTATION
    this._content[block.id] = block
  }
  _removeMediaBlock (id) {
    let block = this.getBlock(id)
    if (!block) {
      throw new Error('Can not find this block id')
    }
    const content = this.getContent()
    const index = getIndexWithId(content, id)
    // MUTATION
    content.splice(index, 1)
    if (this._foldMedia === id) {
      this._foldMedia = null
    }
    // Render
    this._setMergedContent(content)
  }
  _dedupeIds () {
    // Triggered by copy & pasted
    let content = this.getContent()
    let ids = []
    for (let i = 0, len = content.length; i < len; i++) {
      let block = content[i]
      let {id} = block
      if (!id) {
        continue
      }
      if (ids.indexOf(id) !== -1) {
        // MUTATION
        block = _.cloneDeep(block)
        id = uuid.v4()
        block.id = id
        content[i] = block
      }
      ids.push(id)
    }
    // Render
    this._setMergedContent(content)
  }
  getBlock (id) {
    return this._content[id]
  }
  _replaceBlock (index, block) {
    let content = this.getContent()
    if (content[0] && this._foldMedia && content[0].id === this._foldMedia) {
      index += 1
    }
    // MUTATION
    content.splice(index, 1, block)
    // Render
    this._setMergedContent(content)
  }
  _insertBlocks (index, blocks) {
    const content = this.getContent()
    if (content[0] && this._foldMedia && content[0].id === this._foldMedia) {
      index += 1
    }
    // MUTATION
    const newContent = arrayInsertAll(content, index, blocks)
    // Render
    this._setMergedContent(newContent)
  }
  insertPlaceholders (index, count) {
    let toInsert = []
    let ids = []
    for (let i = 0, length = count; i < length; i++) {
      const id = uuid.v4()
      ids.push(id)
      toInsert.push(
        { id
        , type: 'placeholder'
        , metadata: {}
        }
      )
    }
    this._insertBlocks(index, toInsert)
    return ids
  }
  updatePlaceholder (id, metadata) {
    let block = this.getBlock(id)
    if (!block) {
      throw new Error('Can not update this placeholder block')
    }
    if (block.type !== 'placeholder') {
      throw new Error('Block is not a placeholder block')
    }
    // Mutation
    const {status, progress, failed} = metadata
    if (status != null) block.metadata.status = status
    if (progress != null) block.metadata.progress = progress
    if (failed != null) block.metadata.failed = failed
    // Let content widgets know to update
    this.trigger('media.update')
    // Let fold media know to update
    if (this._foldMedia && this._foldMedia === id) {
      this.trigger('fold.media.change', block)
    }
  }
  _placeholderCancel (id) {
    let block = this.getBlock(id)
    if (!block) {
      throw new Error('Can not cancel this placeholder block')
    }
    if (block.type !== 'placeholder') {
      throw new Error('Block is not a placeholder block')
    }
    const content = this.getContent()
    const index = getIndexWithId(content, id)
    // MUTATION
    content.splice(index, 1)
    // Render
    this._setMergedContent(content)
    // Event
    this.onPlaceholderCancel(id)
  }
  setCoverPreview (id, src) {
    const block = this._content[id]
    if (!block) {
      throw new Error('Can not set image preview for block id that does not exist')
    }
    this._coverPreviews[id] = src
    // Let fold media know to update
    if (this._foldMedia && this._foldMedia === id) {
      this.trigger('fold.media.change', block)
    }
  }
  getCoverPreview (id) {
    return this._coverPreviews[id]
  }
  getContent () {
    const doc = this.pm.getContent()
    const content = DocToGrid(doc, this._content)
    if (this._foldMedia) {
      const fold = this.getBlock(this._foldMedia)
      if (!fold.metadata) {
        fold.metadata = {}
      }
      fold.metadata.starred = true
      content.unshift(fold)
    }
    return content
  }
  setContent (content) {
    const merged = mergeContent(this.getContent(), content)
    this._setMergedContent(merged)
  }
  _setMergedContent (mergedContent) {
    this._initializeContent(mergedContent)
    const {media, content} = determineFold(mergedContent, this._coverPreviews)
    this._foldMedia = (media ? media.id : null)
    this.trigger('fold.media.change', media)
    let doc = GridToDoc(content)
    // Make selection to set after DOM update
    let selection = fixSelection(this.pm.selection, this.pm.doc, doc)
    // Populate ProseMirror
    this.pm.setDoc(doc, selection)
    // Let widgets know to update
    this.trigger('media.update')
  }
}

// Util

function getIndexWithId (array, id) {
  for (let i = 0, len = array.length; i < len; i++) {
    let item = array[i]
    if (item.id === id) {
      return i
    }
  }
  return -1
}

// function getItemWithId (array, id) {
//   let index = getIndexWithId(array, id)
//   if (index === -1) return
//   return array[index]
// }

function arrayInsertAll (array, index, arrayToInsert) {
  let before = array.slice(0, index)
  const after = array.slice(index)
  return before.concat(arrayToInsert, after)
}

function mergeContent (oldContent, newContent) {
  // Only add new placeholders and update exiting placeholders
  let merged = oldContent.slice()
  // New placeholders
  for (let i = 0, len = newContent.length; i < len; i++) {
    const block = newContent[i]
    if (block.type === 'placeholder') {
      const index = getIndexWithId(merged, block.id)
      if (index > -1) {
        merged.splice(index, 1, block)
      } else {
        merged.splice(i, 0, block)
      }
    }
  }
  // Old placeholders
  for (let i = 0, len = merged.length; i < len; i++) {
    const block = merged[i]
    if (block.type === 'placeholder') {
      const index = getIndexWithId(newContent, block.id)
      if (index > -1) {
        merged.splice(i, 1, newContent[index])
      }
    }
  }
  return merged
}

function fixSelection (selection, prevDoc, doc) {
  if (!selection.anchor) return selection
  const index = prevDoc.childBefore(selection.anchor).index
  let offset = 0
  for (let i = 0; i < index; i++) {
    offset += doc.child(i).nodeSize
  }
  offset++
  return new TextSelection(offset)
}
