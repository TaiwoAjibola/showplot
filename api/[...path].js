function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function isHopByHopHeader(name) {
  const n = String(name || '').toLowerCase()
  return (
    n === 'connection' ||
    n === 'keep-alive' ||
    n === 'proxy-authenticate' ||
    n === 'proxy-authorization' ||
    n === 'te' ||
    n === 'trailer' ||
    n === 'transfer-encoding' ||
    n === 'upgrade' ||
    n === 'host'
  )
}

module.exports = async function handler(req, res) {
  const backendOrigin = String(process.env.BACKEND_ORIGIN || '').trim().replace(/\/+$/, '')
  if (!backendOrigin) {
    res.statusCode = 500
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({
      error: 'Missing BACKEND_ORIGIN. Set it to your backend base URL (e.g. https://showplot-api.onrender.com).',
    }))
    return
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`)

    // This function is mounted at /api/* on Vercel.
    // Forward to the backend /api/*, preserving the remainder of the path and query.
    const targetPath = url.pathname
    const targetUrl = `${backendOrigin}${targetPath}${url.search}`

    const headers = {}
    for (const [k, v] of Object.entries(req.headers || {})) {
      if (isHopByHopHeader(k)) continue
      if (typeof v === 'undefined') continue
      headers[k] = v
    }

    const method = req.method || 'GET'
    const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req)

    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: 'manual',
    })

    res.statusCode = upstream.status

    upstream.headers.forEach((value, key) => {
      if (isHopByHopHeader(key)) return
      // Let Vercel manage compression.
      if (key.toLowerCase() === 'content-encoding') return
      res.setHeader(key, value)
    })

    const buf = Buffer.from(await upstream.arrayBuffer())
    res.end(buf)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: String(e?.message || e) }))
  }
}
