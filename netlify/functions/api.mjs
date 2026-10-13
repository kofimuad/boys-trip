// One function serves the whole API under /api/*.
//
// Access model: the trip id in the link is long and random, so only people who
// were sent the link can open the trip. Each member picks a name and a 4-digit
// PIN; their device gets a token so they stay signed in. The trip creator also
// gets an admin key for locking decisions and managing the group.
import { randomBytes, scryptSync, createHash, timingSafeEqual } from 'node:crypto'
import { openStore } from '../../lib/store.mjs'

export const config = { path: '/api/*' }

const MAX_MEMBERS = 20
const MAX_LIST = 200
const PIN_TRIES = 8
const PIN_LOCK_MS = 15 * 60 * 1000
const STATUSES = ['in', 'maybe', 'out']
const LISTS = ['itinerary', 'food', 'checklist', 'packing']

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const id = (bytes = 9) => randomBytes(bytes).toString('base64url')
const sha = (s) => createHash('sha256').update(s).digest('hex')
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

function hashPin(pin, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(pin, salt, 32).toString('hex') }
}

function pinMatches(pin, stored) {
  const { hash } = hashPin(pin, stored.salt)
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(stored.hash, 'hex'))
}

function safeEqualHex(a, b) {
  if (!a || !b || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

function text(value, max = 120) {
  if (typeof value !== 'string') throw new HttpError(400, 'Expected text')
  const t = value.trim().replace(/\s+/g, ' ')
  if (!t) throw new HttpError(400, 'Text cannot be empty')
  return t.slice(0, max)
}

function pin(value) {
  if (typeof value !== 'string' || !/^\d{4}$/.test(value)) throw new HttpError(400, 'PIN must be 4 digits')
  return value
}

function amount(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) throw new HttpError(400, 'Enter a valid amount')
  return Math.round(n * 100) / 100
}

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, 'Bad date')
  return value
}

function newMember(name, pinValue) {
  const token = id(24)
  const member = {
    id: id(6),
    name,
    pin: hashPin(pinValue),
    tokens: [sha(token)],
    status: 'in',
    quiz: null,
    votes: [],
    availability: [],
    failedPins: 0,
    lockedUntil: 0,
    joinedAt: Date.now(),
  }
  return { member, token }
}

// What every member is allowed to see: no PIN hashes, tokens or admin key.
function publicTrip(trip) {
  return {
    id: trip.id,
    name: trip.name,
    createdAt: trip.createdAt,
    locked: trip.locked,
    members: trip.members.map((m) => ({
      id: m.id,
      name: m.name,
      status: m.status,
      quiz: m.quiz,
      votes: m.votes,
      availability: m.availability,
      isAdmin: m.id === trip.ownerId,
    })),
    itinerary: trip.itinerary,
    food: trip.food,
    checklist: trip.checklist,
    packing: trip.packing,
    expenses: trip.expenses,
  }
}

function findMemberByToken(trip, token) {
  if (!token) return null
  const h = sha(token)
  return trip.members.find((m) => m.tokens.includes(h)) || null
}

function isAdmin(trip, key) {
  return !!key && safeEqualHex(sha(key), trip.adminKeyHash)
}

async function loadTrip(store, tripId) {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(tripId)) throw new HttpError(404, 'Trip not found')
  const found = await store.get('trip:' + tripId)
  if (!found || found.data.movedTo) throw new HttpError(404, 'Trip not found')
  return found
}

// Read, change and write back, retrying if someone else saved in between.
async function updateTrip(store, tripId, change) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, etag } = await loadTrip(store, tripId)
    const result = change(data)
    data.updatedAt = Date.now()
    if (await store.set('trip:' + tripId, data, { etag })) return { trip: data, result }
  }
  throw new HttpError(409, 'Too many people saving at once, try again')
}

