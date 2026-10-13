// The main pages inside the app shell.
import { state, esc, money, fmtDate, avatar, mascot, view, act, adminAct, api, toast, me, memberName, dest, loadAuth, clearAuth, saveAuth } from './lib.js'
import { tallyVotes, bestWindows, dayCounts, estimate, settleUp, daysBetween, upcomingMonths, monthDays, today, BUDGET } from './logic.js'
import { shell, go } from './app.js'
import { icon } from './art.js'
import { fillPhotos } from './lib.js'

const show = (active, html, handlers = {}, opts = {}) => view(shell(active, html, opts), handlers, opts)
const going = () => state.trip.members.filter((m) => m.status !== 'out')
const inviteLink = () => `${location.origin}/t/${state.tripId}`

function leadingPlace() {
  if (state.trip.locked?.destination) return dest(state.trip.locked.destination)
  const top = tallyVotes(state.trip.members, state.destinations)[0]
  return top?.points ? dest(top.id) : null
}

function lockedBanner() {
  const l = state.trip.locked
  if (!l || (!l.destination && !l.start)) return ''
  const d = l.destination && dest(l.destination)
  return `<div class="banner">
    <h3>It's decided!</h3>
    <p style="margin:0">${d ? `We're going to <b>${esc(d.name)}</b>` : 'Place still to be decided'}${l.start ? `, ${fmtDate(l.start)} to ${fmtDate(l.end)}` : ''}.</p>
  </div>`
}

/* ---------- Home ---------- */

export function home() {
  const m = me()
  const trip = state.trip
  const people = going()
  const voted = people.filter((p) => p.votes.length).length
  const marked = people.filter((p) => p.availability.length).length
  const steps = [
    { label: 'Join the trip', done: true, href: '#crew' },
    { label: 'Take the pick-a-place quiz', done: !!m.quiz, href: '#quiz' },
    { label: 'Vote for your top 3 places', done: m.votes.length > 0, href: '#vote' },
    { label: 'Mark the days you are free', done: m.availability.length > 0, href: '#dates' },
    { label: 'Plan the trip together', done: !!trip.locked?.destination && !!trip.locked?.start, href: '#plan' },
    { label: 'Track costs and settle up', done: false, href: '#money' },
  ]
  const nextStep = steps.find((s) => !s.done)
  const lead = leadingPlace()
  const best = bestWindows(trip.members, { length: 4, limit: 1 }).windows[0]

  show(
    'home',
    `${lockedBanner()}
    ${mascot(nextStep ? `Hey ${esc(m.name)}! Next up: <b>${esc(nextStep.label.toLowerCase())}</b>.` : `You're all set, ${esc(m.name)}!`, false, nextStep ? 'idle' : 'cheer')}
    <div class="path">
      ${steps
        .map(
          (s, i) => `<a class="path-step${s.done ? ' done' : ''}${s === nextStep ? ' current' : ''}" href="${s.href}" style="--shift:${[0, 1, 0.4, -0.6, -1, -0.2][i]}">
            <span class="path-dot">${s.done ? icon('check', 28) : i + 1}</span><span class="path-label">${esc(s.label)}</span></a>`,
        )
        .join('')}
    </div>
    <div class="section-title"><h2>The group so far</h2></div>
    <div class="grid">
      <div class="card"><h3>Votes</h3><p class="muted">${voted} of ${people.length} voted</p>
        ${lead ? `<p>Leading: <b>${esc(lead.name)}</b></p>` : '<p class="muted">No votes yet</p>'}</div>
      <div class="card"><h3>Dates</h3><p class="muted">${marked} of ${people.length} marked their days</p>
        ${best ? `<p>Best so far: <b>${fmtDate(best.start)} to ${fmtDate(best.end)}</b> (${best.count} free)</p>` : '<p class="muted">No overlap yet</p>'}</div>
      <div class="card"><h3>Crew</h3><p class="muted">${people.length} going or maybe</p>
        <div class="row">${trip.members.map(avatar).join('')}</div></div>
    </div>`,
  )
}

/* ---------- Explore ---------- */

const FILTERS = [
  ['all', 'All'],
  ['beach', 'Beach'],
  ['nature', 'Nature'],
  ['nightlife', 'Nightlife'],
  ['history', 'History'],
  ['budget', 'Fits budget'],
]
let exploreFilter = 'all'

export function explore(param) {
  if (param && dest(param)) return destination(dest(param))
  const list = state.destinations.filter((d) =>
    exploreFilter === 'all' ? true : exploreFilter === 'budget' ? estimate(d).fits : d.tags.includes(exploreFilter),
  )
  show(
    'explore',
    `<h1>Explore Ghana</h1>
    <p class="muted">Tap a place to see costs, things to do, food, weather and a map.</p>
    <div class="banner blue row" style="justify-content:space-between">
      <div><h3 style="margin:0">Can't decide?</h3><p style="margin:0">Take the quiz and Kweku will pick for you.</p></div>
      <a class="btn ghost small" href="#quiz">Take quiz</a>
    </div>
    <div class="row" style="margin-bottom:16px">${FILTERS.map(
      ([id, label]) => `<button class="chip${exploreFilter === id ? ' blue' : ''}" data-action="filter" data-id="${id}" style="cursor:pointer">${label}</button>`,
    ).join('')}</div>
    <div class="grid">${list
      .map((d) => {
        const est = estimate(d)
        return `<a class="card dest-card" href="#explore/${d.id}" style="text-decoration:none">
          <span class="photo" data-photo="${d.id}"></span>
          <span class="body">
            <h3 style="margin:0">${esc(d.name)}</h3>
            <span class="muted small">${esc(d.tagline)}</span>
            <span class="meta">
              <span class="chip ${est.fits ? 'green' : 'red'}">~${money(est.total)}</span>
              <span class="chip">${d.fromAccra.hours ? `${d.fromAccra.hours}h from Accra` : 'In Accra'}</span>
            </span>
          </span></a>`
      })
      .join('')}</div>
    <p class="credit" style="margin-top:20px">${esc(state.destNote)}</p>`,
    { filter: (el) => ((exploreFilter = el.dataset.id), explore()) },
    { wide: true },
  )
  fillPhotos()
}

function destination(d) {
  const est = estimate(d)
  const m = me()
  const inVotes = m.votes.includes(d.id)
  show(
    'explore',
    `<a href="#explore" class="btn ghost small plain">← All places</a>
    <div style="margin:16px 0 8px"><h1 style="margin:0">${esc(d.name)}</h1><span class="muted">${esc(d.region)} Region</span></div>
    <p>${esc(d.tagline)}</p>
    <img id="wiki-img" class="hero-img hidden" alt="${esc(d.name)}">
    <p id="wiki-text" class="muted"></p>
    <p id="wiki-credit" class="credit"></p>
    <div class="row" style="margin:12px 0 4px">
      <button class="btn ${inVotes ? 'ghost' : ''}" data-action="vote">${inVotes ? 'In my top 3' : 'Add to my votes'}</button>
    </div>

    <div class="section-title"><h2>Rough cost per person</h2></div>
    <div class="card">
      <table class="cost-table">${est.rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${money(v)}</td></tr>`).join('')}
        <tr class="total"><td>Total (4 days)</td><td>${money(est.total)}</td></tr></table>
      <p style="margin:10px 0 0"><span class="chip ${est.fits ? 'green' : 'red'}">${est.fits ? 'Fits' : 'Over'} the ${money(BUDGET)} budget</span></p>
      <p class="muted small" style="margin-top:8px">${est.fits ? `About ${money(BUDGET - est.total)} spare each for extras.` : `About ${money(est.total - BUDGET)} over each. Cutting an activity or a night would help.`} ${esc(state.destNote)}</p>
    </div>

    <div class="section-title"><h2>Getting there</h2></div>
    <div class="card"><p style="margin:0">${d.fromAccra.hours ? `About <b>${d.fromAccra.hours} hours</b> (${d.fromAccra.km} km) from Accra. ` : ''}${esc(d.fromAccra.how)}</p></div>

    <div class="section-title"><h2>Things to do</h2></div>
    <div class="card"><ul class="clean">${d.activities
      .map((a) => `<li><span class="spacer">${esc(a.name)}</span><span class="chip">${a.cost ? money(a.cost) : 'Free'}</span></li>`)
      .join('')}</ul></div>

    <div class="section-title"><h2>Food to try</h2></div>
    <div class="card"><ul class="clean">${d.food.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>

    <div class="section-title"><h2>Where to stay</h2></div>
    <div class="card"><p style="margin:0">${esc(d.stay)}</p></div>

    <div class="section-title"><h2>Tips</h2></div>
    <div class="card"><ul class="clean">${d.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>

    <div class="section-title"><h2>Weather</h2></div>
    <div class="card"><div id="weather" class="muted">Loading forecast…</div>
      <p class="muted small" style="margin:10px 0 0">December and January are dry season, with dusty Harmattan winds, hot afternoons and cooler mornings.</p></div>

    <div class="section-title"><h2>Map</h2><span class="spacer"></span><button class="btn blue small" data-action="nearby">Find food & bars nearby</button></div>
    <div id="map" class="map"></div>
    <div id="nearby" style="margin-top:12px"></div>
    <p class="credit">Maps © OpenStreetMap contributors · Weather by Open-Meteo · Text and photo from Wikipedia (CC BY-SA)</p>`,
    {
      vote: async () => {
        const votes = inVotes ? m.votes.filter((v) => v !== d.id) : [...m.votes, d.id].slice(-3)
        await act({ type: 'setVotes', votes })
        toast(inVotes ? 'Removed from your votes' : 'Added to your votes')
        destination(d)
      },
      nearby: () => loadNearby(d),
    },
  )
  loadWiki(d)
  loadWeather(d)
  loadMap(d)
}

