import {
  ActiveSelection,
  Canvas,
  FabricImage,
  Group,
  IText,
  Line,
  Point,
  Rect,
  type FabricObject,
} from 'fabric'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import type { DesignDocument } from '../domain/designDocument'
import {
  type EditableProperty,
  type EditorEngine,
  type EditorResource,
  type EditorLayer,
  type EditorState,
  type SelectedElement,
  type DesignDocumentListener,
  type ResourceImportListener,
} from './engine/EditorEngine'
import { FabricDocumentAdapter } from './engine/FabricDocumentAdapter'
import { createDesignPdf } from './export/pdfExport'
import { blobToDataUrl } from '../shared/blobUtils'

const CUSTOM_PROPERTIES = [
  'creativeLabId',
  'creativeLabName',
  'creativeLabLocked',
  'creativeLabHelper',
  'creativeLabResourceId',
  'creativeLabMediaType',
]
const HISTORY_LIMIT = 60
type ElementType = EditorLayer['type']

export type {
  EditorLayer,
  EditorState,
  SelectedElement,
} from './engine/EditorEngine'
export type EditorCanvasHandle = EditorEngine

type EditorCanvasProps = {
  initialDocument: DesignDocument
  initialResources: EditorResource[]
  onStateChange: (state: EditorState) => void
  onDocumentChange?: DesignDocumentListener
  onResourceImport: ResourceImportListener
  onEngineError: (message: string) => void
}

type ViewState = {
  width: number
  height: number
  background: string
  zoom: number
  fitScale: number
  grid: boolean
  snapping: boolean
}

let nextLayerId = 0

function createLayerId() {
  nextLayerId += 1
  return `element-${Date.now()}-${nextLayerId}`
}

function getLayerId(object: FabricObject) {
  const id = object.get('creativeLabId')
  if (typeof id === 'string') return id
  const nextId = createLayerId()
  object.set('creativeLabId', nextId)
  return nextId
}

function getLayerName(object: FabricObject) {
  const name = object.get('creativeLabName')
  return typeof name === 'string' ? name : 'Elemento'
}

function setMetadata(
  object: FabricObject,
  name: string,
  options: { id?: string; locked?: boolean; helper?: boolean } = {},
) {
  object.set({
    creativeLabId: options.id ?? createLayerId(),
    creativeLabName: name,
    creativeLabLocked: options.locked ?? false,
    creativeLabHelper: options.helper ?? false,
  })
}

function getElementType(object: FabricObject): ElementType {
  if (object instanceof IText) return 'Texto'
  if (object instanceof FabricImage) return 'Imagen'
  if (object instanceof Group) return 'Grupo'
  if (object instanceof Rect || object.type === 'circle' || object.type === 'ellipse') {
    return 'Forma'
  }
  return 'Elemento'
}

function isHelper(object: FabricObject) {
  return object.get('creativeLabHelper') === true
}

function getNestedImages(objects: FabricObject[]): FabricImage[] {
  return objects.flatMap((object) => [
    ...(object instanceof FabricImage ? [object] : []),
    ...(object instanceof Group ? getNestedImages(object.getObjects()) : []),
  ])
}

