import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import * as XLSX from 'xlsx'
import { useAuth } from '../auth/authContext.js'
import SignIn from './SignIn.jsx'
import afrimaChannelListCsvUrl from '../assets/AFRIMA AWARD 2026 - Sheet1 (1).csv?url'

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      const next = line[i + 1]
      if (inQuotes && next === '"') {
        cur += '"'
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

function parseCsv(text) {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
  return lines.map((l) => parseCsvLine(l))
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

function toSafeFilename(value) {
  const s = String(value || '').trim()
  if (!s) return ''
  return s
    .replace(/[^a-zA-Z0-9\-_.()\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function useLoadedImage(src) {
  const [image, setImage] = useState(null)
  useEffect(() => {
    if (!src) return
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setImage(img)
    img.onerror = () => setImage(null)
    img.src = src
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [src])
  return image
}

const API = {
  listAssets: async () => {
    const res = await fetch('/api/assets')
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'Failed to load assets')
    }
    return res.json()
  },
  getPlot: async (plotId) => {
    const res = await fetch(`/api/plots/${encodeURIComponent(plotId)}`, {
      credentials: 'include',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'Failed to load plot')
    }
    return res.json()
  },
  listPlots: async () => {
    const res = await fetch('/api/plots', { credentials: 'include' })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'Failed to load saved plots')
    }
    return res.json()
  },
  savePlot: async (payload) => {
    const res = await fetch('/api/plots', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'Failed to save plot')
    }
    return res.json()
  },
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16)
}

function historyReducer(state, action) {
  const limit = 50
  switch (action.type) {
    case 'set': {
      const next = typeof action.updater === 'function' ? action.updater(state.present) : action.updater
      if (next === state.present) return state
      const past = state.past.length >= limit ? state.past.slice(1) : state.past
      return { past: [...past, state.present], present: next, future: [] }
    }
    case 'undo': {
      if (!state.past.length) return state
      const previous = state.past[state.past.length - 1]
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      }
    }
    case 'redo': {
      if (!state.future.length) return state
      const next = state.future[0]
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      }
    }
    case 'reset': {
      return { past: [], present: action.value, future: [] }
    }
    default:
      return state
  }
}

function useHistoryState(initialValue) {
  const [state, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initialValue,
    future: [],
  })

  const set = (updater) => dispatch({ type: 'set', updater })
  const undo = () => dispatch({ type: 'undo' })
  const redo = () => dispatch({ type: 'redo' })
  const reset = (value) => dispatch({ type: 'reset', value })

  return {
    value: state.present,
    set,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}

function useFontLoaded(fontFamily) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        if (document?.fonts?.load) {
          await document.fonts.load(`16px "${fontFamily}"`)
          await document.fonts.ready
        }
      } catch {
        // ignore
      } finally {
        if (alive) setReady(true)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [fontFamily])
  return ready
}