async function loadWiki(d) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(d.wiki)}`)
    if (!res.ok) return
    const data = await res.json()
    const img = document.getElementById('wiki-img')
    const text = document.getElementById('wiki-text')
    if (!img) return
    const src = data.originalimage?.source || data.thumbnail?.source
    if (src) {
      img.src = src
      img.classList.remove('hidden')
    }
    text.textContent = data.extract || ''
    const credit = document.getElementById('wiki-credit')
    const link = document.createElement('a')
    link.href = data.content_urls?.desktop?.page || '#'
    link.target = '_blank'
    link.rel = 'noopener'
    link.textContent = 'Read more on Wikipedia'
    const voyage = document.createElement('a')
    voyage.href = `https://en.wikivoyage.org/wiki/${encodeURIComponent(d.wiki.replace(/ /g, '_'))}`
    voyage.target = '_blank'
    voyage.rel = 'noopener'
    voyage.textContent = 'Travel guide on Wikivoyage'
    credit.append(link, ' · ', voyage)
  } catch {}
}

async function loadWeather(d) {
  const el = document.getElementById('weather')
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${d.lat}&longitude=${d.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=Africa%2FAccra&forecast_days=7`
    const data = await (await fetch(url)).json()
    const sky = (c) => (c <= 1 ? 'Sunny' : c <= 3 ? 'Cloudy' : c <= 48 ? 'Hazy' : c <= 67 ? 'Rain' : c <= 82 ? 'Showers' : 'Storms')
    el.innerHTML = `<div class="row" style="justify-content:space-between">${data.daily.time
      .map(
        (t, i) => `<div class="center" style="min-width:56px"><div class="small muted">${fmtDate(t, { weekday: 'short' })}</div>
          <div class="small muted">${sky(data.daily.weather_code[i])}</div>
          <div class="small"><b>${Math.round(data.daily.temperature_2m_max[i])}°</b> ${Math.round(data.daily.temperature_2m_min[i])}°</div></div>`,
      )
      .join('')}</div><p class="muted small" style="margin:8px 0 0">This week's forecast.</p>`
  } catch {
    if (el) el.textContent = "Couldn't load the forecast right now."
  }
}

