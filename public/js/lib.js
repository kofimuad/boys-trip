// Shared state, API calls and small UI helpers.
import { mascotSvg } from './art.js'

export const state = {
  tripId: null,
  trip: null,
  memberId: null,
  isAdmin: false,
  destinations: [],
  destNote: '',
  quiz: null,
}

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export const money = (n) => 'GH₵ ' + Number(n).toLocaleString('en-GH', { maximumFractionDigits: 2 })

export function fmtDate(iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })
}

const COLORS = ['#1cb0f6', '#ff9600', '#ce82ff', '#ff4b4b', '#58cc02', '#2b70c9', '#e5a800', '#00cd9c']
export function avatar(member) {
  const i = [...member.id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length
  return `<span class="avatar" style="background:${COLORS[i]}">${esc(member.name[0]?.toUpperCase() || '?')}</span>`
}

export const mascot = (say, big = false, mood = 'idle') =>
  `<div class="mascot${big ? ' big' : ''}">${big ? `<div class="bubble">${say}</div>` : ''}${mascotSvg(mood)}${big ? '' : `<div class="bubble">${say}</div>`}</div>`

// Wikipedia lead photo for a destination, cached for the session.
const photoCache = {}
export function wikiPhoto(d) {
  photoCache[d.id] ||= fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(d.wiki)}`)
    .then((r) => (r.ok ? r.json() : {}))
    .then((data) => data.thumbnail?.source || null)
    .catch(() => null)
  return photoCache[d.id]
}
export function fillPhotos() {
  document.querySelectorAll('[data-photo]').forEach(async (el) => {
    const d = dest(el.dataset.photo)
    const src = d && (await wikiPhoto(d))
    if (src) el.style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`
  })
}

// Per-trip sign-in details live in this browser only.
const key = (tripId) => 'everytrip:' + tripId
export function loadAuth(tripId) {
  try {
    return JSON.parse(localStorage.getItem(key(tripId))) || {}
  } catch {
    return {}
  }
}
export function saveAuth(tripId, auth) {
  try {
    localStorage.setItem(key(tripId), JSON.stringify({ ...loadAuth(tripId), ...auth }))
  } catch {}
}
export function clearAuth(tripId, fields) {
  const auth = loadAuth(tripId)
  for (const f of fields) delete auth[f]
  try {
    localStorage.setItem(key(tripId), JSON.stringify(auth))
  } catch {}
}
export function rememberTrip(trip) {
  try {
    const list = JSON.parse(localStorage.getItem('everytrip:trips') || '[]').filter((t) => t.id !== trip.id)
    list.unshift({ id: trip.id, name: trip.name })
    localStorage.setItem('everytrip:trips', JSON.stringify(list.slice(0, 5)))
  } catch {}
}
export function knownTrips() {
  try {
    return JSON.parse(localStorage.getItem('everytrip:trips') || '[]')
  } catch {
    return []
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const auth = state.tripId ? loadAuth(state.tripId) : {}
  const headers = { 'content-type': 'application/json' }
  if (auth.token) headers['x-member-token'] = auth.token
  if (auth.adminKey) headers['x-admin-key'] = auth.adminKey
  const res = await fetch('/api/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong')
    err.status = res.status
    throw err
  }
  if (data.trip) state.trip = data.trip
  return data
}

export const act = (body) => api(`trips/${state.tripId}/action`, { method: 'POST', body })
export const adminAct = (body) => api(`trips/${state.tripId}/admin`, { method: 'POST', body })

let toastTimer
export function toast(message, error = false) {
  document.querySelector('.toast')?.remove()
  const el = document.createElement('div')
  el.className = 'toast' + (error ? ' error' : '')
  el.textContent = message
  document.body.append(el)
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.remove(), 2800)
}

export const me = () => state.trip?.members.find((m) => m.id === state.memberId)
export const memberName = (id) => state.trip?.members.find((m) => m.id === id)?.name || 'Someone'
export const dest = (id) => state.destinations.find((d) => d.id === id)

// Minimal view layer: each screen renders an HTML string and names its handlers.
// Elements opt in with data-action (click), data-form (submit) or data-change.
let handlers = {}
const root = () => document.getElementById('app')

export function view(html, h = {}, { keepScroll = false } = {}) {
  root().innerHTML = html
  handlers = h
  if (!keepScroll) window.scrollTo(0, 0)
}

export function initEvents() {
  const el = root()
  el.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]')
    if (!target || !el.contains(target)) return
    const fn = handlers[target.dataset.action]
    if (!fn) return
    e.preventDefault()
    run(() => fn(target, e))
  })
  el.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]')
    const fn = form && handlers[form.dataset.form]
    if (!fn) return
    e.preventDefault()
    run(() => fn(Object.fromEntries(new FormData(form)), form))
  })
  el.addEventListener('change', (e) => {
    const target = e.target.closest('[data-change]')
    const fn = target && handlers[target.dataset.change]
    if (fn) run(() => fn(target, e))
  })
  el.addEventListener('input', (e) => {
    const target = e.target.closest('[data-input]')
    const fn = target && handlers[target.dataset.input]
    if (fn) fn(target, e)
  })
}

async function run(fn) {
  try {
    await fn()
  } catch (err) {
    console.error(err)
    toast(err.message || 'Something went wrong', true)
  }
}
