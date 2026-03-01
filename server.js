import cors from 'cors'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
import express from 'express'
import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import multer from 'multer'
import { GridFSBucket, ObjectId } from 'mongodb'
import path from 'path'
import { finished } from 'stream/promises'
import { fileURLToPath } from 'url'

dotenv.config()

const PORT = Number(process.env.PORT || 5050)
const MONGODB_URI = process.env.MONGODB_URI
const MONGODB_DB = process.env.MONGODB_DB
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const SESSION_SECRET = process.env.SESSION_SECRET || ''

if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI in environment')
}

const app = express()
app.use(express.json({ limit: '5mb' }))
app.use(cookieParser())

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null

function getSessionTokenFromRequest(req) {
  const cookieToken = req.cookies?.sp_session
  if (cookieToken) return cookieToken
  const auth = req.headers?.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice('Bearer '.length)
  return null
}

function verifySessionToken(token) {
  if (!token || !SESSION_SECRET) return null
  try {
    return jwt.verify(token, SESSION_SECRET)
  } catch {
    return null
  }
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production'
  res.cookie('sp_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  })
}

function clearSessionCookie(res) {
  res.clearCookie('sp_session', { path: '/' })
}

function detectPngHasAlpha(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return false
  // PNG signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!buffer.subarray(0, 8).equals(sig)) return false

  let offset = 8
  let colorType = null
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > buffer.length) break

    if (type === 'IHDR' && length >= 13) {
      colorType = buffer[dataStart + 9]
      // 4: grayscale+alpha, 6: truecolor+alpha
      if (colorType === 4 || colorType === 6) return true
    }

    // tRNS indicates transparency for non-alpha color types
    if (type === 'tRNS') return true
    if (type === 'IEND') break

    offset = dataEnd + 4 // skip CRC
  }

  return false
}

function parseCorsAllowedOrigins() {
  const raw = process.env.CORS_ORIGIN
  const trimmed = String(raw || '').trim()
  if (!trimmed || trimmed === '*') return null
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = parseCorsAllowedOrigins()
      if (!allowed) return callback(null, true)
      if (!origin) return callback(null, true)
      return callback(null, allowed.includes(origin))
    },
    credentials: true,
  })
)

// Make disallowed origins a clear JSON 403 instead of a generic 500.
app.use((req, res, next) => {
  const allowed = parseCorsAllowedOrigins()
  if (!allowed) return next()

  const origin = req.headers?.origin
  if (!origin) return next()

  if (allowed.includes(origin)) return next()
  return res.status(403).json({ error: 'Not allowed by CORS' })
})

const assetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: { type: String, default: '' },
    section: { type: String, default: '' },
    fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
)

const stagePlotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, index: true },
    name: { type: String, default: '' },
    state: {
      type: [
        {
          id: String,
          type: String,
          x: Number,
          y: Number,
          rotation: Number,
          scale: Number,
          label: String,
          flipX: Boolean,
          locked: Boolean,
          assetId: String,
        },
      ],
      default: [],
    },
    inputs: {
      type: [
        {
          id: String,
          channel: String,
          instrument: String,
          mic: String,
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
)

const userSchema = new mongoose.Schema(
  {
    googleSub: { type: String, required: true, unique: true, index: true },
    email: { type: String, default: '' },
    name: { type: String, default: '' },
    picture: { type: String, default: '' },
  },
  { timestamps: true }
)

const feedbackSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, index: true },
    email: { type: String, default: '' },
    name: { type: String, default: '' },
    message: { type: String, required: true },
    page: { type: String, default: '' },
  },
  { timestamps: true }
)

const Asset = mongoose.model('Asset', assetSchema)
const StagePlot = mongoose.model('StagePlot', stagePlotSchema)
const User = mongoose.model('User', userSchema)
const Feedback = mongoose.model('Feedback', feedbackSchema)