let leafletLoading
function leaflet() {
  leafletLoading ||= new Promise((resolve, reject) => {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
    document.head.append(css)
    const js = document.createElement('script')
    js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
    js.onload = () => resolve(window.L)
    js.onerror = reject
    document.head.append(js)
  })
  return leafletLoading
}

let currentMap
async function loadMap(d) {
  try {
    const L = await leaflet()
    const el = document.getElementById('map')
    if (!el) return
    currentMap = L.map(el, { scrollWheelZoom: false }).setView([d.lat, d.lon], 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors',
    }).addTo(currentMap)
    L.marker([d.lat, d.lon]).addTo(currentMap).bindPopup(d.name)
  } catch {
    const el = document.getElementById('map')
    if (el) el.innerHTML = '<p class="spinner">Map unavailable</p>'
  }
}

async function loadNearby(d) {
  const el = document.getElementById('nearby')
  el.innerHTML = '<p class="muted">Searching OpenStreetMap…</p>'
  const q = `[out:json][timeout:20];(node(around:6000,${d.lat},${d.lon})[amenity~"^(restaurant|bar|cafe|fast_food|pub)$"][name];node(around:6000,${d.lat},${d.lon})[tourism~"^(hotel|guest_house|hostel|attraction)$"][name];);out 40;`
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) })
    const data = await res.json()
    const places = data.elements.filter((p) => p.tags?.name)
    if (!places.length) {
      el.innerHTML = '<p class="muted">Nothing listed nearby on OpenStreetMap yet.</p>'
      return
    }
    const kind = (t) => t.amenity || t.tourism
    el.innerHTML = `<div class="card"><ul class="clean">${places
      .map(
        (p, i) => `<li><span class="spacer">${esc(p.tags.name)} <span class="muted small">${esc(kind(p.tags).replace('_', ' '))}</span></span>
          <button class="btn ghost small" data-action="addFood" data-i="${i}">+ Plan</button></li>`,
      )
      .join('')}</ul></div>`
    const L = window.L
    if (L && currentMap) places.forEach((p) => L.circleMarker([p.lat, p.lon], { radius: 6, color: '#1cb0f6' }).addTo(currentMap).bindPopup(p.tags.name))
    // Handlers for the new buttons: extend the current page's handlers.
    el.onclick = async (e) => {
      const b = e.target.closest('[data-action="addFood"]')
      if (!b) return
      e.stopPropagation()
      const p = places[Number(b.dataset.i)]
      const isStay = !!p.tags.tourism
      await act({ type: 'addItem', list: isStay ? 'checklist' : 'food', title: isStay ? `Check out ${p.tags.name} (${d.name})` : `${p.tags.name} (${d.name})` })
      b.textContent = 'Added'
      b.disabled = true
    }
  } catch {
    el.innerHTML = '<p class="muted">OpenStreetMap search is busy. Try again in a minute.</p>'
  }
}

