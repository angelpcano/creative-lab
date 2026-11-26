import { useRef } from 'react'
import type { EditorState, SelectedElement } from '../engine/EditorEngine'
import { Icon } from './Icon'

type EditorToolbarProps = {
  state: EditorState
  selection: SelectedElement | null
  selectedLocked: boolean
  onAddText: () => void
  onAddShape: () => void
  onImportImage: (file?: File) => void
  onUndo: () => void
  onRedo: () => void
  onCopy: () => void
  onPaste: () => void
  onDuplicate: () => void
  onGroup: () => void
  onUngroup: () => void
  onToggleLock: () => void
  onAlign: (alignment: string) => void
  onDelete: () => void
}

export function EditorToolbar({
  state,
  selection,
  selectedLocked,
  onAddText,
  onAddShape,
  onImportImage,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onDuplicate,
  onGroup,
  onUngroup,
  onToggleLock,
  onAlign,
  onDelete,
}: EditorToolbarProps) {
  const imageInputRef = useRef<HTMLInputElement>(null)

  return (
    <nav className="toolbar" aria-label="Herramientas del editor">
      <div className="toolbar-scroll">
        <div className="toolbar-section">
          <span className="toolbar-label">AÑADIR</span>
          <button className="tool-button" type="button" onClick={onAddText}>
            <Icon name="text" /><span>Texto</span>
          </button>
          <button className="tool-button" type="button" onClick={onAddShape}>
            <Icon name="rectangle" /><span>Forma</span>
          </button>
          <button
            className="tool-button"
            type="button"
            onClick={() => imageInputRef.current?.click()}
          >
            <Icon name="image" /><span>Imagen</span>
          </button>
          <input
            ref={imageInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            aria-label="Seleccionar archivo de imagen"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              onImportImage(file)
              event.currentTarget.value = ''
            }}
          />
        </div>
        <span className="toolbar-divider" />
        <div className="toolbar-section">
          <button
            className="tool-button"
            type="button"
            disabled={!state.canUndo}
            title="Deshacer (Ctrl+Z)"
            onClick={onUndo}
          >
            <Icon name="undo" /><span>Deshacer</span>
          </button>
          <button
            className="tool-button"
            type="button"
            disabled={!state.canRedo}
            title="Rehacer (Ctrl+Y)"
            onClick={onRedo}
          >
            <Icon name="redo" /><span>Rehacer</span>
          </button>
        </div>
        <span className="toolbar-divider" />
        <div className="toolbar-section">
          <button
            className="tool-button"
            type="button"
            disabled={!selection || selection.count !== 1}
            title="Copiar (Ctrl+C)"
            onClick={onCopy}
          >
            <Icon name="copy" /><span>Copiar</span>
          </button>
          <button
            className="tool-button"
            type="button"
            disabled={!state.canPaste}
            title="Pegar (Ctrl+V)"
            onClick={onPaste}
          >
            <Icon name="duplicate" /><span>Pegar</span>
          </button>
          <button
            className="tool-button"
            type="button"
            disabled={!selection || selection.count !== 1}
            onClick={onDuplicate}
          >
            <Icon name="duplicate" /><span>Duplicar</span>
          </button>
        </div>
        <span className="toolbar-divider" />
        <div className="toolbar-section">
          <button
            className="tool-button"
            type="button"
            disabled={!selection || selection.count < 2}
            onClick={onGroup}
          >
            <Icon name="group" /><span>Agrupar</span>
          </button>
          <button
            className="tool-button"
            type="button"
            disabled={selection?.type !== 'Grupo'}
            onClick={onUngroup}
          >
            <Icon name="ungroup" /><span>Desagrupar</span>
          </button>
          <button
            className="tool-button"
            type="button"
            disabled={!selection || selection.count !== 1}
            onClick={onToggleLock}
          >
            <Icon name={selectedLocked ? 'unlock' : 'lock'} />
            <span>{selectedLocked ? 'Desbloquear' : 'Bloquear'}</span>
          </button>
        </div>
        <span className="toolbar-divider" />
        <label className="align-control">
          <Icon name="align" size={16} />
          <select
            aria-label="Alinear selección"
            disabled={!selection}
            defaultValue=""
            onChange={(event) => {
              onAlign(event.currentTarget.value)
              event.currentTarget.value = ''
            }}
          >
            <option value="" disabled>Alinear</option>
            <option value="izquierda">Alinear a la izquierda</option>
            <option value="centro-x">Centrar horizontalmente</option>
            <option value="derecha">Alinear a la derecha</option>
            <option value="arriba">Alinear arriba</option>
            <option value="centro-y">Centrar verticalmente</option>
            <option value="abajo">Alinear abajo</option>
          </select>
        </label>
        <button
          className="tool-button tool-button-danger"
          type="button"
          disabled={!selection}
          onClick={onDelete}
        >
          <Icon name="trash" /><span>Eliminar</span>
        </button>
      </div>
    </nav>
  )
}
