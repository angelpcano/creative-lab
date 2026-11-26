import {
  Canvas,
  Circle,
  Ellipse,
  FabricImage,
  Group,
  IText,
  Path,
  Rect,
  type FabricObject,
} from 'fabric'
import type {
  DesignDocument,
  DesignElement,
  DesignElementBase,
  DesignResource,
  ElementStyle,
} from '../../domain/designDocument'

export type FabricDocumentView = {
  width: number
  height: number
  background: string
}

function stringProperty(object: FabricObject, property: string, fallback: string) {
  const value = object.get(property)
  return typeof value === 'string' ? value : fallback
}

function getElementId(object: FabricObject, order: number) {
  return stringProperty(object, 'creativeLabId', `element-${order}`)
}

function getElementName(object: FabricObject) {
  return stringProperty(object, 'creativeLabName', 'Elemento')
}

function getBase(
  object: FabricObject,
  order: number,
  id = getElementId(object, order),
): DesignElementBase {
  return {
    id,
    name: getElementName(object),
    order,
    visible: object.visible,
    locked: object.get('creativeLabLocked') === true,
    opacity: object.opacity ?? 1,
    transform: {
      x: object.left ?? 0,
      y: object.top ?? 0,
      scaleX: object.scaleX ?? 1,
      scaleY: object.scaleY ?? 1,
      rotation: object.angle ?? 0,
      skewX: object.skewX ?? 0,
      skewY: object.skewY ?? 0,
      flipX: object.flipX ?? false,
      flipY: object.flipY ?? false,
    },
  }
}

function getStyle(object: FabricObject): ElementStyle {
  return {
    fill: typeof object.fill === 'string' ? object.fill : null,
    stroke: typeof object.stroke === 'string' ? object.stroke : null,
    strokeWidth: object.strokeWidth ?? 0,
  }
}

function getDocumentTextAlign(value: IText['textAlign']): 'left' | 'center' | 'right' | 'justify' {
  if (value === 'center' || value === 'justify-center') return 'center'
  if (value === 'right' || value === 'justify-right') return 'right'
  if (value === 'justify' || value === 'justify-left') return 'justify'
  return 'left'
}

function mapElement(
  object: FabricObject,
  order: number,
  resources: Map<string, DesignResource>,
): DesignElement {
  const base = getBase(object, order)
  if (object instanceof IText) {
    return {
      ...base,
      type: 'text',
      text: object.text,
      width: object.width ?? 0,
      style: {
        ...getStyle(object),
        fontFamily: object.fontFamily,
        fontSize: object.fontSize,
        fontWeight: object.fontWeight,
        fontStyle: object.fontStyle === 'italic' ? 'italic' : 'normal',
        textAlign: getDocumentTextAlign(object.textAlign),
        lineHeight: object.lineHeight,
        letterSpacing: object.charSpacing,
        underline: object.underline,
      },
    }
  }

  if (object instanceof FabricImage) {
    const resourceId = stringProperty(object, 'creativeLabResourceId', base.id)
    if (!resources.has(resourceId)) {
      resources.set(resourceId, {
        id: resourceId,
        name: getElementName(object),
        mediaType: stringProperty(object, 'creativeLabMediaType', 'image/*'),
        storage: 'session-only',
      })
    }
    return {
      ...base,
      type: 'image',
      resourceId,
      width: object.width ?? 0,
      height: object.height ?? 0,
      crop: { x: object.cropX, y: object.cropY },
    }
  }

  if (object instanceof Group) {
    return {
      ...base,
      type: 'group',
      children: object
        .getObjects()
        .map((child, childOrder) => mapElement(child, childOrder, resources)),
    }
  }

  return {
    ...base,
    type: 'shape',
    geometry: object.type,
    width: object.width ?? 0,
    height: object.height ?? 0,
    style: getStyle(object),
  }
}

export class FabricDocumentAdapter {
  toDesignDocument(
    canvas: Canvas,
    current: DesignDocument,
    view: FabricDocumentView,
    markModified = true,
  ): DesignDocument {
    const resources = new Map<string, DesignResource>()
    const objects = canvas.getObjects().filter(
      (object) => object.get('creativeLabHelper') !== true,
    )
    const elements = objects.map((object, order) => mapElement(object, order, resources))

    return {
      ...current,
      dimensions: { width: view.width, height: view.height },
      background: { color: view.background },
      elements,
      layers: elements.map((element) => ({
        id: element.id,
        name: element.name,
        elementIds: [element.id],
        order: element.order,
        visible: element.visible,
        locked: element.locked,
      })),
      resources: [...resources.values()],
      metadata: {
        ...current.metadata,
        modifiedAt: markModified ? new Date().toISOString() : current.metadata.modifiedAt,
      },
    }
  }