/* ---------- Vote ---------- */

export function vote() {
  const m = me()
  let picks = [...m.votes]
  const tally = tallyVotes(state.trip.members, state.destinations)
  const maxPoints = Math.max(1, ...tally.map((t) => t.points))
  const voters = going().filter((p) => p.votes.length).length
  const locked = state.trip.locked?.destination

  function render() {
    const changed = picks.join() !== m.votes.join()
    show(
      'vote',
      `${lockedBanner()}<h1>Vote on a place</h1>
      <p class="muted">Tap up to 3 places in order: your 1st choice gets 3 points, 2nd gets 2, 3rd gets 1.</p>
      <div class="options">${state.destinations
        .map((d) => {
          const rank = picks.indexOf(d.id)
          return `<button class="option${rank >= 0 ? ' selected' : ''}" data-action="pick" data-id="${d.id}">
            <span class="icon">${rank >= 0 ? rank + 1 : ''}</span>
            <span class="spacer">${esc(d.name)}<span class="sub">${esc(d.tagline)}</span></span></button>`
        })
        .join('')}</div>
      <div class="row" style="margin-top:16px">
        <button class="btn" data-action="save" ${changed && picks.length ? '' : 'disabled'}>Save my votes</button>
        ${picks.length ? '<button class="btn ghost small plain" data-action="clear">Clear</button>' : ''}
      </div>

      <div class="section-title"><h2>Results</h2><span class="chip">${voters} of ${going().length} voted</span></div>
      <div class="card stack">${tally
        .filter((t) => t.points)
        .map((t) => {
          const d = dest(t.id)
          return `<div><div class="row"><b class="spacer">${esc(d.name)}</b><span class="muted small">${t.points} pts</span>
            ${state.isAdmin ? `<button class="btn gold small" data-action="lock" data-id="${d.id}">${locked === d.id ? 'Locked' : 'Lock in'}</button>` : ''}</div>
            <div class="row" style="margin-top:6px"><div class="bar"><div style="width:${(t.points / maxPoints) * 100}%"></div></div></div>
            <div class="muted small">${t.voters.map(esc).join(', ')}</div></div>`
        })
        .join('') || '<p class="muted" style="margin:0">No votes yet. Be the first!</p>'}</div>
      ${state.isAdmin ? '<p class="muted small">As organiser, you can lock in the winning place once everyone has voted.</p>' : ''}`,
      {
        pick: (el) => {
          const id = el.dataset.id
          picks = picks.includes(id) ? picks.filter((p) => p !== id) : picks.length < 3 ? [...picks, id] : picks
          if (picks.length === 3 && !picks.includes(id)) toast('You can pick 3. Tap one to remove it first.')
          render()
        },
        clear: () => ((picks = []), render()),
        save: async () => {
          await act({ type: 'setVotes', votes: picks })
          toast('Votes saved!')
          vote()
        },
        lock: async (el) => {
          await adminAct({ type: 'lock', destination: el.dataset.id })
          toast('Place locked in!')
          vote()
        },
      },
      { keepScroll: true },
    )
  }
  render()
}

/* ---------- Dates ---------- */

let pickedMonths = null

