import type {
  EditableProperty,
  EditorLayer,
  SelectedElement,
} from '../engine/EditorEngine'
import type { DocumentPreset } from '../documentPresets'
import { ColorField, NumberField } from './Fields'
import { Icon } from './Icon'

type PropertiesPanelProps = {
  selection: SelectedElement | null
  selectedLayer?: EditorLayer
  width: number
  height: number
  background: string
  preset: string
  presets: DocumentPreset[]
  customWidth: number
  customHeight: number
  onSetProperty: (property: EditableProperty, value: string | number | boolean) => void
  onSetCrop: (axis: 'x' | 'y', value: number) => void
  onSetBackground: (color: string) => void
  onToggleLock: () => void
  onPresetChange: (value: string) => void
  onCustomWidthChange: (value: number) => void
  onCustomHeightChange: (value: number) => void
  onApplyCustomSize: () => void
}

function colorValue(value: string) {
  return /^#[\da-f]{6}$/i.test(value) ? value : '#20211f'
}

export function PropertiesPanel({
  selection,
  selectedLayer,
  width,
  height,
  background,
  preset,
  presets,
  customWidth,
  customHeight,
  onSetProperty,
  onSetCrop,
  onSetBackground,
  onToggleLock,
  onPresetChange,
  onCustomWidthChange,
  onCustomHeightChange,
  onApplyCustomSize,
}: PropertiesPanelProps) {
  return (
    <aside className="inspector" aria-label="Propiedades y documento">
      <div className="inspector-heading">
        <div>
          <span className="eyebrow">AJUSTES</span>
          <h2>Propiedades</h2>
        </div>
        <span className="inspector-dot" />
      </div>

      {selection ? (
        <section className="property-section">
          <div className="selection-label">
            <span className="selection-type-icon">
              <Icon
                name={selection.type === 'Texto' ? 'text' : selection.type === 'Imagen' ? 'image' : 'cursor'}
                size={16}
              />
            </span>
            <div>
              <strong>{selection.count > 1 ? `${selection.count} elementos` : selection.name}</strong>
              <span>{selection.type}{selectedLayer?.locked ? ' · Bloqueado' : ' · Seleccionado'}</span>
            </div>
          </div>
          <div className="property-grid">
            <NumberField label="X" value={selection.x} onChange={(value) => onSetProperty('left', value)} />
            <NumberField label="Y" value={selection.y} onChange={(value) => onSetProperty('top', value)} />
            <NumberField label="Ancho" value={selection.width} min={1} onChange={(value) => onSetProperty('width', value)} />
            <NumberField label="Alto" value={selection.height} min={1} onChange={(value) => onSetProperty('height', value)} />
            <NumberField label="Rotación" value={selection.angle} onChange={(value) => onSetProperty('angle', value)} />
            <NumberField label="Opacidad %" value={Math.round(selection.opacity * 100)} min={0} max={100} onChange={(value) => onSetProperty('opacity', value / 100)} />
          </div>

          {selection.type !== 'Imagen' && (
            <>
              <label className="field-label" htmlFor="fill-color">Relleno</label>
              <ColorField
                id="fill-color"
                value={colorValue(selection.fill)}
                onChange={(value) => onSetProperty('fill', value)}
              />
            </>
          )}
          {selection.type !== 'Grupo' && (
            <>
              <label className="field-label property-spaced" htmlFor="stroke-color">Borde</label>
              <div className="property-grid property-grid-stroke">
                <ColorField
                  id="stroke-color"
                  value={colorValue(selection.stroke || '#20211f')}
                  onChange={(value) => onSetProperty('stroke', value)}
                />
                <NumberField label="Grosor" value={selection.strokeWidth} min={0} max={80} onChange={(value) => onSetProperty('strokeWidth', value)} />
              </div>
            </>
          )}

          {selection.type === 'Texto' && (
            <div className="text-properties">
              <label className="field-label property-spaced" htmlFor="font-family">Familia tipográfica</label>
              <select
                id="font-family"
                className="property-select"
                value={selection.fontFamily}
                onChange={(event) => onSetProperty('fontFamily', event.currentTarget.value)}
              >
                {['Arial', 'Georgia', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Times New Roman'].map((family) => (
                  <option key={family} value={family}>{family}</option>
                ))}
              </select>
              <div className="property-grid property-spaced">
                <NumberField label="Tamaño" value={selection.fontSize} min={8} max={240} onChange={(value) => onSetProperty('fontSize', value)} />
                <NumberField label="Interlineado" value={selection.lineHeight} min={0.5} max={3} step={0.05} onChange={(value) => onSetProperty('lineHeight', value)} />
              </div>
              <div className="text-style-row">
                <label className="check-control">
                  <input type="checkbox" checked={selection.fontWeight >= 600} onChange={(event) => onSetProperty('fontWeight', event.currentTarget.checked ? 700 : 400)} />
                  <strong>N</strong><span>Negrita</span>
                </label>
                <label className="check-control">
                  <input type="checkbox" checked={selection.fontStyle === 'italic'} onChange={(event) => onSetProperty('fontStyle', event.currentTarget.checked ? 'italic' : 'normal')} />
                  <em>C</em><span>Cursiva</span>
                </label>
                <label className="check-control check-underline">
                  <input type="checkbox" checked={selection.underline} onChange={(event) => onSetProperty('underline', event.currentTarget.checked)} />
                  <u>S</u><span>Subrayado</span>
                </label>
              </div>
              <div className="property-grid property-spaced">
                <label className="field-label" htmlFor="text-align">Alineación</label>
                <select
                  id="text-align"
                  className="property-select"
                  value={selection.textAlign}
                  onChange={(event) => onSetProperty('textAlign', event.currentTarget.value)}
                >
                  <option value="left">Izquierda</option>
                  <option value="center">Centrada</option>
                  <option value="right">Derecha</option>
                  <option value="justify">Justificada</option>
                </select>
              </div>
              <NumberField label="Espaciado entre letras (px)" value={selection.letterSpacing} min={-10} max={100} onChange={(value) => onSetProperty('letterSpacing', value)} />
              <p className="property-help">Doble clic en el texto del lienzo para editar su contenido.</p>
            </div>
          )}

          {selection.type === 'Imagen' && (
            <section className="image-crop-section">
              <span className="field-label property-spaced">Recorte de imagen</span>
              <div className="property-grid">
                <NumberField label="Recortar izquierda" value={Math.round(selection.cropX)} min={0} max={Math.max(0, selection.sourceWidth - 1)} onChange={(value) => onSetCrop('x', value)} />
                <NumberField label="Recortar arriba" value={Math.round(selection.cropY)} min={0} max={Math.max(0, selection.sourceHeight - 1)} onChange={(value) => onSetCrop('y', value)} />
              </div>
              <p className="property-help">Recorte en píxeles de la imagen original.</p>
            </section>
          )}

          <button
            className="delete-property-button"
            type="button"
            disabled={selection.count !== 1}
            onClick={onToggleLock}
          >
            <Icon name={selectedLayer?.locked ? 'unlock' : 'lock'} size={15} />
            {selectedLayer?.locked ? 'Desbloquear elemento' : 'Bloquear elemento'}
          </button>
        </section>
      ) : (
        <section className="empty-selection">
          <div className="empty-selection-mark"><Icon name="cursor" size={20} /></div>
          <h3>Ningún elemento seleccionado</h3>
          <p>Selecciona una capa o un objeto del lienzo para editar sus propiedades.</p>
        </section>
      )}

      <div className="inspector-rule" />
      <section className="document-properties">
        <span className="eyebrow">DOCUMENTO</span>
        <label className="field-label property-spaced" htmlFor="canvas-preset">Formato</label>
        <select
          id="canvas-preset"
          className="property-select"
          value={preset}
          onChange={(event) => onPresetChange(event.currentTarget.value)}
        >
          <option value="custom">Tamaño personalizado</option>
          {presets.map((item) => (
            <option key={item.name} value={`${item.width}x${item.height}`}>{item.name}</option>
          ))}
        </select>
        <div className="property-grid property-spaced">
          <NumberField label="Ancho px" value={customWidth} min={100} max={5000} onChange={onCustomWidthChange} />
          <NumberField label="Alto px" value={customHeight} min={100} max={5000} onChange={onCustomHeightChange} />
        </div>
        <button className="apply-size-button" type="button" onClick={onApplyCustomSize}>
          Aplicar dimensiones
        </button>
        <label className="field-label property-spaced" htmlFor="background-color">Color de fondo</label>
        <ColorField
          id="background-color"
          value={colorValue(background)}
          onChange={onSetBackground}
        />
        <p className="property-help">
          El documento mide {width} × {height} px. Al cambiar el formato, el contenido conserva su proporción y se centra.
        </p>
      </section>
    </aside>
  )
}