const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(
  function EditorCanvas({
    initialDocument,
    initialResources,
    onStateChange,
    onDocumentChange,
    onResourceImport,
    onEngineError,
  }, ref) {
    const [initialDocumentSnapshot] = useState(() => structuredClone(initialDocument))
    const [initialResourceMap] = useState(
      () => new Map(initialResources.map((resource) => [resource.id, resource.blob])),
    )
    const canvasElementRef = useRef<HTMLCanvasElement>(null)
    const canvasRef = useRef<Canvas | null>(null)
    const designDocumentRef = useRef<DesignDocument>(initialDocumentSnapshot)
    const documentAdapterRef = useRef(new FabricDocumentAdapter())
    const resourceBlobsRef = useRef(initialResourceMap)
    const stageRef = useRef<HTMLDivElement>(null)
    const restoreHistoryRef = useRef<((direction: 'undo' | 'redo') => Promise<void>) | null>(
      null,
    )
    const viewRef = useRef<ViewState>({
      width: initialDocumentSnapshot.dimensions.width,
      height: initialDocumentSnapshot.dimensions.height,
      background: initialDocumentSnapshot.background.color,
      zoom: 1,
      fitScale: 0.45,
      grid: false,
      snapping: true,
    })
    const historyRef = useRef({
      past: [] as string[],
      future: [] as string[],
      last: '',
      restoring: false,
      suspended: false,
      canPaste: false,
    })
    const clipboardRef = useRef<FabricObject | null>(null)
    const objectUrlsRef = useRef(new Set<string>())
    const textListenersRef = useRef(new WeakSet<IText>())
    const gridLinesRef = useRef<Line[]>([])
    const guideLinesRef = useRef<Line[]>([])
    const [view, setView] = useState(viewRef.current)

    const syncDesignDocument = useCallback((canvas: Canvas, markModified = true) => {
      const current = designDocumentRef.current
      const document = documentAdapterRef.current.toDesignDocument(
        canvas,
        current,
        viewRef.current,
        markModified,
      )
      designDocumentRef.current = document
      const thumbnailScale = Math.min(
        1,
        256 / document.dimensions.width,
        256 / document.dimensions.height,
      )
      const thumbnail = canvas.toDataURL({ format: 'png', multiplier: thumbnailScale })
      onDocumentChange?.(document, thumbnail)
    }, [onDocumentChange])

    useEffect(() => {
      const element = canvasElementRef.current
      if (!element) return
      const objectUrls = objectUrlsRef.current

      const canvas = new Canvas(element, {
        width: initialDocumentSnapshot.dimensions.width,
        height: initialDocumentSnapshot.dimensions.height,
        backgroundColor: viewRef.current.background,
        preserveObjectStacking: true,
        selection: true,
      })
      canvasRef.current = canvas
      let disposed = false
      let cleanupRequested = false
      let loadFinished = false
      let textCommitTimer: ReturnType<typeof setTimeout> | null = null

      const releaseObjectUrls = () => {
        for (const url of objectUrls) URL.revokeObjectURL(url)
        objectUrls.clear()
      }

      const history = historyRef.current
      const getSnapshot = () => {
        const snapshot = canvas.toObject(CUSTOM_PROPERTIES)
        snapshot.objects = snapshot.objects.filter(
          (object: Record<string, unknown>) => object.creativeLabHelper !== true,
        )
        snapshot.creativeLabWidth = viewRef.current.width
        snapshot.creativeLabHeight = viewRef.current.height
        snapshot.creativeLabBackground = viewRef.current.background
        return JSON.stringify(snapshot)
      }

      const emitState = () => {
        const activeObjects = canvas.getActiveObjects()
        const selectedObject =
          activeObjects.length === 1 ? activeObjects[0] : canvas.getActiveObject()
        const object = selectedObject && !isHelper(selectedObject) ? selectedObject : null
        const selectedId = object ? getLayerId(object) : ''
        const textObject = activeObjects.find((entry) => entry instanceof IText)
        const propertyObject =
          object instanceof ActiveSelection && textObject ? textObject : object
        let selection: SelectedElement | null = null

        if (propertyObject) {
          const sourceSize =
            propertyObject instanceof FabricImage
              ? propertyObject.getOriginalSize()
              : { width: propertyObject.width, height: propertyObject.height }
          const bounds = object?.getBoundingRect()
          const fontSize = propertyObject instanceof IText ? propertyObject.fontSize : 32
          const charSpacing = propertyObject instanceof IText ? propertyObject.charSpacing : 0

          selection = {
            id: selectedId || getLayerId(propertyObject),
            name: getLayerName(propertyObject),
            type: getElementType(propertyObject),
            count: activeObjects.length,
            x: Math.round(propertyObject.left ?? 0),
            y: Math.round(propertyObject.top ?? 0),
            width: Math.round(bounds?.width ?? propertyObject.getScaledWidth()),
            height: Math.round(bounds?.height ?? propertyObject.getScaledHeight()),
            angle: Math.round(propertyObject.angle ?? 0),
            opacity: propertyObject.opacity ?? 1,
            fill:
              typeof propertyObject.fill === 'string' ? propertyObject.fill : '#20211f',
            stroke:
              typeof propertyObject.stroke === 'string' ? propertyObject.stroke : '',
            strokeWidth: propertyObject.strokeWidth ?? 0,
            fontFamily: propertyObject instanceof IText ? propertyObject.fontFamily : 'Arial',
            fontSize,
            fontWeight:
              propertyObject instanceof IText
                ? Number(propertyObject.fontWeight) || 400
                : 400,
            fontStyle:
              propertyObject instanceof IText ? propertyObject.fontStyle : 'normal',
            textAlign:
              propertyObject instanceof IText ? propertyObject.textAlign : 'left',
            lineHeight:
              propertyObject instanceof IText ? propertyObject.lineHeight : 1.16,
            letterSpacing:
              propertyObject instanceof IText
                ? Math.round((charSpacing * fontSize) / 1000)
                : 0,
            underline: propertyObject instanceof IText && propertyObject.underline,
            cropX: propertyObject instanceof FabricImage ? propertyObject.cropX : 0,
            cropY: propertyObject instanceof FabricImage ? propertyObject.cropY : 0,
            sourceWidth: sourceSize.width,
            sourceHeight: sourceSize.height,
          }
        }

        const layers = canvas
          .getObjects()
          .filter((entry) => !isHelper(entry))
          .reverse()
          .map((entry) => ({
            id: getLayerId(entry),
            name: getLayerName(entry),
            type: getElementType(entry),
            visible: entry.visible,
            locked: entry.get('creativeLabLocked') === true,
            selected: activeObjects.includes(entry),
          }))

        onStateChange({
          layers,
          selection,
          width: viewRef.current.width,
          height: viewRef.current.height,
          background: viewRef.current.background,
          zoom: viewRef.current.zoom,
          grid: viewRef.current.grid,
          snapping: viewRef.current.snapping,
          canUndo: history.past.length > 0,
          canRedo: history.future.length > 0,
          canPaste: history.canPaste,
        })
      }

      const commitHistory = () => {
        if (history.restoring || history.suspended) return
        const snapshot = getSnapshot()
        if (snapshot === history.last) {
          emitState()
          return
        }
        history.past.push(history.last)
        if (history.past.length > HISTORY_LIMIT) history.past.shift()
        history.future = []
        history.last = snapshot
        syncDesignDocument(canvas)
        emitState()
      }

      const scheduleTextCommit = () => {
        if (textCommitTimer) clearTimeout(textCommitTimer)
        textCommitTimer = setTimeout(() => {
          textCommitTimer = null
          commitHistory()
        }, 400)
      }

      const bindText = (object: FabricObject) => {
        if (!(object instanceof IText) || textListenersRef.current.has(object)) return
        textListenersRef.current.add(object)
        object.on('changed', () => {
          emitState()
          scheduleTextCommit()
        })
        object.on('editing:exited', () => {
          if (textCommitTimer) clearTimeout(textCommitTimer)
          textCommitTimer = null
          commitHistory()
        })
      }

      const clearGuides = () => {
        if (guideLinesRef.current.length === 0) return
        canvas.remove(...guideLinesRef.current)
        guideLinesRef.current = []
      }

      const drawGuides = (vertical?: number, horizontal?: number) => {
        clearGuides()
        const guides: Line[] = []
        if (vertical !== undefined) {
          const line = new Line([vertical, 0, vertical, viewRef.current.height], {
            stroke: '#ef7468',
            strokeWidth: 1,
            selectable: false,
            evented: false,
            excludeFromExport: true,
          })
          setMetadata(line, 'Guía', { helper: true })
          guides.push(line)
        }
        if (horizontal !== undefined) {
          const line = new Line([0, horizontal, viewRef.current.width, horizontal], {
            stroke: '#ef7468',
            strokeWidth: 1,
            selectable: false,
            evented: false,
            excludeFromExport: true,
          })
          setMetadata(line, 'Guía', { helper: true })
          guides.push(line)
        }
        guideLinesRef.current = guides
        if (guides.length) canvas.add(...guides)
      }

      const getSnapMatch = (
        sourcePoints: number[],
        targetPoints: number[],
        threshold: number,
      ) => {
        let nearest: { delta: number; line: number } | undefined
        for (const source of sourcePoints) {
          for (const target of targetPoints) {
            const delta = target - source
            if (Math.abs(delta) <= threshold && (!nearest || Math.abs(delta) < Math.abs(nearest.delta))) {
              nearest = { delta, line: target }
            }
          }
        }
        return nearest
      }

      const snapMovingObject = (target?: FabricObject) => {
        if (!target || isHelper(target) || !viewRef.current.snapping) {
          clearGuides()
          return
        }

        const bounds = target.getBoundingRect()
        const horizontalTargets = [0, viewRef.current.width / 2, viewRef.current.width]
        const verticalTargets = [0, viewRef.current.height / 2, viewRef.current.height]
        for (const other of canvas.getObjects()) {
          if (other === target || isHelper(other) || !other.visible) continue
          const otherBounds = other.getBoundingRect()
          horizontalTargets.push(
            otherBounds.left,
            otherBounds.left + otherBounds.width / 2,
            otherBounds.left + otherBounds.width,
          )
          verticalTargets.push(
            otherBounds.top,
            otherBounds.top + otherBounds.height / 2,
            otherBounds.top + otherBounds.height,
          )
        }

        const threshold = 9 / (viewRef.current.fitScale * viewRef.current.zoom)
        const horizontal = getSnapMatch(
          [bounds.left, bounds.left + bounds.width / 2, bounds.left + bounds.width],
          horizontalTargets,
          threshold,
        )
        const vertical = getSnapMatch(
          [bounds.top, bounds.top + bounds.height / 2, bounds.top + bounds.height],
          verticalTargets,
          threshold,
        )

        if (horizontal) target.set('left', (target.left ?? 0) + horizontal.delta)
        if (vertical) target.set('top', (target.top ?? 0) + vertical.delta)
        target.setCoords()
        drawGuides(horizontal?.line, vertical?.line)
      }

      const createGrid = () =>
        createGridForCanvas(canvas, gridLinesRef, viewRef.current)

      const addManagedObject = (object: FabricObject, name: string) => {
        setMetadata(object, name)
        bindText(object)
        canvas.add(object)
        canvas.setActiveObject(object)
        canvas.requestRenderAll()
      }

      const applyLock = (object: FabricObject, locked: boolean) => {
        object.set({
          creativeLabLocked: locked,
          selectable: !locked,
          evented: !locked,
          lockMovementX: locked,
          lockMovementY: locked,
          lockRotation: locked,
          lockScalingX: locked,
          lockScalingY: locked,
        })
      }

      const getHistorySnapshot = () => getSnapshot()
      history.last = getHistorySnapshot()

      canvas.on('selection:created', emitState)
      canvas.on('selection:updated', emitState)
      canvas.on('selection:cleared', emitState)
      canvas.on('object:added', (event) => {
        if (!event.target || isHelper(event.target)) return
        bindText(event.target)
        commitHistory()
      })
      canvas.on('object:removed', (event) => {
        if (event.target && !isHelper(event.target)) commitHistory()
      })
      canvas.on('object:modified', (event) => {
        if (event.target && !isHelper(event.target)) {
          clearGuides()
          commitHistory()
        }
      })
      canvas.on('object:moving', (event) => snapMovingObject(event.target))
      canvas.on('text:changed', emitState)

      const restoreHistory = async (direction: 'undo' | 'redo') => {
        const source = direction === 'undo' ? history.past : history.future
        const destination = direction === 'undo' ? history.future : history.past
        const target = source.pop()
        if (!target) return

        if (textCommitTimer) clearTimeout(textCommitTimer)
        textCommitTimer = null
        clearGuides()
        destination.push(getSnapshot())
        history.restoring = true
        try {
          await canvas.loadFromJSON(target)
          const restored = JSON.parse(target) as {
            creativeLabWidth?: number
            creativeLabHeight?: number
            creativeLabBackground?: string
          }
          viewRef.current = {
            ...viewRef.current,
            width: restored.creativeLabWidth ?? viewRef.current.width,
            height: restored.creativeLabHeight ?? viewRef.current.height,
            background: restored.creativeLabBackground ?? viewRef.current.background,
          }
          canvas.setDimensions({
            width: viewRef.current.width,
            height: viewRef.current.height,
          })
          canvas.backgroundColor = viewRef.current.background
          setView({ ...viewRef.current })
          for (const object of canvas.getObjects()) {
            if (!isHelper(object)) {
              getLayerId(object)
              if (object.get('creativeLabLocked') === true) applyLock(object, true)
              bindText(object)
            }
          }
          createGrid()
          history.last = getSnapshot()
          syncDesignDocument(canvas)
          canvas.discardActiveObject()
          canvas.requestRenderAll()
          emitState()
        } finally {
          history.restoring = false
        }
      }
      restoreHistoryRef.current = restoreHistory

      const fitScaleToStage = () => {
        const stage = stageRef.current
        if (!stage) return
        const bounds = stage.getBoundingClientRect()
        const fitScale = Math.max(
          0.03,
          Math.min(
            1,
            (bounds.width - 64) / viewRef.current.width,
            (bounds.height - 64) / viewRef.current.height,
          ),
        )
        viewRef.current.fitScale = fitScale
        setView({ ...viewRef.current })
        emitState()
      }

      const stage = stageRef.current
      const observer = stage ? new ResizeObserver(fitScaleToStage) : null
      if (stage && observer) observer.observe(stage)
      fitScaleToStage()
      emitState()

      const onKeyDown = (event: KeyboardEvent) => {
        const target = event.target
        const activeObject = canvas.getActiveObject()
        const isEditingText =
          activeObject instanceof IText && activeObject.isEditing
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.matches('input, textarea, select') ||
            (target.closest('.canvas-container') && isEditingText))
        ) {
          return
        }
        const active = canvas.getActiveObject()
        const modifier = event.ctrlKey || event.metaKey
        if (modifier && event.key.toLowerCase() === 'z') {
          event.preventDefault()
          void restoreHistory(event.shiftKey ? 'redo' : 'undo')
        } else if (modifier && event.key.toLowerCase() === 'y') {
          event.preventDefault()
          void restoreHistory('redo')
        } else if (modifier && event.key.toLowerCase() === 'c' && active) {
          event.preventDefault()
          void copyActive()
        } else if (modifier && event.key.toLowerCase() === 'v') {
          event.preventDefault()
          void pasteClipboard()
        } else if ((event.key === 'Delete' || event.key === 'Backspace') && active) {
          event.preventDefault()
          removeSelected()
        }
      }

      const copyActive = async () => {
        const objects = canvas.getActiveObjects()
        if (objects.length !== 1) return
        clipboardRef.current = await objects[0].clone(CUSTOM_PROPERTIES)
        history.canPaste = true
        emitState()
      }

      const pasteClipboard = async () => {
        const source = clipboardRef.current
        if (!source) return
        const copy = await source.clone(CUSTOM_PROPERTIES)
        copy.set({
          left: (copy.left ?? 0) + 24,
          top: (copy.top ?? 0) + 24,
          selectable: true,
          evented: true,
          lockMovementX: false,
          lockMovementY: false,
          lockRotation: false,
          lockScalingX: false,
          lockScalingY: false,
        })
        setMetadata(copy, `${getLayerName(source)} copia`)
        history.suspended = true
        addManagedObject(copy, getLayerName(copy))
        history.suspended = false
        commitHistory()
      }

      const removeSelected = () => {
        const objects = canvas.getActiveObjects().filter((object) => !isHelper(object))
        if (objects.length === 0) return
        canvas.discardActiveObject()
        canvas.remove(...objects)
        canvas.requestRenderAll()
        emitState()
      }

      window.addEventListener('keydown', onKeyDown)
      history.suspended = true
      void documentAdapterRef.current
        .loadIntoCanvas(
          canvas,
          initialDocumentSnapshot,
          resourceBlobsRef.current,
          (_resourceId, url) => {
            objectUrls.add(url)
          },
          () => disposed,
        )
        .then(() => {
          if (disposed) return
          history.suspended = false
          for (const object of canvas.getObjects()) bindText(object)
          history.last = getSnapshot()
          syncDesignDocument(canvas, false)
          emitState()
        })
        .catch((loadError: unknown) => {
          history.suspended = false
          if (!disposed) {
            onEngineError(
              loadError instanceof Error
                ? loadError.message
                : 'No se pudo abrir el documento.',
            )
          }
        })
        .finally(() => {
          loadFinished = true
          if (cleanupRequested) releaseObjectUrls()
        })

      return () => {
        disposed = true
        cleanupRequested = true
        observer?.disconnect()
        window.removeEventListener('keydown', onKeyDown)
        if (textCommitTimer) clearTimeout(textCommitTimer)
        textCommitTimer = null
        canvas.off()
        void canvas.dispose()
        if (loadFinished) releaseObjectUrls()
      }
    }, [initialDocumentSnapshot, onEngineError, onStateChange, syncDesignDocument])

    useImperativeHandle(
      ref,
      () => {
        const getCanvas = () => canvasRef.current
        const emit = (canvas: Canvas) =>
          emitCurrentState(canvas, onStateChange, viewRef.current, historyRef.current)
        const commitCanvasChanges = (canvas: Canvas) => {
          const previous = historyRef.current.last
          updateHistoryFromCanvas(canvas, historyRef.current, viewRef.current)
          if (historyRef.current.last !== previous) syncDesignDocument(canvas)
        }
        const renderWithoutHelpers = <T,>(canvas: Canvas, render: () => T) => {
          const helpers = [...gridLinesRef.current, ...guideLinesRef.current]
          const previousVisibility = helpers.map((line) => line.visible)
          for (const line of helpers) line.set('visible', false)
          canvas.requestRenderAll()
          try {
            return render()
          } finally {
            helpers.forEach((line, index) => line.set('visible', previousVisibility[index]))
            canvas.requestRenderAll()
          }
        }
        const exportRaster = (format: 'png' | 'jpeg', quality = 1) => {
          const canvas = getCanvas()
          if (!canvas) return
          return renderWithoutHelpers(canvas, () =>
            canvas.toDataURL({ format, multiplier: 1, quality }),
          )
        }

        const updateProperty = (property: EditableProperty, value: string | number | boolean) => {
          const canvas = getCanvas()
          const active = canvas?.getActiveObject()
          if (!canvas || !active) return

          const targets =
            property === 'left' ||
            property === 'top' ||
            property === 'width' ||
            property === 'height' ||
            property === 'angle'
              ? [active]
              : canvas.getActiveObjects()
          for (const object of targets) {
            if (object.get('creativeLabLocked') === true) continue
            switch (property) {
              case 'left':
              case 'top':
              case 'angle':
              case 'opacity':
              case 'fill':
              case 'stroke':
              case 'strokeWidth':
              case 'fontFamily':
              case 'fontSize':
              case 'fontWeight':
              case 'fontStyle':
              case 'textAlign':
              case 'lineHeight':
              case 'underline':
                object.set(property, value)
                break
              case 'width':
                object.set('scaleX', Number(value) / Math.max(1, object.width))
                break
              case 'height':
                object.set('scaleY', Number(value) / Math.max(1, object.height))
                break
              case 'letterSpacing':
                if (object instanceof IText) {
                  object.set(
                    'charSpacing',
                    (Number(value) * 1000) / Math.max(1, object.fontSize),
                  )
                }
                break
            }
            if (object instanceof IText) object.initDimensions()
            object.setCoords()
          }
          canvas.requestRenderAll()
          commitCanvasChanges(canvas)
          emit(canvas)
        }

        return {
          addText() {
            const canvas = getCanvas()
            if (!canvas) return
            const text = new IText('Escribe tu mensaje', {
              originX: 'left',
              originY: 'top',
              left: 120,
              top: 590,
              width: 640,
              fontFamily: 'Arial',
              fontSize: 52,
              fill: '#20211f',
            })
            setMetadata(text, 'Texto nuevo')
            canvas.add(text)
            canvas.setActiveObject(text)
            text.enterEditing()
            text.selectAll()
            canvas.requestRenderAll()
            emit(canvas)
          },
          addRectangle() {
            const canvas = getCanvas()
            if (!canvas) return
            const rectangle = new Rect({
              originX: 'left',
              originY: 'top',
              left: 180,
              top: 570,
              width: 260,
              height: 180,
              rx: 12,
              ry: 12,
              fill: '#8ec7d2',
            })
            setMetadata(rectangle, 'Rectángulo')
            canvas.add(rectangle)
            canvas.setActiveObject(rectangle)
            canvas.requestRenderAll()
          },
          async addImage(file) {
            const canvas = getCanvas()
            if (!canvas) return
            const objectUrl = URL.createObjectURL(file)
            const resourceId = createLayerId()
            const name = file.name.replace(/\.[^.]+$/, '') || 'Imagen'
            try {
              const image = await FabricImage.fromURL(objectUrl)
              const imageWidth = image.width ?? 1
              const imageHeight = image.height ?? 1
              const fitScale = Math.min(1, 650 / imageWidth, 760 / imageHeight)
              image.set({
                originX: 'left',
                originY: 'top',
                left: (viewRef.current.width - imageWidth * fitScale) / 2,
                top: (viewRef.current.height - imageHeight * fitScale) / 2,
                scaleX: fitScale,
                scaleY: fitScale,
              })
              objectUrlsRef.current.add(objectUrl)
              resourceBlobsRef.current.set(resourceId, file)
              onResourceImport({
                id: resourceId,
                name,
                mediaType: file.type || 'image/*',
                blob: file,
              })
              setMetadata(image, name)
              image.set({
                creativeLabResourceId: resourceId,
                creativeLabMediaType: file.type || 'image/*',
              })
              canvas.add(image)
              canvas.setActiveObject(image)
              canvas.requestRenderAll()
            } catch (error) {
              resourceBlobsRef.current.delete(resourceId)
              objectUrlsRef.current.delete(objectUrl)
              URL.revokeObjectURL(objectUrl)
              throw error
            }
          },
          deleteSelected() {
            const canvas = getCanvas()
            if (!canvas) return
            const objects = canvas.getActiveObjects().filter((object) => !isHelper(object))
            if (!objects.length) return
            canvas.discardActiveObject()
            canvas.remove(...objects)
            canvas.requestRenderAll()
            emitCurrentState(canvas, onStateChange, viewRef.current, historyRef.current)
          },
          async copySelected() {
            const canvas = getCanvas()
            const objects = canvas?.getActiveObjects() ?? []
            if (objects.length !== 1) return
            clipboardRef.current = await objects[0].clone(CUSTOM_PROPERTIES)
            historyRef.current.canPaste = true
            if (canvas) emit(canvas)
          },
          async paste() {
            const canvas = getCanvas()
            const source = clipboardRef.current
            if (!canvas || !source) return
            const copy = await source.clone(CUSTOM_PROPERTIES)
            copy.set({
              left: (copy.left ?? 0) + 24,
              top: (copy.top ?? 0) + 24,
              selectable: true,
              evented: true,
              lockMovementX: false,
              lockMovementY: false,
              lockRotation: false,
              lockScalingX: false,
              lockScalingY: false,
            })
            setMetadata(copy, `${getLayerName(source)} copia`)
            canvas.add(copy)
            canvas.setActiveObject(copy)
            canvas.requestRenderAll()
          },
          async duplicateSelected() {
            const canvas = getCanvas()
            const objects = canvas?.getActiveObjects() ?? []
            if (!canvas || objects.length !== 1) return
            const copy = await objects[0].clone(CUSTOM_PROPERTIES)
            copy.set({
              left: (copy.left ?? 0) + 24,
              top: (copy.top ?? 0) + 24,
              selectable: true,
              evented: true,
              lockMovementX: false,
              lockMovementY: false,
              lockRotation: false,
              lockScalingX: false,
              lockScalingY: false,
            })
            setMetadata(copy, `${getLayerName(objects[0])} copia`)
            canvas.add(copy)
            canvas.setActiveObject(copy)
            canvas.requestRenderAll()
          },
          groupSelected() {
            const canvas = getCanvas()
            const active = canvas?.getActiveObject()
            if (!canvas || !(active instanceof ActiveSelection)) return
            const objects = [...active.getObjects()]
            historyRef.current.suspended = true
            try {
              canvas.discardActiveObject()
              const group = new Group(objects)
              canvas.remove(...objects)
              setMetadata(group, 'Grupo')
              canvas.add(group)
              canvas.setActiveObject(group)
              canvas.requestRenderAll()
            } finally {
              historyRef.current.suspended = false
            }
            commitCanvasChanges(canvas)
            emit(canvas)
          },
          ungroupSelected() {
            const canvas = getCanvas()
            const active = canvas?.getActiveObject()
            if (!canvas || !(active instanceof Group) || active instanceof ActiveSelection) return
            const objects = [...active.getObjects()]
            historyRef.current.suspended = true
            try {
              active.remove(...objects)
              canvas.remove(active)
              for (const object of objects) {
                object.set({ selectable: true, evented: true })
                canvas.add(object)
              }
              canvas.setActiveObject(new ActiveSelection(objects, { canvas }))
              canvas.requestRenderAll()
            } finally {
              historyRef.current.suspended = false
            }
            commitCanvasChanges(canvas)
            emit(canvas)
          },
          undo: async () => {
            await restoreHistoryRef.current?.('undo')
          },
          redo: async () => {
            await restoreHistoryRef.current?.('redo')
          },
          exportPng() {
            return exportRaster('png')
          },
          exportRaster,
          async exportSvg() {
            const canvas = getCanvas()
            if (!canvas) return
            let svg = renderWithoutHelpers(canvas, () => canvas.toSVG())
            for (const image of getNestedImages(canvas.getObjects())) {
              const resourceId = image.get('creativeLabResourceId')
              const source = image.getSrc()
              if (typeof resourceId !== 'string' || typeof source !== 'string') continue
              const resource = resourceBlobsRef.current.get(resourceId)
              if (!resource) throw new Error('No se pudo recuperar una imagen del documento.')
              svg = svg.split(source).join(await blobToDataUrl(resource))
            }
            return svg
          },
          async exportPdf() {
            const canvas = getCanvas()
            const image = exportRaster('jpeg', 1)
            if (!canvas || !image) return
            return createDesignPdf(image, viewRef.current.width, viewRef.current.height)
          },
          exportThumbnail() {
            const canvas = getCanvas()
            if (!canvas) return
            const multiplier = Math.min(
              1,
              256 / viewRef.current.width,
              256 / viewRef.current.height,
            )
            return renderWithoutHelpers(canvas, () =>
              canvas.toDataURL({ format: 'png', multiplier }),
            )
          },
          getDesignDocument() {
            const document = designDocumentRef.current
            if (!document) throw new Error('El documento de diseño no está disponible.')
            return structuredClone(document)
          },
          setSelectedProperty: updateProperty,
          setSelectedCrop(axis, value) {
            const canvas = getCanvas()
            if (!canvas) return
            for (const object of canvas.getActiveObjects()) {
              if (!(object instanceof FabricImage)) continue
              const original = object.getOriginalSize()
              if (axis === 'x') {
                const cropX = Math.max(0, Math.min(original.width - 1, value))
                const width = Math.max(1, original.width - cropX)
                const visibleWidth = object.getScaledWidth()
                object.set({
                  cropX,
                  width,
                  scaleX: visibleWidth / width,
                })
              } else {
                const cropY = Math.max(0, Math.min(original.height - 1, value))
                const height = Math.max(1, original.height - cropY)
                const visibleHeight = object.getScaledHeight()
                object.set({
                  cropY,
                  height,
                  scaleY: visibleHeight / height,
                })
              }
              object.setCoords()
            }
            canvas.requestRenderAll()
            commitCanvasChanges(canvas)
            emitCurrentState(canvas, onStateChange, viewRef.current, historyRef.current)
          },
          setDocumentBackground(color) {
            const canvas = getCanvas()
            if (!canvas) return
            canvas.backgroundColor = color
            viewRef.current.background = color
            setView({ ...viewRef.current })
            canvas.requestRenderAll()
            commitCanvasChanges(canvas)
            emitCurrentState(canvas, onStateChange, viewRef.current, historyRef.current)
          },
          resizeDocument(width, height) {
            const canvas = getCanvas()
            if (!canvas || width < 100 || height < 100 || width > 5000 || height > 5000) return
            const oldWidth = viewRef.current.width
            const oldHeight = viewRef.current.height
            const scale = Math.min(width / oldWidth, height / oldHeight)
            const centerX = oldWidth / 2
            const centerY = oldHeight / 2
            for (const object of canvas.getObjects()) {
              if (isHelper(object)) continue
              const center = object.getCenterPoint()
              object.set({
                scaleX: (object.scaleX ?? 1) * scale,
                scaleY: (object.scaleY ?? 1) * scale,
              })
              object.setPositionByOrigin(
                new Point(
                  (center.x - centerX) * scale + width / 2,
                  (center.y - centerY) * scale + height / 2,
                ),
                'center',
                'center',
              )
              object.setCoords()
            }
            viewRef.current.width = width
            viewRef.current.height = height
            canvas.setDimensions({ width, height })
            createGridForCanvas(canvas, gridLinesRef, viewRef.current)
            canvas.backgroundColor = viewRef.current.background
            canvas.requestRenderAll()
            setView({ ...viewRef.current })
            commitCanvasChanges(canvas)
            emitCurrentState(canvas, onStateChange, viewRef.current, historyRef.current)
          },
          setZoom(zoom) {
            viewRef.current.zoom = Math.max(0.25, Math.min(2, zoom))
            setView({ ...viewRef.current })
            emitCurrentStateFromRef(canvasRef.current, onStateChange, viewRef.current, historyRef.current)
          },
          fitToScreen() {
            viewRef.current.zoom = 1
            setView({ ...viewRef.current })
            emitCurrentStateFromRef(canvasRef.current, onStateChange, viewRef.current, historyRef.current)
          },
          toggleGrid() {
            const canvas = getCanvas()
            if (!canvas) return
            viewRef.current.grid = !viewRef.current.grid
            createGridForCanvas(canvas, gridLinesRef, viewRef.current)
            setView({ ...viewRef.current })
            canvas.requestRenderAll()
            emitCurrentState(canvas, onStateChange, viewRef.current, historyRef.current)
          },
          toggleSnapping() {
            viewRef.current.snapping = !viewRef.current.snapping
            setView({ ...viewRef.current })
            emitCurrentStateFromRef(canvasRef.current, onStateChange, viewRef.current, historyRef.current)
          },
          selectLayer(id) {
            const canvas = getCanvas()
            const object = canvas?.getObjects().find((entry) => getLayerId(entry) === id)
            if (!canvas || !object || isHelper(object)) return
            canvas.setActiveObject(object)
            canvas.requestRenderAll()
            emitCurrentState(canvas, onStateChange, viewRef.current, historyRef.current)
          },
          renameLayer(id, name) {
            const canvas = getCanvas()
            const object = canvas?.getObjects().find((entry) => getLayerId(entry) === id)
            if (!canvas || !object || !name.trim()) return
            object.set('creativeLabName', name.trim())
            commitCanvasChanges(canvas)
            emitCurrentState(canvas, onStateChange, viewRef.current, historyRef.current)
          },
          reorderLayer(id, direction) {
            const canvas = getCanvas()
            if (!canvas) return
            const objects = canvas.getObjects().filter((object) => !isHelper(object))
            const object = objects.find((entry) => getLayerId(entry) === id)
            if (!object) return
            const currentIndex = canvas.getObjects().indexOf(object)
            const nextIndex = Math.max(
              0,
              Math.min(canvas.getObjects().length - 1, currentIndex + direction),
            )
            canvas.moveObjectTo(object, nextIndex)
            canvas.requestRenderAll()
            commitCanvasChanges(canvas)
            emitCurrentState(canvas, onStateChange, viewRef.current, historyRef.current)
          },
          toggleLayerVisibility(id) {
            const canvas = getCanvas()
            const object = canvas?.getObjects().find((entry) => getLayerId(entry) === id)
            if (!canvas || !object || isHelper(object)) return
            object.set('visible', !object.visible)
            if (!object.visible && canvas.getActiveObjects().includes(object)) {
              canvas.discardActiveObject()
            }
            canvas.requestRenderAll()
            commitCanvasChanges(canvas)
            emitCurrentState(canvas, onStateChange, viewRef.current, historyRef.current)
          },
          toggleLayerLock(id) {
            const canvas = getCanvas()
            const object = canvas?.getObjects().find((entry) => getLayerId(entry) === id)
            if (!canvas || !object || isHelper(object)) return
            const locked = object.get('creativeLabLocked') !== true
            object.set('creativeLabLocked', locked)
            object.set({
              selectable: !locked,
              evented: !locked,
              lockMovementX: locked,
              lockMovementY: locked,
              lockRotation: locked,
              lockScalingX: locked,
              lockScalingY: locked,
            })
            if (locked && canvas.getActiveObjects().includes(object)) {
              canvas.discardActiveObject()
            }
            canvas.requestRenderAll()
            commitCanvasChanges(canvas)
            emitCurrentState(canvas, onStateChange, viewRef.current, historyRef.current)
          },
          deleteLayer(id) {
            const canvas = getCanvas()
            const object = canvas?.getObjects().find((entry) => getLayerId(entry) === id)
            if (!canvas || !object || isHelper(object)) return
            if (canvas.getActiveObjects().includes(object)) canvas.discardActiveObject()
            canvas.remove(object)
            canvas.requestRenderAll()
            emitCurrentState(canvas, onStateChange, viewRef.current, historyRef.current)
          },
          alignSelection(alignment) {
            const canvas = getCanvas()
            const object = canvas?.getActiveObject()
            if (!canvas || !object) return
            const bounds = object.getBoundingRect()
            let dx = 0
            let dy = 0
            if (alignment === 'izquierda') dx = -bounds.left
            if (alignment === 'centro-x') {
              dx = viewRef.current.width / 2 - (bounds.left + bounds.width / 2)
            }
            if (alignment === 'derecha') {
              dx = viewRef.current.width - (bounds.left + bounds.width)
            }
            if (alignment === 'arriba') dy = -bounds.top
            if (alignment === 'centro-y') {
              dy = viewRef.current.height / 2 - (bounds.top + bounds.height / 2)
            }
            if (alignment === 'abajo') {
              dy = viewRef.current.height - (bounds.top + bounds.height)
            }
            object.set({
              left: (object.left ?? 0) + dx,
              top: (object.top ?? 0) + dy,
            })
            object.setCoords()
            canvas.requestRenderAll()
            commitCanvasChanges(canvas)
            emitCurrentState(canvas, onStateChange, viewRef.current, historyRef.current)
          },
          toggleSelectedLock() {
            const canvas = getCanvas()
            const object = canvas?.getActiveObject()
            if (!canvas || !object || object instanceof ActiveSelection) return
            const locked = object.get('creativeLabLocked') !== true
            object.set('creativeLabLocked', locked)
            object.set({
              selectable: !locked,
              evented: !locked,
              lockMovementX: locked,
              lockMovementY: locked,
              lockRotation: locked,
              lockScalingX: locked,
              lockScalingY: locked,
            })
            if (locked) canvas.discardActiveObject()
            canvas.requestRenderAll()
            commitCanvasChanges(canvas)
            emitCurrentState(canvas, onStateChange, viewRef.current, historyRef.current)
          },
        }
      },
      [onResourceImport, onStateChange, syncDesignDocument],
    )

    const displayScale = view.fitScale * view.zoom
    const zoomed = view.zoom > 1

    return (
      <div
        className={`canvas-stage${zoomed ? ' canvas-stage-zoomed' : ''}`}
        ref={stageRef}
        data-grid={view.grid}
      >
        <div
          className="canvas-frame"
          style={{
            width: view.width * displayScale,
            height: view.height * displayScale,
          }}
        >
          <div
            className="canvas-scaled"
            style={{
              width: view.width,
              height: view.height,
              transform: `scale(${displayScale})`,
            }}
          >
            <canvas ref={canvasElementRef} aria-label="Lienzo de diseño" />
          </div>
        </div>
      </div>
    )
  },
)