  async loadIntoCanvas(
    canvas: Canvas,
    document: DesignDocument,
    resources: ReadonlyMap<string, Blob>,
    registerObjectUrl: (resourceId: string, url: string) => void,
    isCancelled: () => boolean,
  ) {
    const mediaTypes = new Map(
      document.resources.map((resource) => [resource.id, resource.mediaType]),
    )
    const objects = await Promise.all(
      [...document.elements]
        .sort((left, right) => left.order - right.order)
        .map((element) =>
          this.createFabricElement(element, resources, registerObjectUrl, mediaTypes),
        ),
    )
    if (isCancelled()) return
    canvas.clear()
    canvas.setDimensions(document.dimensions)
    canvas.backgroundColor = document.background.color
    canvas.add(...objects)
    canvas.requestRenderAll()
  }

  private async createFabricElement(
    element: DesignElement,
    resources: ReadonlyMap<string, Blob>,
    registerObjectUrl: (resourceId: string, url: string) => void,
    mediaTypes: ReadonlyMap<string, string>,
  ): Promise<FabricObject> {
    const locked = element.locked
    const common = {
      originX: 'left' as const,
      originY: 'top' as const,
      left: element.transform.x,
      top: element.transform.y,
      scaleX: element.transform.scaleX,
      scaleY: element.transform.scaleY,
      angle: element.transform.rotation,
      skewX: element.transform.skewX,
      skewY: element.transform.skewY,
      flipX: element.transform.flipX,
      flipY: element.transform.flipY,
      opacity: element.opacity,
      visible: element.visible,
      selectable: !locked,
      evented: !locked,
      lockMovementX: locked,
      lockMovementY: locked,
      lockRotation: locked,
      lockScalingX: locked,
      lockScalingY: locked,
    }

    let object: FabricObject
    switch (element.type) {
      case 'text':
        object = new IText(element.text, {
          ...common,
          width: element.width,
          fill: element.style.fill,
          stroke: element.style.stroke,
          strokeWidth: element.style.strokeWidth,
          fontFamily: element.style.fontFamily,
          fontSize: element.style.fontSize,
          fontWeight: element.style.fontWeight,
          fontStyle: element.style.fontStyle,
          textAlign: element.style.textAlign,
          lineHeight: element.style.lineHeight,
          charSpacing: element.style.letterSpacing,
          underline: element.style.underline,
        })
        break
      case 'image': {
        const resource = resources.get(element.resourceId)
        if (!resource) throw new Error(`No se encontró la imagen "${element.name}".`)
        const url = URL.createObjectURL(resource)
        registerObjectUrl(element.resourceId, url)
        const image = await FabricImage.fromURL(url)
        image.set({
          ...common,
          width: element.width,
          height: element.height,
          cropX: element.crop.x,
          cropY: element.crop.y,
        })
        image.set('creativeLabResourceId', element.resourceId)
        image.set('creativeLabMediaType', mediaTypes.get(element.resourceId) ?? resource.type)
        object = image
        break
      }
      case 'group': {
        const children = await Promise.all(
          [...element.children]
            .sort((left, right) => left.order - right.order)
            .map((child) =>
              this.createFabricElement(child, resources, registerObjectUrl, mediaTypes),
            ),
        )
        object = new Group(children, common)
        break
      }
      case 'vector':
        object = new Path(element.pathData, {
          ...common,
          width: element.width,
          height: element.height,
          fill: element.style.fill,
          stroke: element.style.stroke,
          strokeWidth: element.style.strokeWidth,
        })
        break
      case 'shape':
        if (element.geometry.toLowerCase() === 'circle') {
          object = new Circle({
            ...common,
            radius: Math.min(element.width, element.height) / 2,
            fill: element.style.fill,
            stroke: element.style.stroke,
            strokeWidth: element.style.strokeWidth,
          })
        } else if (element.geometry.toLowerCase() === 'ellipse') {
          object = new Ellipse({
            ...common,
            rx: element.width / 2,
            ry: element.height / 2,
            fill: element.style.fill,
            stroke: element.style.stroke,
            strokeWidth: element.style.strokeWidth,
          })
        } else {
          object = new Rect({
            ...common,
            width: element.width,
            height: element.height,
            fill: element.style.fill,
            stroke: element.style.stroke,
            strokeWidth: element.style.strokeWidth,
          })
        }
        break
      case 'mask':
      case 'adjustment':
      case 'effect':
        throw new Error(`El elemento "${element.name}" aún no es compatible con el editor.`)
    }
    object.set({
      creativeLabId: element.id,
      creativeLabName: element.name,
      creativeLabLocked: element.locked,
      creativeLabHelper: false,
    })
    return object
  }
}
