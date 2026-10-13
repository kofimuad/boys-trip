import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tallyVotes, bestWindows, settleUp, estimate, scoreQuiz } from '../public/js/logic.js'

const m = (id, extra) => ({ id, name: id, status: 'in', votes: [], availability: [], ...extra })

test('ranked votes', () => {
  const t = tallyVotes([m('a', { votes: ['x', 'y'] }), m('b', { votes: ['y'] }), m('c', { status: 'out', votes: ['x'] })], [{ id: 'x' }, { id: 'y' }])
  assert.deepEqual(t.map((s) => [s.id, s.points]), [['y', 5], ['x', 3]])
})

test('best date window', () => {
  const days = ['2026-12-10', '2026-12-11', '2026-12-12', '2026-12-13']
  const { windows } = bestWindows([m('a', { availability: days }), m('b', { availability: days.slice(0, 3) })], { length: 3 })
  assert.deepEqual(windows[0], { start: '2026-12-10', end: '2026-12-12', count: 2, names: ['a', 'b'] })
})

test('settle up uses few payments', () => {
  const members = [m('a'), m('b'), m('c')]
  const { payments } = settleUp(members, [{ amount: 300, paidBy: 'a', splitWith: ['a', 'b', 'c'] }])
  assert.deepEqual(payments, [{ from: 'b', to: 'a', amount: 100 }, { from: 'c', to: 'a', amount: 100 }])
})

test('estimate and quiz', () => {
  const e = estimate({ costs: { transport: 100, stayPerNight: 100, foodPerDay: 50, activities: 100 } }, 3)
  assert.equal(e.total, 100 + 300 + 200 + 100)
  const r = scoreQuiz([{ options: [{ points: { a: 1 } }, { points: { b: 3 } }] }], [1])
  assert.equal(r[0].id, 'b')
})

test('month helpers', async () => {
  const { upcomingMonths, monthDays } = await import('../public/js/logic.js')
  assert.deepEqual(upcomingMonths('2026-11-15', 3), ['2026-11', '2026-12', '2027-01'])
  assert.equal(monthDays('2027-02').length, 28)
  assert.equal(monthDays('2028-02').length, 29)
  assert.deepEqual(bestWindows([m('a')], { length: 3 }).windows, [])
})