function applyMemberAction(trip, me, body) {
  switch (body.type) {
    case 'setStatus':
      if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Bad status')
      me.status = body.status
      return
    case 'saveQuiz':
      me.quiz = { destination: text(body.destination, 40), at: Date.now() }
      return
    case 'setVotes': {
      if (!Array.isArray(body.votes) || body.votes.length > 3) throw new HttpError(400, 'Pick up to 3 places')
      const votes = body.votes.map((v) => text(v, 40))
      if (new Set(votes).size !== votes.length) throw new HttpError(400, 'Each place only once')
      me.votes = votes
      return
    }
    case 'setAvailability': {
      if (!Array.isArray(body.dates) || body.dates.length > 400) throw new HttpError(400, 'Bad dates')
      me.availability = [...new Set(body.dates.map(isoDate))].sort()
      return
    }
    case 'addItem': {
      if (!LISTS.includes(body.list)) throw new HttpError(400, 'Bad list')
      const list = trip[body.list]
      if (list.length >= MAX_LIST) throw new HttpError(400, 'List is full')
      const item = { id: id(6), title: text(body.title, 140), by: me.id, done: false, at: Date.now() }
      if (body.note) item.note = text(body.note, 300)
      if (body.list === 'itinerary') {
        const day = Number(body.day)
        if (!Number.isInteger(day) || day < 1 || day > 7) throw new HttpError(400, 'Bad day')
        item.day = day
        if (body.time) item.time = text(body.time, 20)
      }
      list.push(item)
      return
    }
    case 'toggleItem':
    case 'removeItem': {
      if (!LISTS.includes(body.list)) throw new HttpError(400, 'Bad list')
      const list = trip[body.list]
      const index = list.findIndex((i) => i.id === body.itemId)
      if (index < 0) throw new HttpError(404, 'Item not found')
      if (body.type === 'toggleItem') list[index].done = !list[index].done
      else list.splice(index, 1)
      return
    }
    case 'addExpense': {
      if (trip.expenses.length >= MAX_LIST) throw new HttpError(400, 'Too many expenses')
      const memberIds = new Set(trip.members.map((m) => m.id))
      const paidBy = body.paidBy || me.id
      if (!memberIds.has(paidBy)) throw new HttpError(400, 'Unknown payer')
      if (!Array.isArray(body.splitWith) || !body.splitWith.length) throw new HttpError(400, 'Split with at least one person')
      const splitWith = [...new Set(body.splitWith)]
      if (!splitWith.every((m) => memberIds.has(m))) throw new HttpError(400, 'Unknown person in split')
      trip.expenses.push({
        id: id(6),
        title: text(body.title, 100),
        amount: amount(body.amount),
        paidBy,
        splitWith,
        by: me.id,
        at: Date.now(),
      })
      return
    }
    case 'removeExpense': {
      const index = trip.expenses.findIndex((e) => e.id === body.expenseId)
      if (index < 0) throw new HttpError(404, 'Expense not found')
      trip.expenses.splice(index, 1)
      return
    }
    case 'signOut': {
      me.tokens = me.tokens.filter((t) => t !== sha(body.token || ''))
      return
    }
    default:
      throw new HttpError(400, 'Unknown action')
  }
}

function applyAdminAction(trip, body) {
  switch (body.type) {
    case 'lock':
      trip.locked = {
        destination: body.destination ? text(body.destination, 40) : trip.locked?.destination || null,
        start: body.start ? isoDate(body.start) : trip.locked?.start || null,
        end: body.end ? isoDate(body.end) : trip.locked?.end || null,
      }
      return
    case 'unlock':
      trip.locked = null
      return
    case 'removeMember': {
      if (body.memberId === trip.ownerId) throw new HttpError(400, 'The organiser cannot be removed')
      const before = trip.members.length
      trip.members = trip.members.filter((m) => m.id !== body.memberId)
      if (trip.members.length === before) throw new HttpError(404, 'Member not found')
      return
    }
    case 'resetPin': {
      const m = trip.members.find((x) => x.id === body.memberId)
      if (!m) throw new HttpError(404, 'Member not found')
      m.pin = hashPin(pin(body.pin))
      m.tokens = []
      m.failedPins = 0
      m.lockedUntil = 0
      return
    }
    case 'rename':
      trip.name = text(body.name, 60)
      return
    default:
      throw new HttpError(400, 'Unknown admin action')
  }
}