export default function StageBuilder() {
  const auth = useAuth()
  const stageRef = useRef(null)
  const transformerRef = useRef(null)
  const [stageWrapEl, setStageWrapEl] = useState(null)
  const stageWrapRef = useCallback((node) => {
    setStageWrapEl(node || null)
  }, [])
  const exportRef = useRef(null)
  const menuRef = useRef(null)

  const debugSizeEnabled =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debugSize') === '1'

  const [assets, setAssets] = useState([])

  const [channelDefaultsByInstrument, setChannelDefaultsByInstrument] = useState(() => new Map())
  const nodesHistory = useHistoryState([])
  const nodes = nodesHistory.value
  const setNodes = nodesHistory.set
  const [selectedId, setSelectedId] = useState(null)

  useFontLoaded('Material Symbols Outlined')

  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedSection, setSelectedSection] = useState('')

  const groupedAssets = useMemo(() => {
    const normalizeLabel = (value, fallback) => {
      const v = typeof value === 'string' ? value.trim() : ''
      return v ? v : fallback
    }

    const byCategory = new Map()
    for (const asset of assets) {
      const category = normalizeLabel(asset?.category, 'Uncategorized')
      const section = normalizeLabel(asset?.section, 'General')

      if (!byCategory.has(category)) byCategory.set(category, new Map())
      const bySection = byCategory.get(category)
      if (!bySection.has(section)) bySection.set(section, [])
      bySection.get(section).push(asset)
    }

    return [...byCategory.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, sectionsMap]) => ({
        category,
        sections: [...sectionsMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([section, items]) => ({
            section,
            items: items
              .slice()
              .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''))),
          })),
      }))
  }, [assets])

  const categories = useMemo(() => groupedAssets.map((g) => g.category), [groupedAssets])
  const activeCategory = selectedCategory || categories[0] || ''
  const activeGroup = useMemo(
    () => groupedAssets.find((g) => g.category === activeCategory) || null,
    [groupedAssets, activeCategory]
  )
  const sections = activeGroup?.sections || []
  const activeSection = selectedSection || sections[0]?.section || ''
  const activeSectionItems =
    sections.find((s) => s.section === activeSection)?.items || []

  const [plotName, setPlotName] = useState('')
  const [currentPlotId, setCurrentPlotId] = useState('')
  const [plotPickerId, setPlotPickerId] = useState('')
  const [savedPlots, setSavedPlots] = useState([])

  const [stageSize, setStageSize] = useState({ width: 900, height: 520 })
  const [stageWrapDebug, setStageWrapDebug] = useState({
    w: 0,
    h: 0,
    rectW: 0,
    rectH: 0,
    updates: 0,
  })
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const mobileDragRef = useRef(null)
  const [mobileDragPreview, setMobileDragPreview] = useState(null)

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) || null,
    [nodes, selectedId]
  )

  useEffect(() => {
    if (!selectedId) return
    if (!nodes.some((n) => n.id === selectedId)) setSelectedId(null)
  }, [nodes, selectedId])

  useEffect(() => {
    API.listAssets()
      .then(setAssets)
      .catch((e) => setError(String(e?.message || e)))
  }, [])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(afrimaChannelListCsvUrl)
        const text = await res.text()
        const rows = parseCsv(text)

        // Find the header row that includes these columns.
        const headerIdx = rows.findIndex((r) =>
          r.some((c) => normalizeKey(c) === 'INSTRUMENT') && r.some((c) => normalizeKey(c) === 'MIC / DI')
        )
        if (headerIdx < 0) return
        const header = rows[headerIdx]

        const idxTotal = header.findIndex((c) => normalizeKey(c) === 'TOTAL')
        const idxInstrument = header.findIndex((c) => normalizeKey(c) === 'INSTRUMENT')
        const idxMic = header.findIndex((c) => normalizeKey(c) === 'MIC / DI')
        const idxStand = header.findIndex((c) => normalizeKey(c) === 'STAND')
        const idxNotes = header.findIndex((c) => normalizeKey(c) === 'NOTES')
        const idxCables = header.findIndex((c) => normalizeKey(c) === 'CABLES')

        const map = new Map()
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const r = rows[i]
          const instrument = r[idxInstrument]
          const key = normalizeKey(instrument)
          if (!key) continue
          if (map.has(key)) continue

          const total = idxTotal >= 0 ? String(r[idxTotal] || '').trim() : ''
          const mic = idxMic >= 0 ? String(r[idxMic] || '').trim() : ''
          const stand = idxStand >= 0 ? String(r[idxStand] || '').trim() : ''
          const notes = idxNotes >= 0 ? String(r[idxNotes] || '').trim() : ''
          const cables = idxCables >= 0 ? String(r[idxCables] || '').trim() : ''

          // Only store rows that look like actual channel entries.
          if (!total && !mic && !stand && !notes && !cables) continue

          map.set(key, { mic, stand, notes, cables })
        }

        if (alive) setChannelDefaultsByInstrument(map)
      } catch {
        // ignore; this is best-effort defaults enrichment
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [])

  const refreshSavedPlots = useCallback(async () => {
    if (!auth.user) return
    const list = await API.listPlots()
    setSavedPlots(Array.isArray(list) ? list : [])
  }, [auth.user])

  useEffect(() => {
    if (!auth.user) return
    refreshSavedPlots().catch((e) => setError(String(e?.message || e)))
  }, [auth.user, refreshSavedPlots])

  const assetsById = useMemo(() => {
    const map = new Map()
    for (const a of assets) {
      if (a?._id) map.set(a._id, a)
    }
    return map
  }, [assets])

  const visualInputRows = useMemo(() => {
    const rows = nodes
      .filter((n) => n?.type === 'asset')
      .map((n) => {
        const asset = assetsById.get(n.assetId)
        const profile = n.profile && typeof n.profile === 'object' ? n.profile : {}
        return {
          assetId: n.assetId,
          item: asset?.name || 'Unknown',
          category: asset?.category || '',
          section: asset?.section || '',
          label: n.label || '',
          x: Number.isFinite(n.x) ? n.x : 0,
          y: Number.isFinite(n.y) ? n.y : 0,
          rotation: Number.isFinite(n.rotation) ? n.rotation : 0,
          scale: Number.isFinite(n.scale) ? n.scale : 1,
          locked: Boolean(n.locked),
          instrument: String(profile.instrument || asset?.name || ''),
          mic: String(profile.mic || ''),
          stand: String(profile.stand || ''),
          notes: String(profile.notes || ''),
          cables: String(profile.cables || ''),
        }
      })
      .sort((a, b) => (a.y - b.y) || (a.x - b.x))
      .map((r, idx) => ({
        order: idx + 1,
        ...r,
        x: Math.round(r.x),
        y: Math.round(r.y),
        rotation: Math.round(r.rotation),
        scale: Math.round(r.scale * 100) / 100,
      }))

    return rows
  }, [nodes, assetsById])

  const downloadBlob = (filename, blob) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  // Measure the sizing container (not the Stage container) to break circular dependency.
  // The stageWrapRef div is position:relative and sized by flex/grid.
  // The Stage sits in an absolute overlay inside it.
  useEffect(() => {
    const el = stageWrapEl
    if (!el) return

    const update = () => {
      // el is the measurement div — its size is purely CSS-driven (flex/grid),
      // NOT influenced by the Stage, because the Stage is position:absolute inside it.
      const width = Math.max(1, Math.floor(el.clientWidth))
      const height = Math.max(1, Math.floor(el.clientHeight))
      setStageSize({ width, height })

      if (debugSizeEnabled) {
        const rect = el.getBoundingClientRect()
        setStageWrapDebug((prev) => ({
          w: width,
          h: height,
          rectW: Math.round(rect.width),
          rectH: Math.round(rect.height),
          updates: prev.updates + 1,
        }))
      }
    }

    update()
    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    return () => ro.disconnect()
  }, [stageWrapEl, debugSizeEnabled])

  const getStageContentRect = useCallback(() => {
    const el = stageWrapEl
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const style = window.getComputedStyle(el)
    const paddingLeft = Number.parseFloat(style.paddingLeft || '0') || 0
    const paddingRight = Number.parseFloat(style.paddingRight || '0') || 0
    const paddingTop = Number.parseFloat(style.paddingTop || '0') || 0
    const paddingBottom = Number.parseFloat(style.paddingBottom || '0') || 0
    const left = rect.left + paddingLeft
    const top = rect.top + paddingTop
    const right = rect.right - paddingRight
    const bottom = rect.bottom - paddingBottom
    return { left, top, right, bottom }
  }, [stageWrapEl])

  useEffect(() => {
    const transformer = transformerRef.current
    const stage = stageRef.current
    if (!transformer || !stage) return

    const selected =
      selectedId && !selectedNode?.locked ? stage.findOne(`#node-${selectedId}`) : null
    transformer.nodes(selected ? [selected] : [])
    transformer.getLayer()?.batchDraw()
  }, [selectedId, nodes, selectedNode?.locked])

  const addNodeAt = useCallback((asset, x, y) => {
    const getDefaultProfile = (a) => {
      const nameKey = normalizeKey(a?.name)

      // Explicit professional defaults requested.
      if (nameKey === 'KICK DRUM') {
        return {
          instrument: 'KICK DRUM',
          mic: 'Kick Mic (Beta 52/B91)',
          stand: 'Short Boom',
          notes: '',
          cables: '',
        }
      }

      // Best-effort: if an icon name exactly matches an instrument row in the AFRIMA channel list.
      const fromCsv = channelDefaultsByInstrument.get(nameKey)
      if (fromCsv) {
        return {
          instrument: String(a?.name || ''),
          mic: fromCsv.mic || '',
          stand: fromCsv.stand || '',
          notes: fromCsv.notes || '',
          cables: fromCsv.cables || '',
        }
      }

      return {
        instrument: String(a?.name || ''),
        mic: '',
        stand: '',
        notes: '',
        cables: '',
      }
    }

    const id = uid()
    setNodes((prev) => [
      ...prev,
      {
        id,
        type: 'asset',
        assetId: asset._id,
        x,
        y,
        rotation: 0,
        scale: 1,
        label: '',
        flipX: false,
        locked: false,
        profile: getDefaultProfile(asset),
      },
    ])
    setSelectedId(id)
  }, [setNodes, channelDefaultsByInstrument])

  const deleteNode = (nodeId) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId))
    setSelectedId((prev) => (prev === nodeId ? null : prev))
  }

  const rotateNode = (nodeId, deltaDeg) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, rotation: (n.rotation || 0) + deltaDeg } : n))
    )
  }

  const scaleNode = (nodeId, factor) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? { ...n, scale: clamp((n.scale || 1) * factor, 0.25, 4) }
          : n
      )
    )
  }

  const flipNodeX = (nodeId) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, flipX: !n.flipX } : n)))
  }

  const setNodeLabel = (nodeId) => {
    const current = nodes.find((n) => n.id === nodeId)?.label || ''
    const next = window.prompt('Label text (leave blank to clear):', current)
    if (next === null) return
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, label: String(next) } : n)))
  }

  const toggleNodeLock = (nodeId) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, locked: !n.locked } : n)))
  }

  const moveLayer = (nodeId, delta) => {
    setNodes((prev) => {
      const from = prev.findIndex((n) => n.id === nodeId)
      if (from < 0) return prev
      const to = clamp(from + delta, 0, prev.length - 1)
      if (to === from) return prev
      const next = prev.slice()
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  useEffect(() => {
    const onMove = (ev) => {
      const drag = mobileDragRef.current
      if (!drag) return
      ev.preventDefault()
      setMobileDragPreview({ asset: drag.asset, x: ev.clientX, y: ev.clientY })
    }

    const onUp = (ev) => {
      const drag = mobileDragRef.current
      if (!drag) return
      mobileDragRef.current = null
      setMobileDragPreview(null)

      const content = getStageContentRect()
      if (!content) return
      const inStage =
        ev.clientX >= content.left &&
        ev.clientX <= content.right &&
        ev.clientY >= content.top &&
        ev.clientY <= content.bottom
      if (!inStage) return

      addNodeAt(drag.asset, ev.clientX - content.left, ev.clientY - content.top)
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [addNodeAt, getStageContentRect])

  const onDrop = (ev) => {
    ev.preventDefault()
    const assetId = ev.dataTransfer.getData('application/showplot-asset-id')
    const asset = assets.find((a) => a._id === assetId)
    if (!asset) return
    const content = getStageContentRect()
    if (!content) return
    const x = ev.clientX - content.left
    const y = ev.clientY - content.top
    addNodeAt(asset, x, y)
  }

  const touchGestureRef = useRef(null)

  const onStagePointerDown = useCallback((e) => {
    const stage = e.target?.getStage?.()
    if (!stage) return
    if (e.target === stage) setSelectedId(null)
  }, [])

  const onStageTouchStart = (e) => {
    const stage = stageRef.current
    if (!stage) return

    const touch1 = e.evt.touches?.[0]
    const touch2 = e.evt.touches?.[1]
    if (!touch1 || !touch2) {
      touchGestureRef.current = null
      return
    }

    if (!selectedNode) return

    const dx = touch2.clientX - touch1.clientX
    const dy = touch2.clientY - touch1.clientY
    const dist = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx)
    touchGestureRef.current = {
      dist,
      angle,
      startScale: selectedNode.scale || 1,
      startRotation: selectedNode.rotation || 0,
      nodeId: selectedNode.id,
    }
  }

  const onStageTouchMove = (e) => {
    const g = touchGestureRef.current
    if (!g) return
    const touch1 = e.evt.touches?.[0]
    const touch2 = e.evt.touches?.[1]
    if (!touch1 || !touch2) return
    e.evt.preventDefault()

    const dx = touch2.clientX - touch1.clientX
    const dy = touch2.clientY - touch1.clientY
    const dist = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx)

    const scale = clamp(g.startScale * (dist / g.dist), 0.25, 4)
    const rotation = g.startRotation + ((angle - g.angle) * 180) / Math.PI

    setNodes((prev) =>
      prev.map((n) => (n.id === g.nodeId ? { ...n, scale, rotation } : n))
    )
  }

  const exportPDF = async () => {
    const stage = stageRef.current
    if (!stage) return
    setIsBusy(true)
    setError('')

    try {
      const stageDataUrl = stage.toDataURL({ pixelRatio: 2 })
      const exportEl = exportRef.current
      if (!exportEl) throw new Error('Export surface not ready')

      const imgEl = exportEl.querySelector('img[data-stage-image]')
      if (imgEl) imgEl.src = stageDataUrl

      await new Promise((r) => setTimeout(r, 50))
      const canvas = await html2canvas(exportEl, {
        backgroundColor: '#ffffff',
        scale: 2,
      })

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()

      const imgData = canvas.toDataURL('image/png')
      const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height)
      const w = canvas.width * ratio
      const h = canvas.height * ratio
      const x = (pageWidth - w) / 2
      const y = (pageHeight - h) / 2

      pdf.addImage(imgData, 'PNG', x, y, w, h)
      const safeName = toSafeFilename(plotName) || 'showplot'
      pdf.save(`${safeName}-inputs.pdf`)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setIsBusy(false)
    }
  }

  const exportCSV = () => {
    try {
      // Match the layout pattern from the AFRIMA channel list CSV:
      // - blank spacer rows
      // - title row
      // - leading empty column + trailing empty column
      const title = 'AFRIMA AWARD 2026 EKO HOTEL CHANNEL LIST '
      const headerRow = ['', 'TOTAL', 'INSTRUMENT', 'MIC / DI', 'STAND', 'NOTES', 'CABLES', '']

      const escape = (value) => {
        const s = String(value ?? '')
        if (/[\n\r,"]/g.test(s)) return `"${s.replaceAll('"', '""')}"`
        return s
      }

      const blankRow = new Array(headerRow.length).fill('')

      const lines = []
      lines.push(blankRow.map(escape).join(','))
      lines.push(['', title, '', '', '', '', '', ''].map(escape).join(','))
      lines.push(blankRow.map(escape).join(','))
      lines.push(headerRow.map(escape).join(','))

      for (const r of visualInputRows) {
        lines.push(
          [
            '',
            r.order,
            r.instrument || r.item,
            r.mic,
            r.stand,
            r.notes,
            r.cables,
            '',
          ]
            .map(escape)
            .join(',')
        )
      }

      const csv = lines.join('\n')
      downloadBlob('showplot-inputs.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    } catch (e) {
      setError(String(e?.message || e))
    }
  }

  const exportExcel = () => {
    try {
      const title = 'AFRIMA AWARD 2026 EKO HOTEL CHANNEL LIST '
      const aoa = []
      aoa.push(['', '', '', '', '', '', '', ''])
      aoa.push(['', title, '', '', '', '', '', ''])
      aoa.push(['', '', '', '', '', '', '', ''])
      aoa.push(['', 'TOTAL', 'INSTRUMENT', 'MIC / DI', 'STAND', 'NOTES', 'CABLES', ''])

      for (const r of visualInputRows) {
        aoa.push(['', r.order, r.instrument || r.item, r.mic, r.stand, r.notes, r.cables, ''])
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Inputs')
      XLSX.writeFile(wb, 'showplot-inputs.xlsx')
    } catch (e) {
      setError(String(e?.message || e))
    }
  }

  const savePlot = async () => {
    if (!auth.user) {
      setError('Please sign in to save plots.')
      return
    }
    setIsBusy(true)
    setError('')
    try {
      let name = (plotName || '').trim()
      if (!name) {
        const next = window.prompt('Plot name:', 'Untitled')
        if (next === null) return
        name = String(next || '').trim() || 'Untitled'
        setPlotName(name)
      }

      const saved = await API.savePlot({ plotId: currentPlotId || undefined, name, state: nodes })
      if (saved?._id) {
        setCurrentPlotId(String(saved._id))
        setPlotPickerId(String(saved._id))
        await refreshSavedPlots()
      }
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setIsBusy(false)
    }
  }

  const loadPlot = async () => {
    if (!auth.user) {
      setError('Please sign in to load saved plots.')
      return
    }

    const id = plotPickerId.trim()
    if (!id) {
      setError('Select a saved plot to load.')
      return
    }

    setIsBusy(true)
    setError('')
    try {
      const loaded = await API.getPlot(id)
      setNodes(Array.isArray(loaded?.state) ? loaded.state : [])
      setSelectedId(null)
      setCurrentPlotId(String(loaded?._id || id))
      setPlotName(String(loaded?.name || 'Untitled'))
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setIsBusy(false)
    }
  }

  if (auth.isLoading) {
    return <div className="px-4 py-6 text-sm text-slate-600">Loading…</div>
  }

  if (!auth.user) {
    return (
      <div className="w-full min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <header className="sp-toolbar">
          <nav className="sp-toolbar-nav" aria-label="Stage Plot Builder toolbar">
            <div className="sp-toolbar-left">
              <div className="sp-brand-mark" aria-hidden="true">
                <span className="material-symbols-outlined text-[20px] leading-none">scatter_plot</span>
              </div>
              <div className="sp-brand-text">
                <div className="sp-brand-title">ShowPlot</div>
                <div className="sp-brand-subtitle">Stage Plot Builder</div>
              </div>
            </div>

            <div className="sp-toolbar-center" />

            <div className="sp-toolbar-right">
              <div className="sp-actions">
                <details className="relative z-30" ref={menuRef}>
                  <summary className="list-none cursor-pointer sp-icon-btn">
                    <span className="material-symbols-outlined text-[20px] leading-none">menu</span>
                    <span className="sr-only">Menu</span>
                  </summary>
                  <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                    <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Support</div>
                    <a
                      href="/feedback"
                      onClick={() => {
                        if (menuRef.current) menuRef.current.open = false
                      }}
                      className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Feedback
                    </a>
                    <div className="my-1 h-px bg-slate-200" />
                    <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Legal</div>
                    <a
                      href="/privacy"
                      onClick={() => {
                        if (menuRef.current) menuRef.current.open = false
                      }}
                      className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Privacy
                    </a>
                    <a
                      href="/terms"
                      onClick={() => {
                        if (menuRef.current) menuRef.current.open = false
                      }}
                      className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Terms
                    </a>
                  </div>
                </details>
              </div>
            </div>
          </nav>
        </header>

        <main className="flex-1 px-4 py-4 md:px-6 md:py-6">
          <SignIn title="Sign in to build and save" subtitle="Google Sign-In is required to use the builder." />
        </main>
      </div>
    )
  }

  return (
    <div className="w-full flex-1 min-h-0 bg-slate-50 text-slate-900 flex flex-col">
      <header className="sp-toolbar">
        <nav className="sp-toolbar-nav" aria-label="Stage Plot Builder toolbar">
          <div className="sp-toolbar-left">
            <div className="sp-brand-mark" aria-hidden="true">
              <span className="material-symbols-outlined text-[20px] leading-none">scatter_plot</span>
            </div>
            <div className="sp-brand-text">
              <div className="sp-brand-title">ShowPlot</div>
              <div className="sp-brand-subtitle">Stage Plot Builder</div>
            </div>
          </div>

          <div className="sp-toolbar-center">
            <div className="sp-flow">
              <div className="sp-group flex-1 max-w-[520px]" role="group" aria-label="Plot name and save">
                <label className="sr-only" htmlFor="plotName">Plot name</label>
                <input
                  id="plotName"
                  value={plotName}
                  onChange={(e) => setPlotName(e.target.value)}
                  placeholder="Plot name"
                  className="sp-field-input"
                />
                <button
                  type="button"
                  onClick={savePlot}
                  disabled={isBusy}
                  className="sp-btn-primary"
                >
                  Save
                </button>
              </div>

              <div className="sp-divider" aria-hidden="true" />

              <div className="sp-group" role="group" aria-label="Saved plots and load">
                <label className="sr-only" htmlFor="savedPlot">Saved plots</label>
                <select
                  id="savedPlot"
                  value={plotPickerId}
                  onChange={(e) => setPlotPickerId(e.target.value)}
                  className="sp-field-select"
                >
                  <option value="">Saved Plots</option>
                  {savedPlots.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name || 'Untitled'}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={loadPlot}
                  disabled={isBusy}
                  className="sp-btn-secondary"
                >
                  Load
                </button>
              </div>

              <div className="sp-divider" aria-hidden="true" />

              <button
                type="button"
                onClick={() => {
                  setNodes(() => [])
                  setSelectedId(null)
                  setCurrentPlotId('')
                  setPlotPickerId('')
                  setPlotName('')
                }}
                className="sp-btn-reset hidden sm:inline-flex"
              >
                New
              </button>

              <div className="sp-divider hidden sm:block" aria-hidden="true" />

              <details className="relative z-30 hidden sm:block">
                <summary className="list-none cursor-pointer sp-btn-export">
                  <span className="material-symbols-outlined text-[18px] leading-none">download</span>
                  Export
                </summary>
                <div className="absolute right-0 z-50 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={exportPDF}
                    disabled={isBusy}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={exportCSV}
                    disabled={isBusy}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={exportExcel}
                    disabled={isBusy}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
                  >
                    Excel
                  </button>
                </div>
              </details>
            </div>
          </div>

          <div className="sp-toolbar-right">
            <div className="sp-actions">
              <details className="relative z-30" ref={menuRef}>
                <summary className="list-none cursor-pointer sp-icon-btn">
                  <span className="material-symbols-outlined text-[20px] leading-none">menu</span>
                  <span className="sr-only">Menu</span>
                </summary>
                <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <div className="px-3 py-2">
                <div className="flex items-center gap-3">
                  {auth.user?.picture ? (
                    <img
                      src={auth.user.picture}
                      alt=""
                      className="h-9 w-9 rounded-full border border-slate-200"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full border border-slate-200 bg-slate-50" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {auth.user?.name || 'Signed in'}
                    </div>
                    <div className="truncate text-xs text-slate-500">{auth.user?.email || ''}</div>
                  </div>
                </div>
              </div>

              <div className="my-1 h-px bg-slate-200" />
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Account</div>
              <a
                href="/profile"
                onClick={() => {
                  if (menuRef.current) menuRef.current.open = false
                }}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Profile
              </a>
              <a
                href="/settings"
                onClick={() => {
                  if (menuRef.current) menuRef.current.open = false
                }}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Settings
              </a>
              <button
                type="button"
                onClick={() => {
                  if (menuRef.current) menuRef.current.open = false
                  auth.logout()
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>

              <div className="my-1 h-px bg-slate-200" />
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Support</div>
              <a
                href="/feedback"
                onClick={() => {
                  if (menuRef.current) menuRef.current.open = false
                }}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Feedback
              </a>

              <div className="my-1 h-px bg-slate-200" />
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Legal</div>
              <a
                href="/privacy"
                onClick={() => {
                  if (menuRef.current) menuRef.current.open = false
                }}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Privacy
              </a>
              <a
                href="/terms"
                onClick={() => {
                  if (menuRef.current) menuRef.current.open = false
                }}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Terms
              </a>
            </div>
              </details>
            </div>
          </div>
        </nav>
      </header>

      <main className="flex-1 min-h-0 px-4 py-4 md:px-6 md:py-6 flex flex-col">
        <div className="flex-1 min-h-0 grid grid-rows-[minmax(0,1fr)] gap-4 md:grid-cols-[280px_1fr]">
          <aside className="hidden md:flex md:flex-col md:min-h-0 rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Asset Library</div>

          <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const isActive = c === activeCategory
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(c)
                      setSelectedSection('')
                    }}
                    className={
                      'h-8 rounded-full border px-3 text-xs font-semibold ' +
                      (isActive
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                    }
                  >
                    {c}
                  </button>
                )
              })}
            </div>

            {sections.length ? (
              <div className="mt-4">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Sections</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sections.map((s) => {
                    const isActive = s.section === activeSection
                    return (
                      <button
                        key={s.section}
                        type="button"
                        onClick={() => setSelectedSection(s.section)}
                        className={
                          'h-8 rounded-full border px-3 text-xs font-semibold ' +
                          (isActive
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                        }
                      >
                        {s.section}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-3">
              {activeSectionItems.map((a) => (
                <LibraryItem key={a._id} asset={a} />
              ))}
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-500">Drag an icon onto the stage.</div>
          </aside>

        <section className="min-h-0 min-w-0 flex flex-col">
          <div
            ref={stageWrapRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="relative w-full flex-1 min-h-0 rounded-xl border border-slate-200 bg-white overflow-hidden"
          >
            <div className="absolute inset-0">
            <Stage
              ref={stageRef}
              width={stageSize.width}
              height={stageSize.height}
              onMouseDown={(e) => {
                onStagePointerDown(e)
              }}
              onTouchStart={(e) => {
                onStagePointerDown(e)
                onStageTouchStart(e)
              }}
              onTouchMove={onStageTouchMove}
            >
              <Layer>
                <Rect x={0} y={0} width={stageSize.width} height={stageSize.height} fill="#ffffff" listening={false} />
                <GridLines width={stageSize.width} height={stageSize.height} spacing={40} majorEvery={5} />

                {nodes.map((n) => (
                  [
                    <StageNode
                      key={`img-${n.id}`}
                      node={n}
                      isSelected={n.id === selectedId}
                      onSelect={() => setSelectedId(n.id)}
                      onChange={(patch) =>
                        setNodes((prev) => prev.map((x) => (x.id === n.id ? { ...x, ...patch } : x)))
                      }
                    />,
                    n.label ? (
                      <NodeLabel
                        key={`lbl-${n.id}`}
                        node={n}
                        text={n.label}
                      />
                    ) : null,
                    n.id === selectedId ? (
                      <NodeActions
                        key={`act-${n.id}`}
                        node={n}
                        canUndo={nodesHistory.canUndo}
                        canRedo={nodesHistory.canRedo}
                        onUndo={nodesHistory.undo}
                        onRedo={nodesHistory.redo}
                        onDelete={() => deleteNode(n.id)}
                        onDuplicate={() => {
                          const id = uid()
                          setNodes((prev) => {
                            const src = prev.find((x) => x.id === n.id)
                            if (!src) return prev
                            return [
                              ...prev,
                              {
                                ...src,
                                id,
                                x: (src.x || 0) + 24,
                                y: (src.y || 0) + 24,
                              },
                            ]
                          })
                          setSelectedId(id)
                        }}
                        onScaleUp={() => scaleNode(n.id, 1.12)}
                        onScaleDown={() => scaleNode(n.id, 1 / 1.12)}
                        onRotateRight={() => rotateNode(n.id, 15)}
                        onRotateLeft={() => rotateNode(n.id, -15)}
                        onFlipX={() => flipNodeX(n.id)}
                        onLayerUp={() => moveLayer(n.id, +1)}
                        onLayerDown={() => moveLayer(n.id, -1)}
                        onText={() => setNodeLabel(n.id)}
                        onToggleLock={() => toggleNodeLock(n.id)}
                      />
                    ) : null,
                  ]
                ))}
                <Transformer
                  ref={transformerRef}
                  rotateEnabled
                  keepRatio
                  anchorSize={10}
                  borderStroke="#ef4444"
                  anchorStroke="#ef4444"
                  anchorFill="#ffffff"
                  anchorCornerRadius={999}
                  enabledAnchors={[
                    'top-left',
                    'top-center',
                    'top-right',
                    'middle-left',
                    'middle-right',
                    'bottom-left',
                    'bottom-center',
                    'bottom-right',
                  ]}
                />
              </Layer>
            </Stage>
            </div>

            {debugSizeEnabled ? (
              <div className="pointer-events-none absolute left-2 top-2 z-50 rounded-lg border border-slate-200 bg-white/90 px-2 py-1 text-[11px] font-medium text-slate-700">
                <div>wrap: {stageWrapDebug.w}×{stageWrapDebug.h}</div>
                <div>rect: {stageWrapDebug.rectW}×{stageWrapDebug.rectH}</div>
                <div>stage: {stageSize.width}×{stageSize.height}</div>
                <div>updates: {stageWrapDebug.updates}</div>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </section>
        </div>

      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setIsSheetOpen((v) => !v)}
          className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow"
        >
          {isSheetOpen ? 'Close Library' : 'Open Library'}
        </button>

        <div
          className={
            'fixed left-0 right-0 bottom-0 z-30 rounded-t-2xl border-t border-slate-200 bg-white transition-transform duration-200 ease-out ' +
            (isSheetOpen ? 'translate-y-0' : 'translate-y-[70%]')
          }
        >
          <div className="mx-auto max-w-7xl px-4 pt-4 pb-6">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Asset Library</div>
              <div className="text-xs text-slate-500">Tap to add</div>
            </div>

            <div className="mt-3 max-h-[50vh] overflow-auto">
              <div className="pb-4">
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => {
                    const isActive = c === activeCategory
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(c)
                          setSelectedSection('')
                        }}
                        className={
                          'h-8 rounded-full border px-3 text-xs font-semibold ' +
                          (isActive
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                        }
                      >
                        {c}
                      </button>
                    )
                  })}
                </div>

                {sections.length ? (
                  <div className="mt-4">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Sections</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {sections.map((s) => {
                        const isActive = s.section === activeSection
                        return (
                          <button
                            key={s.section}
                            type="button"
                            onClick={() => setSelectedSection(s.section)}
                            className={
                              'h-8 rounded-full border px-3 text-xs font-semibold ' +
                              (isActive
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                            }
                          >
                            {s.section}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-4 gap-3">
                  {activeSectionItems.map((a) => (
                    <button
                      key={a._id}
                      type="button"
                      onPointerDown={(ev) => {
                        ev.preventDefault()
                        mobileDragRef.current = { asset: a }
                        setMobileDragPreview({ asset: a, x: ev.clientX, y: ev.clientY })
                      }}
                      className="rounded-xl border border-slate-200 bg-white p-2"
                    >
                      <img src={`/api/assets/${a._id}`} alt={a.name} className="h-12 w-full object-contain" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      </main>

      {mobileDragPreview ? (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: mobileDragPreview.x - 32, top: mobileDragPreview.y - 32 }}
        >
          <div className="h-16 w-16 rounded-2xl border border-slate-700 bg-slate-900/90 p-2">
            <img
              src={`/api/assets/${mobileDragPreview.asset._id}`}
              alt=""
              className="h-full w-full object-contain"
            />
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none fixed left-0 top-0 -translate-x-[200vw]">
        <div ref={exportRef} className="w-[794px] bg-white p-24 text-slate-900">
          <div className="text-lg font-semibold">{(plotName || '').trim() || 'ShowPlot Export'}</div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <img data-stage-image alt="Stage" className="w-full" />
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold">Inputs</div>
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2">TOTAL</th>
                    <th className="border-b border-slate-200 px-3 py-2">INSTRUMENT</th>
                    <th className="border-b border-slate-200 px-3 py-2">MIC / DI</th>
                    <th className="border-b border-slate-200 px-3 py-2">STAND</th>
                    <th className="border-b border-slate-200 px-3 py-2">NOTES</th>
                    <th className="border-b border-slate-200 px-3 py-2">CABLES</th>
                  </tr>
                </thead>
                <tbody>
                  {visualInputRows.map((row) => (
                    <tr key={`${row.order}:${row.assetId}:${row.x}:${row.y}`}>
                      <td className="border-b border-slate-200 px-3 py-2">{row.order}</td>
                      <td className="border-b border-slate-200 px-3 py-2">{row.instrument || row.item}</td>
                      <td className="border-b border-slate-200 px-3 py-2">{row.mic}</td>
                      <td className="border-b border-slate-200 px-3 py-2">{row.stand}</td>
                      <td className="border-b border-slate-200 px-3 py-2">{row.notes}</td>
                      <td className="border-b border-slate-200 px-3 py-2">{row.cables}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function LibraryItem({ asset }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('application/showplot-asset-id', asset._id)}
      className="cursor-grab rounded-xl border border-slate-200 bg-white p-2 active:cursor-grabbing"
      title="Drag to stage"
    >
      <img src={`/api/assets/${asset._id}`} alt={asset.name} className="h-14 w-full object-contain" />
      <div className="mt-2 truncate text-xs font-medium text-slate-700">{asset.name}</div>
    </div>
  )
}

function StageNode({ node, isSelected, onSelect, onChange }) {
  const image = useLoadedImage(`/api/assets/${node.assetId}`)
  const scale = node.scale || 1
  const flipX = Boolean(node.flipX)
  const locked = Boolean(node.locked)

  return (
    <KonvaImage
      id={`node-${node.id}`}
      draggable={!locked}
      image={image}
      x={node.x}
      y={node.y}
      rotation={node.rotation || 0}
      scaleX={flipX ? -scale : scale}
      scaleY={scale}
      width={80}
      height={80}
      offsetX={40}
      offsetY={40}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
      onTransformEnd={(e) => {
        if (locked) return
        const t = e.target
        const nextFlipX = t.scaleX() < 0
        const nextScale = clamp(Math.abs(t.scaleX()), 0.25, 4)
        const nextRotation = t.rotation()
        t.scaleX(1)
        t.scaleY(1)
        onChange({ scale: nextScale, rotation: nextRotation, flipX: nextFlipX })
      }}
      stroke={isSelected ? '#ef4444' : undefined}
      strokeWidth={isSelected ? 2 : 0}
      perfectDrawEnabled={false}
    />
  )
}

function NodeLabel({ node, text }) {
  const scale = node.scale || 1
  const y = (node.y || 0) + 40 * scale + 12
  return (
    <Text
      x={(node.x || 0) - 80}
      y={y}
      text={text}
      width={160}
      fontSize={12}
      fontStyle="600"
      fill="#0f172a"
      align="center"
      offsetX={0}
      offsetY={0}
      listening={false}
    />
  )
}

function NodeActions({
  node,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onScaleUp,
  onScaleDown,
  onText,
  onRotateRight,
  onRotateLeft,
  onFlipX,
  onLayerUp,
  onLayerDown,
  onDuplicate,
  onDelete,
  onToggleLock,
}) {
  const locked = Boolean(node.locked)
  const r = 40 * (node.scale || 1)

  return (
    <Group
      x={node.x}
      y={node.y}
      rotation={node.rotation || 0}
    >
      {/* Center overlay: move handle (visual only; node itself is draggable) */}
      <Group>
        <Circle radius={14} fill="#ffffff" stroke="#e2e8f0" strokeWidth={1} listening={false} />
        <Text
          text="open_with"
          x={-10}
          y={-10}
          width={20}
          height={20}
          align="center"
          verticalAlign="middle"
          fontSize={20}
          fill="#0f172a"
          fontFamily="Material Symbols Outlined"
          listening={false}
        />
      </Group>

      {/* Top-left: delete */}
      <Group x={-r} y={-r}>
        <NodeActionIcon x={0} y={0} icon="delete" danger onClick={onDelete} />
      </Group>

      {/* Top-right: duplicate + text */}
      <Group x={r} y={-r}>
        <NodeActionIcon x={0} y={0} icon="content_copy" onClick={onDuplicate} disabled={locked} />
        <NodeActionIcon x={-26} y={0} icon="text_fields" onClick={onText} disabled={locked} />
      </Group>

      {/* Left-side vertical: layering */}
      <Group x={-r} y={0}>
        <NodeActionIcon x={0} y={-13} icon="arrow_upward" onClick={onLayerUp} disabled={locked} />
        <NodeActionIcon x={0} y={+13} icon="arrow_downward" onClick={onLayerDown} disabled={locked} />
      </Group>

      {/* Right-side vertical: transform controls */}
      <Group x={r} y={0}>
        <NodeActionIcon x={0} y={-39} icon="zoom_in" onClick={onScaleUp} disabled={locked} />
        <NodeActionIcon x={0} y={-13} icon="zoom_out" onClick={onScaleDown} disabled={locked} />
        <NodeActionIcon x={0} y={+13} icon="flip" onClick={onFlipX} disabled={locked} />
        <NodeActionIcon x={0} y={+39} icon="rotate_right" onClick={onRotateRight} disabled={locked} />
        <NodeActionIcon x={-26} y={+39} icon="rotate_left" onClick={onRotateLeft} disabled={locked} />
      </Group>

      {/* Bottom-right: undo/redo */}
      <Group x={r} y={r}>
        <NodeActionIcon x={0} y={0} icon="undo" onClick={onUndo} disabled={!canUndo} />
        <NodeActionIcon x={-26} y={0} icon="redo" onClick={onRedo} disabled={!canRedo} />
      </Group>

      {/* Bottom-center: lock */}
      <Group x={0} y={r}>
        <NodeActionIcon
          x={0}
          y={0}
          icon={locked ? 'lock' : 'lock_open'}
          onClick={onToggleLock}
        />
      </Group>
    </Group>
  )
}

function NodeActionIcon({ icon, onClick, danger = false, disabled = false, x = 0, y = 0 }) {
  const fill = danger ? '#fee2e2' : '#ffffff'
  const stroke = danger ? '#fecaca' : '#e2e8f0'
  const iconFill = danger ? '#b91c1c' : '#0f172a'

  return (
    <Group
      x={x}
      y={y}
      onMouseDown={(e) => {
        e.cancelBubble = true
      }}
      onTouchStart={(e) => {
        e.cancelBubble = true
      }}
      onClick={(e) => {
        e.cancelBubble = true
        if (!disabled) onClick?.()
      }}
      onTap={(e) => {
        e.cancelBubble = true
        if (!disabled) onClick?.()
      }}
    >
      <Circle radius={12} fill={fill} stroke={stroke} strokeWidth={1} opacity={disabled ? 0.4 : 1} />
      <Text
        text={icon}
        x={-9}
        y={-9}
        width={18}
        height={18}
        align="center"
        verticalAlign="middle"
        fontSize={18}
        fill={iconFill}
        fontFamily="Material Symbols Outlined"
        listening={false}
        opacity={disabled ? 0.4 : 1}
      />
    </Group>
  )
}

function GridLines({ width, height, spacing = 40, majorEvery = 5 }) {
  const lines = []
  const cols = Math.floor(width / spacing)
  const rows = Math.floor(height / spacing)

  for (let i = 0; i <= cols; i++) {
    const x = i * spacing
    const major = majorEvery > 0 && i % majorEvery === 0
    lines.push(
      <Line
        key={`v-${i}`}
        points={[x, 0, x, height]}
        stroke={major ? '#d1d5db' : '#e5e7eb'}
        strokeWidth={1}
        listening={false}
      />
    )
  }

  for (let j = 0; j <= rows; j++) {
    const y = j * spacing
    const major = majorEvery > 0 && j % majorEvery === 0
    lines.push(
      <Line
        key={`h-${j}`}
        points={[0, y, width, y]}
        stroke={major ? '#d1d5db' : '#e5e7eb'}
        strokeWidth={1}
        listening={false}
      />
    )
  }

  return <Group>{lines}</Group>
}
