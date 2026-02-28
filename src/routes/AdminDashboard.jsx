import { useEffect, useMemo, useRef, useState } from 'react'

const API = {
  _readError: async (res, fallback) => {
    const ct = res.headers?.get?.('content-type') || ''
    if (ct.includes('application/json')) {
      const body = await res.json().catch(() => null)
      return body?.error || fallback
    }
    const text = await res.text().catch(() => '')
    const hint = text && text.trim().startsWith('<')
      ? ' (received HTML — check Vercel /api proxy + BACKEND_ORIGIN)'
      : ''
    return `${fallback}${hint}`
  },
  listAssets: async () => {
    const res = await fetch('/api/admin/assets')
    if (!res.ok) {
      throw new Error(await API._readError(res, 'Failed to load assets'))
    }
    return res.json()
  },
  uploadAsset: async (formData) => {
    const res = await fetch('/api/admin/assets', {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      throw new Error(await API._readError(res, 'Upload failed'))
    }
    return res.json()
  },
  deleteAsset: async (assetId) => {
    const res = await fetch(`/api/admin/assets/${assetId}`, { method: 'DELETE' })
    if (!res.ok) {
      throw new Error(await API._readError(res, 'Delete failed'))
    }
    return res.json()
  },
  updateAsset: async (assetId, patch) => {
    const res = await fetch(`/api/admin/assets/${assetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      throw new Error(await API._readError(res, 'Update failed'))
    }
    return res.json()
  },
  stats: async () => {
    const res = await fetch('/api/admin/stats')
    if (!res.ok) {
      throw new Error(await API._readError(res, 'Failed to load stats'))
    }
    return res.json()
  },
  getTaxonomy: async () => {
    const res = await fetch('/api/admin/taxonomy')
    if (!res.ok) {
      throw new Error(await API._readError(res, 'Failed to load taxonomy'))
    }
    return res.json()
  },
  addCategory: async (name) => {
    const res = await fetch('/api/admin/taxonomy/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      throw new Error(await API._readError(res, 'Failed to create category'))
    }
    return res.json()
  },
  addSection: async ({ category, name }) => {
    const res = await fetch('/api/admin/taxonomy/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, name }),
    })
    if (!res.ok) {
      throw new Error(await API._readError(res, 'Failed to create section'))
    }
    return res.json()
  },
}

function classNames(...parts) {
  return parts.filter(Boolean).join(' ')
}

export default function AdminDashboard() {
  const fileInputRef = useRef(null)
  const [assets, setAssets] = useState([])
  const [stats, setStats] = useState({ totalPlots: 0 })
  const [taxonomy, setTaxonomy] = useState({ categories: [] })
  const [pendingFile, setPendingFile] = useState(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [section, setSection] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [taxonomyCategory, setTaxonomyCategory] = useState('')
  const [newSectionName, setNewSectionName] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')

  const categoryOptions = useMemo(() => {
    return (taxonomy?.categories || [])
      .slice()
      .map((c) => c?.name)
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b)))
  }, [taxonomy])

  const uploadSectionOptions = useMemo(() => {
    const entry = (taxonomy?.categories || []).find((c) => c?.name === category)
    const sections = entry?.sections || []
    return sections
      .slice()
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b)))
  }, [taxonomy, category])

  const canUpload = useMemo(() => Boolean(pendingFile && (name || pendingFile?.name)), [pendingFile, name])

  const refresh = async () => {
    const [a, s, t] = await Promise.all([API.listAssets(), API.stats(), API.getTaxonomy()])
    setAssets(a)
    setStats(s)
    setTaxonomy(t)
  }

  useEffect(() => {
    refresh().catch((e) => setError(String(e?.message || e)))
  }, [])

  useEffect(() => {
    const first = taxonomy?.categories?.[0]?.name || ''
    if (!taxonomyCategory && first) setTaxonomyCategory(first)
  }, [taxonomy, taxonomyCategory])

  const onDrop = async (ev) => {
    ev.preventDefault()
    setError('')
    const file = ev.dataTransfer?.files?.[0]
    if (!file) return
    setPendingFile(file)
    setName((prev) => prev || file.name.replace(/\.[^.]+$/, ''))
  }

  const onUpload = async () => {
    if (!pendingFile) return
    setIsBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', pendingFile)
      form.append('name', name || pendingFile.name)
      form.append('category', category)
      form.append('section', section)
      await API.uploadAsset(form)
      setPendingFile(null)
      setName('')
      setCategory('')
      setSection('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      await refresh()
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setIsBusy(false)
    }
  }

  const onPickFile = (file) => {
    setError('')
    if (!file) return
    setPendingFile(file)
    setName((prev) => prev || file.name.replace(/\.[^.]+$/, ''))
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-6">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Plots</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">{stats.totalPlots}</div>
        </div>
        <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-4 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Upload Gear Icon</div>
              <div className="mt-1 text-sm text-slate-600">SVG/PNG only. This is the only entry point for assets.</div>
            </div>
            <button
              type="button"
              onClick={onUpload}
              disabled={!canUpload || isBusy}
              className={classNames(
                'h-10 rounded-lg px-4 text-sm font-semibold',
                canUpload && !isBusy
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : 'bg-slate-200 text-slate-500'
              )}
            >
              Upload
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className={classNames(
                'md:col-span-2 rounded-xl border border-dashed p-4',
                'border-slate-300 bg-slate-50'
              )}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm text-slate-700">
                  <div className="font-medium">Drag & drop an icon here</div>
                  <div className="mt-1 text-xs text-slate-500">or click to choose a file</div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/svg+xml,image/png"
                  onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                  className="block w-[220px] text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800"
                />
              </div>
              <div className="mt-3 text-xs text-slate-600">
                Selected: <span className="font-medium">{pendingFile ? pendingFile.name : 'None'}</span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                  placeholder="e.g. SM58"
                />
              </label>
              <label className="block">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Category</div>
                <select
                  value={category}
                  onChange={(e) => {
                    const next = e.target.value
                    setCategory(next)
                    setSection('')
                  }}
                  disabled={!(categoryOptions || []).length}
                  className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
                >
                  {(categoryOptions || []).length ? (
                    <option value="">Select category</option>
                  ) : (
                    <option value="">Create a category first</option>
                  )}
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Section</div>
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  disabled={!category || !(uploadSectionOptions || []).length}
                  className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
                >
                  {!category ? (
                    <option value="">Select category first</option>
                  ) : (uploadSectionOptions || []).length ? (
                    <option value="">Select section</option>
                  ) : (
                    <option value="">Create a section first</option>
                  )}
                  {uploadSectionOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Categories &amp; Sections</div>
            <div className="mt-1 text-sm text-slate-600">Create the library structure used by assets.</div>
          </div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {(taxonomy?.categories || []).length} categories
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Create Category</div>
              <div className="mt-2 flex gap-2">
                <input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                  placeholder="e.g. Instruments"
                  disabled={isBusy}
                />
                <button
                  type="button"
                  disabled={isBusy || !newCategoryName.trim()}
                  onClick={async () => {
                    setIsBusy(true)
                    setError('')
                    try {
                      const updated = await API.addCategory(newCategoryName)
                      setTaxonomy(updated)
                      setTaxonomyCategory((prev) => prev || newCategoryName.trim())
                      setNewCategoryName('')
                    } catch (e) {
                      setError(String(e?.message || e))
                    } finally {
                      setIsBusy(false)
                    }
                  }}
                  className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Create Section</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <select
                  value={taxonomyCategory}
                  onChange={(e) => setTaxonomyCategory(e.target.value)}
                  disabled={isBusy || !(taxonomy?.categories || []).length}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                >
                  {(taxonomy?.categories || []).map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                  placeholder="e.g. Drums"
                  disabled={isBusy || !(taxonomy?.categories || []).length}
                />
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={
                    isBusy ||
                    !(taxonomy?.categories || []).length ||
                    !taxonomyCategory.trim() ||
                    !newSectionName.trim()
                  }
                  onClick={async () => {
                    setIsBusy(true)
                    setError('')
                    try {
                      const updated = await API.addSection({ category: taxonomyCategory, name: newSectionName })
                      setTaxonomy(updated)
                      setNewSectionName('')
                    } catch (e) {
                      setError(String(e?.message || e))
                    } finally {
                      setIsBusy(false)
                    }
                  }}
                  className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Current</div>
            <div className="mt-3 space-y-3">
              {(taxonomy?.categories || []).length ? (
                taxonomy.categories
                  .slice()
                  .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                  .map((c) => (
                    <div key={c.name} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-sm font-semibold text-slate-900">{c.name}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(c.sections || []).length ? (
                          c.sections
                            .slice()
                            .sort((a, b) => String(a).localeCompare(String(b)))
                            .map((s) => (
                              <span
                                key={s}
                                className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                              >
                                {s}
                              </span>
                            ))
                        ) : (
                          <span className="text-xs text-slate-500">No sections yet</span>
                        )}
                      </div>
                    </div>
                  ))
              ) : (
                <div className="text-sm text-slate-600">No categories created yet.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Asset Gallery</div>
            <div className="mt-1 text-sm text-slate-600">Manage uploaded icons (delete, edit category/section).</div>
          </div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{assets.length} assets</div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {assets.map((asset) => (
            <AssetCard
              key={`${asset._id}:${asset.category || ''}:${asset.section || ''}`}
              asset={asset}
              taxonomy={taxonomy}
              disabled={isBusy}
              onDelete={async () => {
                setIsBusy(true)
                setError('')
                try {
                  await API.deleteAsset(asset._id)
                  await refresh()
                } catch (e) {
                  setError(String(e?.message || e))
                } finally {
                  setIsBusy(false)
                }
              }}
              onUpdate={async (patch) => {
                setIsBusy(true)
                setError('')
                try {
                  await API.updateAsset(asset._id, patch)
                  await refresh()
                } catch (e) {
                  setError(String(e?.message || e))
                } finally {
                  setIsBusy(false)
                }
              }}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function AssetCard({ asset, taxonomy, onDelete, onUpdate, disabled }) {
  const [category, setCategory] = useState(asset.category || '')
  const [section, setSection] = useState(asset.section || '')
  const hasAlpha = asset?.metadata?.hasAlpha

  const categories = useMemo(() => {
    return (taxonomy?.categories || [])
      .slice()
      .map((c) => c?.name)
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b)))
  }, [taxonomy])

  const sectionOptions = useMemo(() => {
    const categories = taxonomy?.categories || []
    const entry = categories.find((c) => c?.name === category)
    const sections = entry?.sections || []
    return sections
      .slice()
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b)))
  }, [taxonomy, category])

  const sectionHasLegacyValue = Boolean(section && !sectionOptions.includes(section))
  const categoryHasLegacyValue = Boolean(category && !categories.includes(category))

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <img
          src={`/api/assets/${asset._id}`}
          alt={asset.name}
          className="h-full w-full object-contain p-3"
          loading="lazy"
        />
      </div>
      <div className="mt-3">
        <div className="truncate text-sm font-semibold text-slate-900" title={asset.name}>
          {asset.name}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Transparency:{' '}
          <span className="font-medium text-slate-700">
            {hasAlpha === true ? 'Yes' : hasAlpha === false ? 'No' : 'Unknown'}
          </span>
        </div>
        <div className="mt-2">
          <select
            value={category}
            onChange={(e) => {
              const nextCategory = e.target.value
              setCategory(nextCategory)

              // If you switch category and the current section isn't valid, clear it.
              const nextSections = (taxonomy?.categories || []).find((c) => c?.name === nextCategory)?.sections || []
              if (section && !nextSections.includes(section)) setSection('')
            }}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
            disabled={disabled}
          >
            <option value="">Uncategorized</option>
            {categoryHasLegacyValue ? (
              <option value={category}>{category} (not in taxonomy)</option>
            ) : null}
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2">
          <select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
            disabled={disabled}
          >
            <option value="">Select section</option>
            {sectionHasLegacyValue ? (
              <option value={section}>{section} (not in taxonomy)</option>
            ) : null}
            {sectionOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onUpdate({ category, section })}
            disabled={disabled}
            className="h-9 flex-1 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