function createGridForCanvas(
  canvas: Canvas,
  gridLinesRef: React.MutableRefObject<Line[]>,
  view: ViewState,
) {
  for (const line of gridLinesRef.current) canvas.remove(line)
  gridLinesRef.current = []
  if (!view.grid) return

  const lines: Line[] = []
  for (let x = 50; x < view.width; x += 50) {
    const line = new Line([x, 0, x, view.height], {
      stroke: '#cbd3bd',
      strokeWidth: 0.7,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    })
    setMetadata(line, 'Cuadrícula', { helper: true })
    lines.push(line)
  }
  for (let y = 50; y < view.height; y += 50) {
    const line = new Line([0, y, view.width, y], {
      stroke: '#cbd3bd',
      strokeWidth: 0.7,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    })
    setMetadata(line, 'Cuadrícula', { helper: true })
    lines.push(line)
  }
  gridLinesRef.current = lines
  canvas.add(...lines)
  for (const line of lines) canvas.sendObjectToBack(line)
}

function serializeCanvas(canvas: Canvas, view: ViewState) {
  const snapshot = canvas.toObject(CUSTOM_PROPERTIES)
  snapshot.objects = snapshot.objects.filter(
    (object: Record<string, unknown>) => object.creativeLabHelper !== true,
  )
  snapshot.creativeLabWidth = view.width
  snapshot.creativeLabHeight = view.height
  snapshot.creativeLabBackground = view.background
  return JSON.stringify(snapshot)
}

