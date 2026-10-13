// Storage for trips. On Netlify this is Netlify Blobs; locally (LOCAL_BLOBS_DIR set)
// it is a folder of JSON files so the app can run without a Netlify account.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

function fileStore(dir) {
  const path = (key) => join(dir, encodeURIComponent(key) + '.json')
  const etagOf = (text) => createHash('sha1').update(text).digest('hex')
  return {
    async get(key) {
      try {
        const text = await readFile(path(key), 'utf8')
        return { data: JSON.parse(text), etag: etagOf(text) }
      } catch {
        return null
      }
    },
    async set(key, data, { etag, isNew } = {}) {
      await mkdir(dir, { recursive: true })
      const current = await this.get(key)
      if (isNew && current) return false
      if (etag && (!current || current.etag !== etag)) return false
      await writeFile(path(key), JSON.stringify(data))
      return true
    },
    async remove(key) {
      await unlink(path(key)).catch(() => {})
    },
  }
}

async function blobStore() {
  const { getStore } = await import('@netlify/blobs')
  const store = getStore({ name: 'trips', consistency: 'strong' })
  return {
    async get(key) {
      const res = await store.getWithMetadata(key, { type: 'json' })
      return res ? { data: res.data, etag: res.etag } : null
    },
    async set(key, data, { etag, isNew } = {}) {
      const opts = isNew ? { onlyIfNew: true } : etag ? { onlyIfMatch: etag } : {}
      const res = await store.setJSON(key, data, opts)
      return res?.modified !== false
    },
    async remove(key) {
      await store.delete(key)
    },
  }
}

export async function openStore() {
  if (process.env.LOCAL_BLOBS_DIR) return fileStore(process.env.LOCAL_BLOBS_DIR)
  return blobStore()
}
