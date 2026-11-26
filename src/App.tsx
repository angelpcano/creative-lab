import { useCallback, useRef, useState } from 'react'
import EditorCanvas, { type EditorCanvasHandle } from './editor/EditorCanvas'
import { EditorToolbar } from './editor/components/EditorToolbar'
import { Icon } from './editor/components/Icon'
import { LayersPanel } from './editor/components/LayersPanel'
import { PropertiesPanel } from './editor/components/PropertiesPanel'
import { DOCUMENT_PRESETS } from './editor/documentPresets'
import { useEditorController } from './editor/hooks/useEditorController'
import { ProjectDashboard } from './projects/ProjectDashboard'
import { downloadBlob, dataUrlToBlob } from './shared/blobUtils'
import { useProjectManager } from './projects/useProjectManager'
import { ThemeToggle, type AppTheme } from './shared/ThemeToggle'
import './App.css'

type Notice = {
  message: string
  tone: 'normal' | 'error'
}

type ExportFormat = 'png' | 'jpg' | 'svg' | 'pdf'

function getSavedTheme(): AppTheme {
  try {
    return window.localStorage.getItem('creative-lab-theme') === 'dark' ? 'dark' : 'light'
  } catch (error) {
    console.error('No se pudo leer la preferencia del tema.', error)
    return 'light'
  }
}

function safeFilename(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'creative-lab'
}

