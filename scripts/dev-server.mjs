// Local preview without a Netlify account: serves public/ and routes /api/* to
// the function, storing trips as JSON files in .local-blobs/.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

process.env.LOCAL_BLOBS_DIR ||= join(process.cwd(), '.local-blobs')
const { default: api } = await import('../netlify/functions/api.mjs')

const PORT = Number(process.env.PORT) || 8888
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (url.pathname.startsWith('/api/')) {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
    })
    const response = await api(request)
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
    return
  }
  let path = url.pathname.startsWith('/t/') ? '/index.html' : url.pathname
  if (path.endsWith('/')) path += 'index.html'
  const file = join('public', normalize(path).replace(/^(\.\.[/\\])+/, ''))
  try {
    const data = await readFile(file)
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404).end('Not found')
  }
}).listen(PORT, () => console.log(`everytrip running at http://localhost:${PORT}`))