const taxonomySchema = new mongoose.Schema(
  {
    categories: {
      type: [
        {
          name: { type: String, required: true },
          sections: { type: [String], default: [] },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
)

const Taxonomy = mongoose.model('Taxonomy', taxonomySchema)

let bucket = null

function isDbReady() {
  return mongoose.connection.readyState === 1 && Boolean(bucket)
}

async function requireAuth(req, res, next) {
  const token = getSessionTokenFromRequest(req)
  const payload = verifySessionToken(token)
  if (!payload?.uid) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const user = await User.findById(payload.uid).lean()
  if (!user) {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Unauthorized' })
  }

  req.user = user
  next()
}

app.use('/api', (req, res, next) => {
  if (!isDbReady()) {
    return res.status(503).json({
      error:
        'Database not connected. If using MongoDB Atlas, ensure your current IP is allowed in Network Access.',
    })
  }
  next()
})

app.get('/api/me', async (req, res) => {
  const token = getSessionTokenFromRequest(req)
  const payload = verifySessionToken(token)
  if (!payload?.uid) return res.json({ user: null })

  const user = await User.findById(payload.uid).lean()
  if (!user) {
    clearSessionCookie(res)
    return res.json({ user: null })
  }

  res.json({
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    },
  })
})

app.post('/api/auth/google', async (req, res) => {
  try {
    if (!googleClient || !GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: 'Missing GOOGLE_CLIENT_ID on server' })
    }
    if (!SESSION_SECRET) {
      return res.status(500).json({ error: 'Missing SESSION_SECRET on server' })
    }

    const credential = String(req.body?.credential || '')
    if (!credential) return res.status(400).json({ error: 'Missing credential' })

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    })

    const payload = ticket.getPayload()
    if (!payload?.sub) return res.status(401).json({ error: 'Invalid Google token' })

    const googleSub = payload.sub
    const email = String(payload.email || '')
    const name = String(payload.name || '')
    const picture = String(payload.picture || '')

    const user = await User.findOneAndUpdate(
      { googleSub },
      { googleSub, email, name, picture },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()

    const token = jwt.sign(
      {
        uid: String(user._id),
        sub: googleSub,
        email,
      },
      SESSION_SECRET,
      { expiresIn: '7d' }
    )

    setSessionCookie(res, token)

    res.json({
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        picture: user.picture,
      },
    })
  } catch (err) {
    res.status(401).json({ error: err?.message || 'Google sign-in failed' })
  }
})

app.post('/api/auth/logout', async (req, res) => {
  clearSessionCookie(res)
  res.json({ ok: true })
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const isAllowed =
      file.mimetype === 'image/png' ||
      file.mimetype === 'image/svg+xml' ||
      file.mimetype === 'image/x-png'
    if (!isAllowed) return cb(new Error('Only SVG/PNG uploads are allowed'))
    cb(null, true)
  },
})

function normalizeName(value) {
  return String(value || '').trim()
}

async function getOrCreateTaxonomy() {
  const existing = await Taxonomy.findOne({}).lean()
  if (existing) return existing
  const created = await Taxonomy.create({ categories: [] })
  return created.toObject()
}

async function upsertTaxonomyCategorySection(categoryRaw, sectionRaw) {
  const category = normalizeName(categoryRaw)
  const section = normalizeName(sectionRaw)
  if (!category && !section) return

  const doc = await Taxonomy.findOne({})
  if (!doc) {
    const categories = []
    if (category) {
      categories.push({ name: category, sections: section ? [section] : [] })
    }
    await Taxonomy.create({ categories })
    return
  }

  doc.categories = Array.isArray(doc.categories) ? doc.categories : []

  if (category) {
    let categoryEntry = doc.categories.find((c) => c?.name === category)
    if (!categoryEntry) {
      categoryEntry = { name: category, sections: [] }
      doc.categories.push(categoryEntry)
    }

    if (section) {
      categoryEntry.sections = Array.isArray(categoryEntry.sections) ? categoryEntry.sections : []
      if (!categoryEntry.sections.includes(section)) {
        categoryEntry.sections.push(section)
      }
    }
  }

  await doc.save()
}

