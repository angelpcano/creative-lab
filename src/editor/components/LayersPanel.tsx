import { useState } from 'react'
import type { EditorLayer } from '../engine/EditorEngine'
import { Icon } from './Icon'

type LayersPanelProps = {
  layers: EditorLayer[]
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onToggleVisibility: (id: string) => void
  onToggleLock: (id: string) => void
  onReorder: (id: string, direction: -1 | 1) => void
}

export function LayersPanel({
  layers,
  onSelect,
  onRename,
  onToggleVisibility,
  onToggleLock,
  onReorder,
}: LayersPanelProps) {
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [editingLayerName, setEditingLayerName] = useState('')

  const beginRename = (layer: EditorLayer) => {
    setEditingLayerId(layer.id)
    setEditingLayerName(layer.name)
  }

  const finishRename = (id: string, value: string) => {
    onRename(id, value)
    setEditingLayerId(null)
  }

  return (
    <aside className="layers-panel" aria-label="Capas">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ESTRUCTURA</span>
          <h2>Capas <span>{layers.length}</span></h2>
        </div>
      </div>
      <div className="layer-list" role="list">
        {layers.length === 0 ? (
          <p className="empty-layers">El lienzo está vacío.</p>
        ) : layers.map((layer, index) => (
          <div
            className={`layer-row${layer.selected ? ' layer-row-selected' : ''}${!layer.visible ? ' layer-row-hidden' : ''}`}
            key={layer.id}
            role="listitem"
          >
            <button
              className="layer-select"
              type="button"
              onClick={() => onSelect(layer.id)}
              onDoubleClick={() => beginRename(layer)}
              aria-pressed={layer.selected}
              title="Seleccionar · doble clic para renombrar"
            >
              <span className={`layer-type layer-type-${layer.type.toLowerCase()}`}>
                {layer.type === 'Texto' ? <Icon name="text" size={15} /> :
                  layer.type === 'Imagen' ? <Icon name="image" size={15} /> :
                    layer.type === 'Grupo' ? <Icon name="group" size={15} /> :
                      <Icon name="rectangle" size={15} />}
              </span>
              <span className="layer-copy">
                {editingLayerId === layer.id ? (
                  <input
                    autoFocus
                    className="layer-rename-input"
                    aria-label="Nombre de la capa"
                    value={editingLayerName}
                    onChange={(event) => setEditingLayerName(event.currentTarget.value)}
                    onBlur={(event) => finishRename(layer.id, event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        finishRename(layer.id, event.currentTarget.value)
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        event.currentTarget.value = layer.name
                        setEditingLayerName(layer.name)
                        event.currentTarget.blur()
                      }
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
                ) : (
                  <strong>{layer.name}</strong>
                )}
                <span>{layer.type}</span>
              </span>
            </button>
            <div className="layer-actions">
              <button
                className="layer-action"
                type="button"
                aria-label={layer.visible ? 'Ocultar capa' : 'Mostrar capa'}
                title={layer.visible ? 'Ocultar capa' : 'Mostrar capa'}
                onClick={() => onToggleVisibility(layer.id)}
              >
                <Icon name={layer.visible ? 'eye' : 'eyeOff'} size={15} />
              </button>
              <button
                className={`layer-action${layer.locked ? ' layer-action-active' : ''}`}
                type="button"
                aria-label={layer.locked ? 'Desbloquear capa' : 'Bloquear capa'}
                title={layer.locked ? 'Desbloquear capa' : 'Bloquear capa'}
                onClick={() => onToggleLock(layer.id)}
              >
                <Icon name={layer.locked ? 'lock' : 'unlock'} size={15} />
              </button>
              <button
                className="layer-action layer-order-action"
                type="button"
                aria-label="Subir capa"
                title="Subir capa"
                disabled={index === 0}
                onClick={() => onReorder(layer.id, 1)}
              >
                <Icon name="up" size={15} />
              </button>
              <button
                className="layer-action layer-order-action"
                type="button"
                aria-label="Bajar capa"
                title="Bajar capa"
                disabled={index === layers.length - 1}
                onClick={() => onReorder(layer.id, -1)}
              >
                <Icon name="down" size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="layers-help">Doble clic en una capa para cambiar su nombre.</div>
    </aside>
  )
}
