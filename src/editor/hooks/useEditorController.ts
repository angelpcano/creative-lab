import { useCallback, useState } from 'react'
import type { EditorState } from '../engine/EditorEngine'
import type { DocumentPreset } from '../documentPresets'

const INITIAL_EDITOR_STATE: EditorState = {
  layers: [],
  selection: null,
  width: 900,
  height: 1125,
  background: '#fffefa',
  zoom: 1,
  grid: false,
  snapping: true,
  canUndo: false,
  canRedo: false,
  canPaste: false,
}

export function useEditorController(presets: readonly DocumentPreset[]) {
  const [editorState, setEditorState] = useState(INITIAL_EDITOR_STATE)
  const [preset, setPreset] = useState('custom')
  const [customWidth, setCustomWidth] = useState(INITIAL_EDITOR_STATE.width)
  const [customHeight, setCustomHeight] = useState(INITIAL_EDITOR_STATE.height)

  const onStateChange = useCallback((state: EditorState) => {
    setEditorState(state)
    setCustomWidth(state.width)
    setCustomHeight(state.height)
    const activePreset = presets.find(
      (item) => item.width === state.width && item.height === state.height,
    )
    setPreset(activePreset ? `${activePreset.width}x${activePreset.height}` : 'custom')
  }, [presets])

  return {
    editorState,
    onStateChange,
    preset,
    setPreset,
    customWidth,
    setCustomWidth,
    customHeight,
    setCustomHeight,
  }
}