app.post('/api/admin/assets', upload.single('file'), async (req, res) => {
  try {
    const { name = '', category = '', section = '' } = req.body || {}
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Missing upload file' })
    }
    if (!bucket) return res.status(503).json({ error: 'Storage not ready' })

    const uploadStream = bucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
      metadata: {
        originalName: req.file.originalname,
      },
    })

    uploadStream.end(req.file.buffer)
    await finished(uploadStream)

    const fileId = uploadStream.id
    if (!fileId) {
      return res.status(500).json({ error: 'Upload failed to produce a file id' })
    }

    const hasAlpha =
      req.file.mimetype === 'image/png' || req.file.mimetype === 'image/x-png'
        ? detectPngHasAlpha(req.file.buffer)
        : undefined

    const asset = await Asset.create({
      name: name || req.file.originalname,
      category,
      section,
      fileId,
      metadata: { contentType: req.file.mimetype, hasAlpha },
    })

    await upsertTaxonomyCategorySection(category, section)

    res.status(201).json(asset)
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Upload failed' })
  }
})

app.get('/api/admin/taxonomy', async (req, res) => {
  const taxonomy = await getOrCreateTaxonomy()
  res.json(taxonomy)
})

app.post('/api/admin/taxonomy/categories', async (req, res) => {
  const name = normalizeName(req.body?.name)
  if (!name) return res.status(400).json({ error: 'Missing category name' })

  const doc = await Taxonomy.findOne({})
  if (!doc) {
    const created = await Taxonomy.create({ categories: [{ name, sections: [] }] })
    return res.status(201).json(created.toObject())
  }

  doc.categories = Array.isArray(doc.categories) ? doc.categories : []
  if (!doc.categories.some((c) => c?.name === name)) {
    doc.categories.push({ name, sections: [] })
    await doc.save()
  }

  res.status(201).json(doc.toObject())
})

app.post('/api/admin/taxonomy/sections', async (req, res) => {
  const category = normalizeName(req.body?.category)
  const name = normalizeName(req.body?.name)
  if (!category) return res.status(400).json({ error: 'Missing category' })
  if (!name) return res.status(400).json({ error: 'Missing section name' })

  const doc = await Taxonomy.findOne({})
  if (!doc) {
    const created = await Taxonomy.create({ categories: [{ name: category, sections: [name] }] })
    return res.status(201).json(created.toObject())
  }

  doc.categories = Array.isArray(doc.categories) ? doc.categories : []
  let categoryEntry = doc.categories.find((c) => c?.name === category)
  if (!categoryEntry) {
    categoryEntry = { name: category, sections: [] }
    doc.categories.push(categoryEntry)
  }

  categoryEntry.sections = Array.isArray(categoryEntry.sections) ? categoryEntry.sections : []
  if (!categoryEntry.sections.includes(name)) {
    categoryEntry.sections.push(name)
    await doc.save()
  }

  res.status(201).json(doc.toObject())
})

app.get('/api/admin/assets', async (req, res) => {
  const assets = await Asset.find({}).sort({ createdAt: -1 }).lean()
  res.json(assets)
})

app.patch('/api/admin/assets/:id', async (req, res) => {
  const { id } = req.params
  const patch = {}
  if (typeof req.body?.name === 'string') patch.name = req.body.name
  if (typeof req.body?.category === 'string') patch.category = req.body.category
  if (typeof req.body?.section === 'string') patch.section = req.body.section

  const updated = await Asset.findByIdAndUpdate(id, patch, { new: true }).lean()
  if (!updated) return res.status(404).json({ error: 'Asset not found' })

  await upsertTaxonomyCategorySection(patch.category ?? updated.category, patch.section ?? updated.section)
  res.json(updated)
})

app.delete('/api/admin/assets/:id', async (req, res) => {
  const { id } = req.params
  const asset = await Asset.findById(id)
  if (!asset) return res.status(404).json({ error: 'Asset not found' })

  const fileId = asset.fileId
  await Asset.deleteOne({ _id: asset._id })

  if (bucket && fileId) {
    try {
      await bucket.delete(new ObjectId(String(fileId)))
    } catch {
      // ignore
    }
  }

  res.json({ ok: true })
})

app.get('/api/assets', async (req, res) => {
  const assets = await Asset.find({}).sort({ createdAt: -1 }).lean()
  res.json(
    assets.map((a) => ({
      _id: a._id,
      name: a.name,
      category: a.category,
      section: a.section || '',
    }))
  )
})