function App() {
  const editorRef = useRef<EditorCanvasHandle>(null)
  const [notice, setNotice] = useState<Notice>({
    message: 'Selecciona un elemento o añade uno nuevo.',
    tone: 'normal',
  })
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png')
  const [theme, setTheme] = useState<AppTheme>(getSavedTheme)
  const projectManager = useProjectManager()
  const {
    editorState,
    onStateChange,
    preset,
    setPreset,
    customWidth,
    setCustomWidth,
    customHeight,
    setCustomHeight,
  } = useEditorController(DOCUMENT_PRESETS)
  const selection = editorState.selection
  const selectedLayer = editorState.layers.find((layer) => layer.id === selection?.id)
  const activeProject = projectManager.activeProject
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    try {
      window.localStorage.setItem('creative-lab-theme', nextTheme)
    } catch (error) {
      console.error('No se pudo guardar la preferencia del tema.', error)
    }
  }

  const handleEngineError = useCallback((message: string) => {
    setNotice({ message: `No se pudo abrir el documento: ${message}`, tone: 'error' })
  }, [])

  const runAction = async (
    action: () => void | Promise<void>,
    successMessage?: string,
  ) => {
    try {
      await action()
      if (successMessage) setNotice({ message: successMessage, tone: 'normal' })
    } catch (error) {
      setNotice({
        message:
          error instanceof Error
            ? `No se pudo completar la acción: ${error.message}`
            : 'No se pudo completar la acción.',
        tone: 'error',
      })
      throw error
    }
  }

  const handleImageImport = (file?: File) => {
    if (!file) return
    void runAction(
      () => editorRef.current?.addImage(file),
      'Imagen añadida al lienzo.',
    ).catch(() => undefined)
  }

  const handleExport = async () => {
    try {
      let blob: Blob
      let extension = exportFormat
      if (exportFormat === 'png' || exportFormat === 'jpg') {
        const dataUrl = editorRef.current?.exportRaster(
          exportFormat === 'png' ? 'png' : 'jpeg',
          1,
        )
        if (!dataUrl) throw new Error('El lienzo todavía no está listo para exportar.')
        blob = dataUrlToBlob(dataUrl)
      } else if (exportFormat === 'svg') {
        const svg = await editorRef.current?.exportSvg()
        if (!svg) throw new Error('No se pudo generar el archivo SVG.')
        blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      } else {
        const pdf = await editorRef.current?.exportPdf()
        if (!pdf) throw new Error('No se pudo generar el archivo PDF.')
        blob = pdf
      }

      const document = editorRef.current?.getDesignDocument()
      downloadBlob(blob, `${safeFilename(document?.name ?? 'creative-lab')}.${extension}`)
      setNotice({
        message: `Diseño exportado como ${extension.toUpperCase()} · ${editorState.width} × ${editorState.height} px.`,
        tone: 'normal',
      })
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : 'Falló la exportación.',
        tone: 'error',
      })
    }
  }

  const handlePortableExport = async (id: string) => {
    const blob = await projectManager.exportPackage(id)
    const projectName = activeProject?.document.id === id
      ? activeProject.document.name
      : projectManager.projects.find((project) => project.id === id)?.name ?? 'creative-lab'
    downloadBlob(blob, `${safeFilename(projectName)}.clab`)
  }

  const applyPreset = (value: string) => {
    setPreset(value)
    const item = DOCUMENT_PRESETS.find(
      (entry) => `${entry.width}x${entry.height}` === value,
    )
    if (item) editorRef.current?.resizeDocument(item.width, item.height)
  }

  const applyCustomSize = () => {
    if (!Number.isInteger(customWidth) || !Number.isInteger(customHeight)) {
      setNotice({ message: 'Las dimensiones deben ser números enteros.', tone: 'error' })
      return
    }
    if (
      customWidth < 100 ||
      customHeight < 100 ||
      customWidth > 5000 ||
      customHeight > 5000
    ) {
      setNotice({ message: 'Usa dimensiones entre 100 y 5000 px.', tone: 'error' })
      return
    }
    editorRef.current?.resizeDocument(customWidth, customHeight)
    setPreset('custom')
  }

  const beginAction = (
    action: () => void | Promise<void>,
    successMessage: string,
  ) => {
    void runAction(action, successMessage).catch(() => undefined)
  }

  if (!activeProject) {
    return (
      <ProjectDashboard
        projects={projectManager.projects}
        saveStatus={projectManager.saveStatus}
        error={projectManager.error}
        theme={theme}
        onToggleTheme={toggleTheme}
        onCreate={async (name, width, height) => {
          await projectManager.createProject(width, height, name)
        }}
        onOpen={async (id) => { await projectManager.openProject(id) }}
        onRename={projectManager.renameProject}
        onDuplicate={async (id) => { await projectManager.duplicateProject(id) }}
        onDelete={projectManager.deleteProject}
        onExport={handlePortableExport}
        onImport={async (file) => { await projectManager.importPackage(file) }}
      />
    )
  }

  const saveLabel =
    projectManager.saveStatus === 'saving' ? 'Guardando…' :
      projectManager.saveStatus === 'error' ? 'Error al guardar' :
        projectManager.saveStatus === 'saved' ? 'Guardado local' : 'Preparando guardado'

  const selectedLocked = selectedLayer?.locked ?? false

  return (
    <div className={`app-shell${theme === 'dark' ? ' theme-dark' : ''}`}>
      <header className="topbar">
        <div className="brand" aria-label="Creative Lab">
          <span className="brand-mark"><Icon name="spark" size={20} /></span>
          <span className="brand-name">creative<span>lab</span></span>
          <span className="brand-credit">Ángel Pantoja Cano ❤️ 2026</span>
        </div>
        <div className="document-title">
          <span className="document-name">{activeProject.document.name}</span>
          <span className={`document-status document-status-${projectManager.saveStatus}`}>
            <span /> {saveLabel}
          </span>
        </div>
        <div className="topbar-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <select
            className="export-format-select"
            aria-label="Formato de exportación"
            value={exportFormat}
            onChange={(event) => setExportFormat(event.currentTarget.value as ExportFormat)}
          >
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="svg">SVG</option>
            <option value="pdf">PDF</option>
          </select>
          <button className="export-button" type="button" onClick={() => void handleExport()}>
            <Icon name="download" size={16} />
            <span>Exportar {exportFormat.toUpperCase()}</span>
          </button>
          <button
            className="close-project-button"
            type="button"
            onClick={() => beginAction(projectManager.closeProject, 'Proyecto guardado.')}
          >
            Volver a proyectos
          </button>
        </div>
      </header>

      <EditorToolbar
        state={editorState}
        selection={selection}
        selectedLocked={selectedLocked}
        onAddText={() => editorRef.current?.addText()}
        onAddShape={() => editorRef.current?.addRectangle()}
        onImportImage={handleImageImport}
        onUndo={() => beginAction(() => editorRef.current?.undo(), 'Cambio deshecho.')}
        onRedo={() => beginAction(() => editorRef.current?.redo(), 'Cambio rehecho.')}
        onCopy={() => beginAction(
          () => editorRef.current?.copySelected(),
          'Elemento copiado.',
        )}
        onPaste={() => beginAction(
          () => editorRef.current?.paste(),
          'Elemento pegado.',
        )}
        onDuplicate={() => beginAction(
          () => editorRef.current?.duplicateSelected(),
          'Elemento duplicado.',
        )}
        onGroup={() => editorRef.current?.groupSelected()}
        onUngroup={() => editorRef.current?.ungroupSelected()}
        onToggleLock={() => editorRef.current?.toggleSelectedLock()}
        onAlign={(alignment) => editorRef.current?.alignSelection(alignment)}
        onDelete={() => editorRef.current?.deleteSelected()}
      />

      <main className="editor-layout">
        <LayersPanel
          layers={editorState.layers}
          onSelect={(id) => editorRef.current?.selectLayer(id)}
          onRename={(id, name) => editorRef.current?.renameLayer(id, name)}
          onToggleVisibility={(id) => editorRef.current?.toggleLayerVisibility(id)}
          onToggleLock={(id) => editorRef.current?.toggleLayerLock(id)}
          onReorder={(id, direction) => editorRef.current?.reorderLayer(id, direction)}
        />

        <section className="workspace" aria-label="Área de diseño">
          <div className="workspace-heading">
            <div>
              <span className="eyebrow">LIENZO</span>
              <h1>Diseño <span>·</span> {editorState.width} × {editorState.height} px</h1>
            </div>
            <span className="dimension-pill">
              {editorState.width} × {editorState.height} px
            </span>
          </div>

          <EditorCanvas
            key={activeProject.document.id}
            ref={editorRef}
            initialDocument={activeProject.document}
            initialResources={activeProject.resources}
            onStateChange={onStateChange}
            onDocumentChange={projectManager.scheduleAutosave}
            onResourceImport={projectManager.addImportedResource}
            onEngineError={handleEngineError}
          />

          <footer className="workspace-footer">
            <span className={`notice notice-${notice.tone}`} role="status">
              <Icon name={notice.tone === 'error' ? 'spark' : 'check'} size={15} />
              {notice.message}
            </span>
            <div className="viewport-controls">
              <button
                className={`viewport-toggle${editorState.grid ? ' viewport-toggle-active' : ''}`}
                type="button"
                aria-pressed={editorState.grid}
                onClick={() => editorRef.current?.toggleGrid()}
                title="Mostrar u ocultar cuadrícula"
              >
                <Icon name="grid" size={15} /><span>Cuadrícula</span>
              </button>
              <button
                className={`viewport-toggle${editorState.snapping ? ' viewport-toggle-active' : ''}`}
                type="button"
                aria-pressed={editorState.snapping}
                onClick={() => editorRef.current?.toggleSnapping()}
                title="Activar o desactivar ajuste magnético"
              >
                <Icon name="align" size={15} /><span>Ajuste</span>
              </button>
              <span className="viewport-divider" />
              <button
                className="zoom-button"
                type="button"
                aria-label="Alejar"
                onClick={() => editorRef.current?.setZoom(editorState.zoom - 0.1)}
              >
                <Icon name="zoomOut" size={17} />
              </button>
              <span className="zoom-value">{Math.round(editorState.zoom * 100)}%</span>
              <button
                className="zoom-button"
                type="button"
                aria-label="Acercar"
                onClick={() => editorRef.current?.setZoom(editorState.zoom + 0.1)}
              >
                <Icon name="zoomIn" size={17} />
              </button>
              <button
                className="fit-button"
                type="button"
                onClick={() => editorRef.current?.fitToScreen()}
              >
                <Icon name="fit" size={15} /><span>Ajustar</span>
              </button>
            </div>
          </footer>
        </section>

        <PropertiesPanel
          selection={selection}
          selectedLayer={selectedLayer}
          width={editorState.width}
          height={editorState.height}
          background={editorState.background}
          preset={preset}
          presets={DOCUMENT_PRESETS}
          customWidth={customWidth}
          customHeight={customHeight}
          onSetProperty={(property, value) =>
            editorRef.current?.setSelectedProperty(property, value)}
          onSetCrop={(axis, value) => editorRef.current?.setSelectedCrop(axis, value)}
          onSetBackground={(color) => editorRef.current?.setDocumentBackground(color)}
          onToggleLock={() => editorRef.current?.toggleSelectedLock()}
          onPresetChange={applyPreset}
          onCustomWidthChange={setCustomWidth}
          onCustomHeightChange={setCustomHeight}
          onApplyCustomSize={applyCustomSize}
        />
      </main>
      {projectManager.error && (
        <div className="editor-storage-error" role="alert">
          No se pudo guardar el proyecto: {projectManager.error}
        </div>
      )}
    </div>
  )
}

export default App