function updateHistoryFromCanvas(
  canvas: Canvas,
  state: { past: string[]; future: string[]; last: string; restoring: boolean },
  view: ViewState,
) {
  const serialized = serializeCanvas(canvas, view)
  if (state.restoring || serialized === state.last) return
  state.past.push(state.last)
  if (state.past.length > HISTORY_LIMIT) state.past.shift()
  state.future = []
  state.last = serialized
}

function emitCurrentState(
  canvas: Canvas,
  onStateChange: (state: EditorState) => void,
  view: ViewState,
  history: { past: string[]; future: string[]; canPaste: boolean },
) {
  const activeObjects = canvas.getActiveObjects()
  const active = canvas.getActiveObject()
  const object = active && !isHelper(active) ? active : null
  const target = object instanceof ActiveSelection
    ? activeObjects.find((entry) => entry instanceof IText) ?? object
    : object
  let selection: SelectedElement | null = null

  if (target) {
    const sourceSize =
      target instanceof FabricImage
        ? target.getOriginalSize()
        : { width: target.width, height: target.height }
    const bounds = object?.getBoundingRect()
    const fontSize = target instanceof IText ? target.fontSize : 32
    selection = {
      id: getLayerId(target),
      name: getLayerName(target),
      type: getElementType(target),
      count: activeObjects.length,
      x: Math.round(bounds?.left ?? target.left ?? 0),
      y: Math.round(bounds?.top ?? target.top ?? 0),
      width: Math.round(bounds?.width ?? target.getScaledWidth()),
      height: Math.round(bounds?.height ?? target.getScaledHeight()),
      angle: Math.round(target.angle ?? 0),
      opacity: target.opacity ?? 1,
      fill: typeof target.fill === 'string' ? target.fill : '#20211f',
      stroke: typeof target.stroke === 'string' ? target.stroke : '',
      strokeWidth: target.strokeWidth ?? 0,
      fontFamily: target instanceof IText ? target.fontFamily : 'Arial',
      fontSize,
      fontWeight: target instanceof IText ? Number(target.fontWeight) || 400 : 400,
      fontStyle: target instanceof IText ? target.fontStyle : 'normal',
      textAlign: target instanceof IText ? target.textAlign : 'left',
      lineHeight: target instanceof IText ? target.lineHeight : 1.16,
      letterSpacing:
        target instanceof IText ? Math.round((target.charSpacing * fontSize) / 1000) : 0,
      underline: target instanceof IText && target.underline,
      cropX: target instanceof FabricImage ? target.cropX : 0,
      cropY: target instanceof FabricImage ? target.cropY : 0,
      sourceWidth: sourceSize.width,
      sourceHeight: sourceSize.height,
    }
  }

  onStateChange({
    layers: canvas
      .getObjects()
      .filter((entry) => !isHelper(entry))
      .reverse()
      .map((entry) => ({
        id: getLayerId(entry),
        name: getLayerName(entry),
        type: getElementType(entry),
        visible: entry.visible,
        locked: entry.get('creativeLabLocked') === true,
        selected: activeObjects.includes(entry),
      })),
    selection,
    width: view.width,
    height: view.height,
    background: view.background,
    zoom: view.zoom,
    grid: view.grid,
    snapping: view.snapping,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    canPaste: history.canPaste,
  })
}

function emitCurrentStateFromRef(
  canvas: Canvas | null,
  onStateChange: (state: EditorState) => void,
  view: ViewState,
  history: { past: string[]; future: string[]; canPaste: boolean },
) {
  if (canvas) emitCurrentState(canvas, onStateChange, view, history)
}

export default EditorCanvas