app.get('/api/assets/:id', async (req, res) => {
  if (!bucket) return res.status(503).send('Storage not ready')
  const asset = await Asset.findById(req.params.id).lean()
  if (!asset) return res.status(404).send('Not found')

  const filesColl = mongoose.connection.db.collection('assets.files')
  const fileDoc = await filesColl.findOne({ _id: new ObjectId(String(asset.fileId)) })
  if (!fileDoc) return res.status(404).send('File not found')

  res.setHeader('Content-Type', fileDoc.contentType || asset.metadata?.contentType || 'application/octet-stream')
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')

  const downloadStream = bucket.openDownloadStream(new ObjectId(String(asset.fileId)))
  downloadStream.on('error', () => {
    res.status(404).end()
  })
  downloadStream.pipe(res)
})

app.get('/api/plots', requireAuth, async (req, res) => {
  const plots = await StagePlot.find({ userId: req.user._id })
    .sort({ updatedAt: -1 })
    .select({ name: 1, updatedAt: 1, createdAt: 1 })
    .lean()

  res.json(
    plots.map((p) => ({
      _id: p._id,
      name: p.name || 'Untitled',
      updatedAt: p.updatedAt,
      createdAt: p.createdAt,
    }))
  )
})

app.post('/api/plots', requireAuth, async (req, res) => {
  const state = Array.isArray(req.body?.state) ? req.body.state : []
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const plotId = typeof req.body?.plotId === 'string' ? req.body.plotId.trim() : ''

  if (plotId) {
    if (!mongoose.isValidObjectId(plotId)) return res.status(400).json({ error: 'Invalid plot id' })
    const updated = await StagePlot.findOneAndUpdate(
      { _id: plotId, userId: req.user._id },
      { $set: { state, name } },
      { new: true }
    ).lean()
    if (!updated) return res.status(404).json({ error: 'Plot not found' })
    return res.status(200).json({ _id: updated._id })
  }

  const plot = await StagePlot.create({ userId: req.user._id, name, state, inputs: [] })
  res.status(201).json({ _id: plot._id })
})

app.get('/api/plots/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid plot id' })

  const plot = await StagePlot.findOne({ _id: id, userId: req.user._id }).lean()
  if (!plot) return res.status(404).json({ error: 'Plot not found' })

  res.json({
    _id: plot._id,
    name: plot.name || 'Untitled',
    state: plot.state || [],
    inputs: plot.inputs || [],
    createdAt: plot.createdAt,
    updatedAt: plot.updatedAt,
  })
})

app.post('/api/feedback', requireAuth, async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  const page = typeof req.body?.page === 'string' ? req.body.page.trim() : ''
  if (!message) return res.status(400).json({ error: 'Missing message' })

  await Feedback.create({
    userId: req.user._id,
    email: req.user.email || '',
    name: req.user.name || '',
    message,
    page,
  })

  res.status(201).json({ ok: true })
})

app.get('/api/admin/stats', async (req, res) => {
  const totalPlots = await StagePlot.countDocuments({})
  res.json({ totalPlots })
})

// Serve the built Vite app (production)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.join(__dirname, 'dist')

app.use(express.static(distDir))
app.get(
  [
    '/admin',
    '/admin/*rest',
    '/app',
    '/app/*rest',
    '/privacy',
    '/terms',
    '/settings',
    '/profile',
    '/feedback',
  ],
  (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.sendFile(path.join(distDir, 'index.html'))
  }
)

async function start() {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`ShowPlot server listening on http://localhost:${PORT}`)
  })

  const connectWithRetry = async () => {
    try {
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(MONGODB_URI, {
          dbName: MONGODB_DB,
          serverSelectionTimeoutMS: 8000,
        })
      }

      bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'assets' })
      // eslint-disable-next-line no-console
      console.log('MongoDB connected; GridFS bucket ready.')
    } catch (err) {
      bucket = null
      // eslint-disable-next-line no-console
      console.error('MongoDB connection failed; retrying in 5s...')
      // eslint-disable-next-line no-console
      console.error(err?.message || err)
      setTimeout(connectWithRetry, 5000)
    }
  }

  connectWithRetry()
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