async function route(req) {
  const url = new URL(req.url)
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  const store = await openStore()
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const token = req.headers.get('x-member-token')
  const adminKey = req.headers.get('x-admin-key')

  // POST /api/trips: create a trip and its first member (the organiser)
  if (parts.length === 1 && parts[0] === 'trips' && req.method === 'POST') {
    const tripName = text(body.tripName || 'Boys Trip', 60)
    const { member, token: memberToken } = newMember(text(body.name, 30), pin(body.pin))
    const key = id(24)
    const trip = {
      id: id(16),
      name: tripName,
      ownerId: member.id,
      adminKeyHash: sha(key),
      createdAt: Date.now(),
      locked: null,
      members: [member],
      itinerary: [],
      food: [],
      checklist: [],
      packing: [],
      expenses: [],
    }
    if (!(await store.set('trip:' + trip.id, trip, { isNew: true }))) throw new HttpError(500, 'Try again')
    return json({ trip: publicTrip(trip), memberId: member.id, token: memberToken, adminKey: key }, 201)
  }

  if (parts[0] !== 'trips' || !parts[1]) throw new HttpError(404, 'Not found')
  const tripId = parts[1]
  const action = parts[2]

  // GET /api/trips/:id: anyone with the link sees the trip (names, votes, plan)
  if (!action && req.method === 'GET') {
    const { data } = await loadTrip(store, tripId)
    const me = findMemberByToken(data, token)
    return json({ trip: publicTrip(data), memberId: me?.id || null, isAdmin: isAdmin(data, adminKey) })
  }

  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')

  if (action === 'join') {
    const name = text(body.name, 30)
    const pinValue = pin(body.pin)
    const { trip, result } = await updateTrip(store, tripId, (trip) => {
      if (trip.members.length >= MAX_MEMBERS) throw new HttpError(400, 'This trip is full')
      if (trip.members.some((m) => m.name.toLowerCase() === name.toLowerCase()))
        throw new HttpError(409, 'Someone already joined with that name. Use "I\'ve joined before" instead.')
      const created = newMember(name, pinValue)
      trip.members.push(created.member)
      return created
    })
    return json({ trip: publicTrip(trip), memberId: result.member.id, token: result.token })
  }

  if (action === 'login') {
    const pinValue = pin(body.pin)
    const { trip, result } = await updateTrip(store, tripId, (trip) => {
      const m = trip.members.find((x) => x.id === body.memberId)
      if (!m) throw new HttpError(404, 'Member not found')
      if (m.lockedUntil > Date.now()) return { error: 'Too many wrong PINs. Try again in 15 minutes or ask the organiser to reset it.' }
      if (!pinMatches(pinValue, m.pin)) {
        m.failedPins += 1
        if (m.failedPins >= PIN_TRIES) {
          m.failedPins = 0
          m.lockedUntil = Date.now() + PIN_LOCK_MS
        }
        return { error: 'Wrong PIN' }
      }
      const newToken = id(24)
      m.failedPins = 0
      m.tokens = [...m.tokens.slice(-9), sha(newToken)]
      return { memberId: m.id, token: newToken }
    })
    if (result.error) throw new HttpError(401, result.error)
    return json({ trip: publicTrip(trip), ...result })
  }

  if (action === 'action') {
    const { trip } = await updateTrip(store, tripId, (trip) => {
      const me = findMemberByToken(trip, token)
      if (!me) throw new HttpError(401, 'Please sign in again')
      applyMemberAction(trip, me, { ...body, token })
    })
    return json({ trip: publicTrip(trip) })
  }

  if (action === 'admin') {
    const { trip } = await updateTrip(store, tripId, (trip) => {
      if (!isAdmin(trip, adminKey)) throw new HttpError(403, 'Organiser only')
      applyAdminAction(trip, body)
    })
    return json({ trip: publicTrip(trip) })
  }

  // Move the trip to a new secret link, e.g. if the old one was shared too widely.
  if (action === 'rotate') {
    const { data, etag } = await loadTrip(store, tripId)
    if (!isAdmin(data, adminKey)) throw new HttpError(403, 'Organiser only')
    const fresh = { ...data, id: id(16), updatedAt: Date.now() }
    if (!(await store.set('trip:' + fresh.id, fresh, { isNew: true }))) throw new HttpError(500, 'Try again')
    await store.set('trip:' + tripId, { movedTo: true }, { etag })
    return json({ trip: publicTrip(fresh) })
  }

  throw new HttpError(404, 'Not found')
}

export default async function handler(req) {
  try {
    return await route(req)
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status)
    console.error(err)
    return json({ error: 'Something went wrong' }, 500)
  }
}
