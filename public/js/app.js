// Boot, routing and the app shell (sidebar on desktop, tab bar on phones).
import { state, esc, view, api, loadAuth, saveAuth, clearAuth, initEvents, me } from './lib.js'
import { landing, joinFlow, quizFlow } from './flows.js'
import * as pages from './pages.js'

const NAV = [
  ['home', '🏠', 'Home'],
  ['explore', '🧭', 'Explore'],
  ['vote', '🗳️', 'Vote'],
  ['dates', '📅', 'Dates'],
  ['plan', '📝', 'Plan'],
  ['money', '💰', 'Money'],
  ['crew', '👥', 'Crew'],
]

export function go(route) {
  if (location.hash !== '#' + route) location.hash = route
  else render()
}

export function shell(active, content, { wide = false } = {}) {
  const items = (cls) =>
    NAV.map(
      ([id, icon, label]) =>
        `<a class="${cls}${active === id ? ' active' : ''}" href="#${id}">${cls === 'nav-item' ? `<span class="ni">${icon}</span>${label}` : `${icon}<span>${label}</span>`}</a>`,
    ).join('')
  return `<div class="shell${wide ? ' wide' : ''}">
    <nav class="sidebar"><a class="logo" href="#home"><img src="/img/kweku.svg" alt="">boys trip</a>${items('nav-item')}</nav>
    <div class="topbar"><a class="logo" href="#home"><img src="/img/kweku.svg" alt="">${esc(state.trip.name)}</a></div>
    <main class="main"><div class="main-inner">${content}</div></main>
    <nav class="tabbar">${items('')}</nav>
  </div>`
}

async function render() {
  if (!state.tripId) return landing()
  if (!state.memberId || !me()) return joinFlow()
  const [route, param] = location.hash.replace(/^#/, '').split('/')
  if (route === 'quiz') return quizFlow()
  const page = pages[route] || pages.home
  return page(param)
}

async function refresh() {
  const auth = loadAuth(state.tripId)
  const res = await api('trips/' + state.tripId)
  state.memberId = res.memberId
  state.isAdmin = res.isAdmin
  if (!res.memberId && auth.token) clearAuth(state.tripId, ['token', 'memberId'])
}

async function boot() {
  initEvents()
  window.addEventListener('hashchange', () => render())
  const [destData, quiz] = await Promise.all([
    fetch('/data/destinations.json').then((r) => r.json()),
    fetch('/data/quiz.json').then((r) => r.json()),
  ])
  state.destinations = destData.destinations
  state.destNote = destData.note
  state.quiz = quiz

  const match = location.pathname.match(/^\/t\/([A-Za-z0-9_-]+)/)
  if (!match) return landing()
  state.tripId = match[1]

  // Organiser links carry the admin key in the #fragment, which never reaches the server logs.
  const adminMatch = location.hash.match(/admin=([A-Za-z0-9_-]+)/)
  if (adminMatch) {
    saveAuth(state.tripId, { adminKey: adminMatch[1] })
    history.replaceState(null, '', location.pathname + '#home')
  }

  try {
    await refresh()
  } catch (err) {
    if (err.status === 404) {
      return view(`<div class="flow"><div class="flow-body center" style="padding-top:80px">
        <img src="/img/kweku.svg" width="120" alt="">
        <h2>Trip not found</h2><p class="muted">This link may be old. Ask the organiser for the latest one.</p>
        <a class="btn" href="/">Go home</a></div></div>`)
    }
    throw err
  }
  // Pick up the group's changes when someone comes back to the tab.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !state.memberId) return
    const focused = document.activeElement?.matches('input, textarea, select')
    await refresh().catch(() => {})
    if (!focused && !document.querySelector('.flow')) render()
  })
  render()
}

boot().catch((err) => {
  console.error(err)
  document.getElementById('app').innerHTML = `<p class="spinner">Couldn't load the app. Check your connection and refresh.</p>`
})
