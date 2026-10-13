import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LOCAL_BLOBS_DIR = mkdtempSync(join(tmpdir(), 'boystrip-'))
const { default: api } = await import('../netlify/functions/api.mjs')

async function call(path, { method = 'GET', body, token, admin } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers['x-member-token'] = token
  if (admin) headers['x-admin-key'] = admin
  const res = await api(new Request('http://x/api/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined }))
  return { status: res.status, data: await res.json() }
}

test('create, join, vote, login and admin flow', async () => {
  const created = await call('trips', { method: 'POST', body: { tripName: 'Test', name: 'Kofi', pin: '1234' } })
  assert.equal(created.status, 201)
  const { trip, token: kofi, adminKey } = created.data
  assert.ok(trip.id.length >= 16)
  assert.equal(JSON.stringify(created.data.trip).includes('pin'), false, 'no PIN data leaks')

  const joined = await call(`trips/${trip.id}/join`, { method: 'POST', body: { name: 'Ama', pin: '5555' } })
  assert.equal(joined.status, 200)
  const dupe = await call(`trips/${trip.id}/join`, { method: 'POST', body: { name: 'ama', pin: '5555' } })
  assert.equal(dupe.status, 409)

  const noAuth = await call(`trips/${trip.id}/action`, { method: 'POST', body: { type: 'setVotes', votes: ['accra'] } })
  assert.equal(noAuth.status, 401)
  const voted = await call(`trips/${trip.id}/action`, { method: 'POST', token: joined.data.token, body: { type: 'setVotes', votes: ['accra', 'ada'] } })
  assert.deepEqual(voted.data.trip.members[1].votes, ['accra', 'ada'])

  const wrong = await call(`trips/${trip.id}/login`, { method: 'POST', body: { memberId: joined.data.memberId, pin: '0000' } })
  assert.equal(wrong.status, 401)
  const right = await call(`trips/${trip.id}/login`, { method: 'POST', body: { memberId: joined.data.memberId, pin: '5555' } })
  assert.equal(right.status, 200)

  const notAdmin = await call(`trips/${trip.id}/admin`, { method: 'POST', token: kofi, admin: 'nope', body: { type: 'unlock' } })
  assert.equal(notAdmin.status, 403)
  const locked = await call(`trips/${trip.id}/admin`, { method: 'POST', admin: adminKey, body: { type: 'lock', destination: 'accra' } })
  assert.equal(locked.data.trip.locked.destination, 'accra')

  const exp = await call(`trips/${trip.id}/action`, {
    method: 'POST',
    token: kofi,
    body: { type: 'addExpense', title: 'Airbnb', amount: '600', splitWith: [created.data.memberId, joined.data.memberId] },
  })
  assert.equal(exp.data.trip.expenses[0].amount, 600)

  const rotated = await call(`trips/${trip.id}/rotate`, { method: 'POST', admin: adminKey })
  assert.notEqual(rotated.data.trip.id, trip.id)
  assert.equal((await call(`trips/${trip.id}`)).status, 404)
  const moved = await call(`trips/${rotated.data.trip.id}`, { token: kofi })
  assert.equal(moved.data.memberId, created.data.memberId)
})

test('PIN lockout after repeated wrong guesses', async () => {
  const { data } = await call('trips', { method: 'POST', body: { name: 'Yaw', pin: '1111' } })
  for (let i = 0; i < 8; i++) await call(`trips/${data.trip.id}/login`, { method: 'POST', body: { memberId: data.memberId, pin: '9999' } })
  const res = await call(`trips/${data.trip.id}/login`, { method: 'POST', body: { memberId: data.memberId, pin: '1111' } })
  assert.equal(res.status, 401)
  assert.match(res.data.error, /15 minutes/)
})