export function dates() {
  const m = me()
  const mine = new Set(m.availability)
  const total = going().length
  const offered = upcomingMonths()
  // Show the months anyone has marked; if nobody has yet, the next two.
  const groupMonths = new Set(state.trip.members.flatMap((p) => p.availability.map((d) => d.slice(0, 7))))
  pickedMonths ||= new Set(groupMonths.size ? [...groupMonths] : offered.slice(0, 2))

  function render() {
    const now = today()
    const shown = [...new Set([...pickedMonths, ...[...mine].map((d) => d.slice(0, 7))])].sort()
    const monthLabel = (ym, opts = { month: 'long', year: 'numeric' }) => fmtDate(ym + '-01', opts)
    const others = state.trip.members.filter((p) => p.id !== m.id)
    const counts = dayCounts([...others, { ...m, availability: [...mine] }])
    const four = bestWindows(state.trip.members, { length: 4 })
    const three = bestWindows(state.trip.members, { length: 3 })
    const bestDays = new Set(four.windows[0] ? daysBetween(four.windows[0].start, four.windows[0].end) : [])
    const changed = [...mine].sort().join() !== m.availability.join()

    const picker = `<div class="month-picker">${offered
      .map(
        (ym) => `<button class="chip${pickedMonths.has(ym) ? ' blue' : ''}${groupMonths.has(ym) ? ' has-dates' : ''}" data-action="month" data-m="${ym}">
          ${monthLabel(ym, { month: 'short', year: ym.slice(0, 4) === now.slice(0, 4) ? undefined : '2-digit' })}</button>`,
      )
      .join('')}</div>`
    const cal = shown
      .map((ym) => {
        const label = monthLabel(ym)
        const days = monthDays(ym)
        const offset = (new Date(days[0] + 'T00:00:00Z').getUTCDay() + 6) % 7
        return `<h3 class="month-name">${label}</h3><div class="cal">
          ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="dow">${d}</div>`).join('')}
          ${'<button class="day" disabled></button>'.repeat(offset)}
          ${days
            .map(
              (d) => `<button class="day${mine.has(d) ? ' mine' : ''}${bestDays.has(d) ? ' best' : ''}${d < now ? ' past' : ''}" data-action="toggle" data-d="${d}"
                ${d < now ? 'aria-disabled="true"' : ''} title="${counts[d] || 0} of ${total} free">${Number(d.slice(8))}<small>${counts[d] ? `${counts[d]}/${total}` : ''}</small></button>`,
            )
            .join('')}</div>`
      })
      .join('')

    const windowList = (res, len) =>
      res.windows.length
        ? res.windows
            .map(
              (w) => `<li><span class="spacer"><b>${fmtDate(w.start)} to ${fmtDate(w.end)}</b><br>
                <span class="muted small">${w.count} of ${res.total} free: ${w.names.map(esc).join(', ')}</span></span>
                ${state.isAdmin ? `<button class="btn gold small" data-action="lock" data-s="${w.start}" data-e="${w.end}">Lock in</button>` : ''}</li>`,
            )
            .join('')
        : `<li class="muted">No ${len}-day overlap yet.</li>`

    show(
      'dates',
      `${lockedBanner()}<h1>When are you free?</h1>
      <p class="muted">Pick the months you want to look at, then tap every day you could travel. Green days are yours; the small number shows how many of the group are free. Gold outline is the best 4-day stretch so far.</p>
      <h3 style="margin:16px 0 8px">Months</h3>
      ${picker}
      <p class="muted small" style="margin:6px 0 0">A dot means someone in the group has marked days that month.</p>
      <div class="row" style="position:sticky;top:64px;z-index:4;background:var(--bg);padding:8px 0">
        <button class="btn" data-action="save" ${changed ? '' : 'disabled'}>Save my dates</button>
        <button class="btn ghost small plain" data-action="weekends">Add all weekends</button>
        <span class="muted small">${mine.size} days picked</span>
      </div>
      ${cal || '<p class="muted">Pick at least one month above.</p>'}
      <div class="section-title"><h2>Best 4-day stretches</h2></div>
      <div class="card"><ul class="clean">${windowList(four, 4)}</ul></div>
      <div class="section-title"><h2>Best 3-day stretches</h2></div>
      <div class="card"><ul class="clean">${windowList(three, 3)}</ul></div>`,
      {
        month: (el) => {
          const ym = el.dataset.m
          if (pickedMonths.has(ym)) {
            if ([...mine].some((d) => d.startsWith(ym))) return toast('Clear your days in that month first')
            pickedMonths.delete(ym)
          } else pickedMonths.add(ym)
          render()
        },
        toggle: (el) => {
          const d = el.dataset.d
          if (d < now) return
          mine.has(d) ? mine.delete(d) : mine.add(d)
          render()
        },
        weekends: () => {
          for (const d of shown.flatMap(monthDays)) {
            if (d < now) continue
            const day = new Date(d + 'T00:00:00Z').getUTCDay()
            if (day === 0 || day === 5 || day === 6) mine.add(d)
          }
          render()
        },
        save: async () => {
          await act({ type: 'setAvailability', dates: [...mine] })
          toast('Dates saved!')
          dates()
        },
        lock: async (el) => {
          await adminAct({ type: 'lock', start: el.dataset.s, end: el.dataset.e })
          toast('Dates locked in!')
          dates()
        },
      },
      { keepScroll: true },
    )
  }
  render()
}

/* ---------- Plan ---------- */

function listSection(list, title, placeholder, items, extraFields = '') {
  return `<div class="section-title"><h2>${title}</h2></div>
    <div class="card">
      <ul class="clean">${
        items
          .map(
            (i) => `<li>
            ${list === 'checklist' || list === 'packing' ? `<input type="checkbox" style="width:22px;height:22px" ${i.done ? 'checked' : ''} data-change="toggle" data-list="${list}" data-id="${i.id}">` : ''}
            <span class="spacer" style="${i.done ? 'text-decoration:line-through;color:var(--faint)' : ''}">${i.time ? `<b>${esc(i.time)}</b> ` : ''}${esc(i.title)}
              <span class="muted small">· ${esc(memberName(i.by))}</span></span>
            <button class="icon-btn" data-action="remove" data-list="${list}" data-id="${i.id}" aria-label="Remove">${icon('close', 18)}</button></li>`,
          )
          .join('') || '<li class="muted">Nothing yet.</li>'
      }</ul>
      <form data-form="add" data-list="${list}" class="row" style="margin-top:12px">
        ${extraFields}<input name="title" placeholder="${placeholder}" maxlength="140" required style="flex:1;min-width:180px">
        <button class="btn small">Add</button>
      </form>
    </div>`
}

export function plan() {
  const trip = state.trip
  const l = trip.locked
  const nDays = l?.start ? daysBetween(l.start, l.end).length : 4
  const dayLabel = (n) => (l?.start ? `Day ${n} · ${fmtDate(daysBetween(l.start, l.end)[n - 1])}` : `Day ${n}`)
  const place = leadingPlace()

  const itinerary = Array.from({ length: nDays }, (_, i) => i + 1)
    .map((n) => {
      const items = trip.itinerary.filter((i) => i.day === n).sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      return `<h3 style="margin:16px 0 4px">${dayLabel(n)}</h3><ul class="clean">${
        items
          .map(
            (i) => `<li><span class="spacer">${i.time ? `<b>${esc(i.time)}</b> ` : ''}${esc(i.title)}</span>
              <button class="icon-btn" data-action="remove" data-list="itinerary" data-id="${i.id}" aria-label="Remove">${icon('close', 18)}</button></li>`,
          )
          .join('') || '<li class="muted small">Nothing planned yet.</li>'
      }</ul>`
    })
    .join('')

  show(
    'plan',
    `${lockedBanner() || mascot("Nothing's locked in yet. You can still start planning while the group votes!")}
    <h1>Trip plan</h1>
    ${place ? `<p class="muted">Ideas for <b>${esc(place.name)}</b>: ${place.activities.slice(0, 3).map((a) => esc(a.name)).join(', ')}. <a href="#explore/${place.id}">See more</a></p>` : ''}
    <div class="section-title"><h2>Itinerary</h2></div>
    <div class="card">${itinerary}
      <form data-form="add" data-list="itinerary" class="row" style="margin-top:16px">
        <select name="day" style="width:auto">${Array.from({ length: nDays }, (_, i) => `<option value="${i + 1}">Day ${i + 1}</option>`).join('')}</select>
        <input name="time" placeholder="Time" maxlength="20" style="width:100px">
        <input name="title" placeholder="What are we doing?" maxlength="140" required style="flex:1;min-width:180px">
        <button class="btn small">Add</button>
      </form>
    </div>
    ${listSection('food', 'Food spots and dishes', 'Add a place to eat or a dish to try', trip.food)}
    ${listSection('checklist', 'To-do', 'e.g. Book the Airbnb', trip.checklist)}
    ${listSection('packing', 'Packing list', 'e.g. Sunscreen', trip.packing)}`,
    {
      add: async (data, form) => {
        await act({ type: 'addItem', list: form.dataset.list, ...data })
        plan()
      },
      remove: async (el) => {
        await act({ type: 'removeItem', list: el.dataset.list, itemId: el.dataset.id })
        plan()
      },
      toggle: async (el) => {
        await act({ type: 'toggleItem', list: el.dataset.list, itemId: el.dataset.id })
        plan()
      },
    },
    { keepScroll: true },
  )
}

/* ---------- Money ---------- */

let moneyPlace = null

export function moneyPage() {
  const trip = state.trip
  const m = me()
  const place = (moneyPlace && dest(moneyPlace)) || leadingPlace() || state.destinations[0]
  const nights = trip.locked?.start ? Math.max(1, daysBetween(trip.locked.start, trip.locked.end).length - 1) : 3
  const est = estimate(place, nights)
  const { balance, payments } = settleUp(trip.members, trip.expenses)
  const spent = trip.expenses.reduce((s, e) => s + e.amount, 0)
  const defaultSplit = going().map((p) => p.id)

  show(
    'money',
    `<h1>Money</h1>
    <div class="section-title"><h2>Budget check</h2></div>
    <div class="card stack">
      <select data-change="place">${state.destinations
        .map((d) => `<option value="${d.id}" ${d.id === place.id ? 'selected' : ''}>${esc(d.name)}</option>`)
        .join('')}</select>
      <table class="cost-table">${est.rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${money(v)}</td></tr>`).join('')}
        <tr class="total"><td>Per person</td><td>${money(est.total)}</td></tr></table>
      <div class="row"><div class="bar ${est.fits ? 'green' : ''}" style="${est.fits ? '' : '--x:1'}"><div style="width:${Math.min(100, (est.total / BUDGET) * 100)}%;${est.fits ? '' : 'background:var(--red)'}"></div></div>
        <span class="chip ${est.fits ? 'green' : 'red'}">${est.fits ? `${money(BUDGET - est.total)} spare` : `${money(est.total - BUDGET)} over`}</span></div>
      <p class="muted small" style="margin:0">Budget is ${money(BUDGET)} each, including getting there. ${esc(state.destNote)}</p>
    </div>

    <div class="section-title"><h2>Add an expense</h2></div>
    <form class="card stack" data-form="expense">
      <div class="row">
        <input name="title" placeholder="What was it? e.g. Airbnb deposit" maxlength="100" required style="flex:2;min-width:180px">
        <input name="amount" type="number" min="0.01" step="0.01" placeholder="GH₵" required style="flex:1;min-width:110px">
      </div>
      <label class="field"><span>Paid by</span><select name="paidBy">${trip.members
        .map((p) => `<option value="${p.id}" ${p.id === m.id ? 'selected' : ''}>${esc(p.name)}</option>`)
        .join('')}</select></label>
      <div><b class="small">Split between</b><div class="row" style="margin-top:6px">${trip.members
        .map(
          (p) => `<label class="chip" style="cursor:pointer;display:inline-flex;gap:6px;align-items:center">
            <input type="checkbox" name="split_${p.id}" ${defaultSplit.includes(p.id) ? 'checked' : ''} style="width:16px;height:16px">${esc(p.name)}</label>`,
        )
        .join('')}</div></div>
      <button class="btn">Add expense</button>
    </form>

    <div class="section-title"><h2>Settle up</h2><span class="chip">${money(spent)} spent</span></div>
    <div class="card"><ul class="clean">${
      payments
        .map((p) => `<li>${avatar(trip.members.find((x) => x.id === p.from) || { id: p.from, name: '?' })}<span class="spacer"><b>${esc(memberName(p.from))}</b> pays <b>${esc(memberName(p.to))}</b></span><b>${money(p.amount)}</b></li>`)
        .join('') || '<li class="muted">All square!</li>'
    }</ul>
      <details style="margin-top:10px"><summary class="muted small" style="cursor:pointer">Everyone's balance</summary>
        <ul class="clean">${trip.members
          .map((p) => `<li><span class="spacer">${esc(p.name)}</span><span class="chip ${balance[p.id] >= 0 ? 'green' : 'red'}">${balance[p.id] >= 0 ? '+' : ''}${money(balance[p.id])}</span></li>`)
          .join('')}</ul></details>
    </div>

    <div class="section-title"><h2>All expenses</h2></div>
    <div class="card"><ul class="clean">${
      [...trip.expenses]
        .reverse()
        .map(
          (e) => `<li><span class="spacer"><b>${esc(e.title)}</b><br><span class="muted small">${esc(memberName(e.paidBy))} paid · split ${e.splitWith.length} ways</span></span>
            <b>${money(e.amount)}</b><button class="icon-btn" data-action="removeExpense" data-id="${e.id}" aria-label="Remove">${icon('close', 18)}</button></li>`,
        )
        .join('') || '<li class="muted">No expenses yet.</li>'
    }</ul></div>`,
    {
      place: (el) => ((moneyPlace = el.value), moneyPage()),
      expense: async (data) => {
        const splitWith = Object.keys(data).filter((k) => k.startsWith('split_')).map((k) => k.slice(6))
        await act({ type: 'addExpense', title: data.title, amount: data.amount, paidBy: data.paidBy, splitWith })
        toast('Expense added')
        moneyPage()
      },
      removeExpense: async (el) => {
        if (!confirm('Remove this expense?')) return
        await act({ type: 'removeExpense', expenseId: el.dataset.id })
        moneyPage()
      },
    },
    { keepScroll: true },
  )
}
export { moneyPage as money }

/* ---------- Crew ---------- */

export function crew() {
  const trip = state.trip
  const m = me()
  const auth = loadAuth(state.tripId)
  const msg = `Join our trip planner for ${trip.name}: ${inviteLink()}`
  const statusLabel = { in: "I'm in", maybe: 'Maybe', out: "I'm out" }
  const statusChip = { in: 'green', maybe: 'gold', out: 'red' }

  show(
    'crew',
    `<h1>The crew</h1>
    <div class="section-title"><h3>Are you coming?</h3></div>
    <div class="row">${Object.entries(statusLabel)
      .map(([k, v]) => `<button class="option${m.status === k ? ' selected' : ''}" style="width:auto;flex:1" data-action="status" data-s="${k}">${v}</button>`)
      .join('')}</div>

    <div class="section-title"><h2>Everyone</h2><span class="chip">${trip.members.length}</span></div>
    <div class="card"><ul class="clean">${trip.members
      .map((p) => {
        const quiz = p.quiz && dest(p.quiz.destination)
        return `<li>${avatar(p)}<span class="spacer"><b>${esc(p.name)}</b>${p.isAdmin ? ' <span class="chip blue">Organiser</span>' : ''}${p.id === m.id ? ' <span class="muted small">(you)</span>' : ''}<br>
          <span class="muted small">${quiz ? `Quiz: ${esc(quiz.name)} · ` : ''}${p.votes.length ? 'Voted' : 'Not voted'} · ${p.availability.length} days free</span></span>
          <span class="chip ${statusChip[p.status]}">${p.status}</span>
          ${state.isAdmin && !p.isAdmin ? `<button class="icon-btn" data-action="manage" data-id="${p.id}" aria-label="Manage">${icon('more')}</button>` : ''}</li>`
      })
      .join('')}</ul></div>

    <div class="section-title"><h2>Invite friends</h2></div>
    <div class="card stack">
      <input readonly value="${esc(inviteLink())}" data-action="select">
      <div class="row">
        <button class="btn blue small" data-action="copy" data-text="${esc(inviteLink())}">Copy link</button>
        <a class="btn small" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Share on WhatsApp</a>
      </div>
    </div>

    ${
      state.isAdmin
        ? `<div class="section-title"><h2>Organiser tools</h2></div>
      <div class="card stack">
        <form data-form="rename" class="row"><input name="name" value="${esc(trip.name)}" maxlength="60" style="flex:1"><button class="btn small">Rename</button></form>
        <div class="row">
          <button class="btn ghost small" data-action="copy" data-text="${esc(inviteLink() + '#admin=' + auth.adminKey)}">Copy organiser link</button>
          ${trip.locked ? '<button class="btn ghost small" data-action="unlock">Unlock place & dates</button>' : ''}
          <button class="btn red small" data-action="rotate">Change invite link</button>
        </div>
        <p class="muted small" style="margin:0">Change the invite link if it was shared outside the group. Everyone will need the new link.</p>
      </div>`
        : ''
    }
    <p style="margin-top:28px"><button class="btn ghost small plain" data-action="signout">Sign out on this device</button></p>`,
    {
      status: async (el) => {
        await act({ type: 'setStatus', status: el.dataset.s })
        crew()
      },
      select: (el) => el.select(),
      copy: async (el) => {
        await navigator.clipboard.writeText(el.dataset.text)
        toast('Copied!')
      },
      rename: async (data) => {
        await adminAct({ type: 'rename', name: data.name })
        toast('Renamed')
        crew()
      },
      unlock: async () => {
        await adminAct({ type: 'unlock' })
        toast('Unlocked')
        crew()
      },
      manage: async (el) => {
        const p = trip.members.find((x) => x.id === el.dataset.id)
        const choice = prompt(`${p.name}: type a new 4-digit PIN to reset theirs, or type REMOVE to remove them from the trip.`)
        if (!choice) return
        if (choice.trim().toUpperCase() === 'REMOVE') {
          await adminAct({ type: 'removeMember', memberId: p.id })
          toast(`${p.name} removed`)
        } else {
          await adminAct({ type: 'resetPin', memberId: p.id, pin: choice.trim() })
          toast(`PIN reset. Tell ${p.name} their new PIN.`)
        }
        crew()
      },
      rotate: async () => {
        if (!confirm('Make a new invite link? The old link will stop working for everyone.')) return
        const res = await api(`trips/${state.tripId}/rotate`, { method: 'POST' })
        const old = loadAuth(state.tripId)
        state.tripId = res.trip.id
        saveAuth(res.trip.id, old)
        history.replaceState(null, '', `/t/${res.trip.id}#crew`)
        toast('New link ready. Share it with the group.')
        crew()
      },
      signout: async () => {
        await act({ type: 'signOut' }).catch(() => {})
        clearAuth(state.tripId, ['token', 'memberId'])
        state.memberId = null
        go('home')
        location.reload()
      },
    },
  )
}
