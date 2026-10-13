// Pure trip maths, shared by the pages and the tests.

export const BUDGET = 2000

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(start, end) {
  const out = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

const going = (m) => m.status !== 'out'

// Ranked voting: 1st choice = 3 points, 2nd = 2, 3rd = 1.
export function tallyVotes(members, destinations) {
  const scores = Object.fromEntries(destinations.map((d) => [d.id, { id: d.id, points: 0, firsts: 0, voters: [] }]))
  for (const m of members.filter(going)) {
    m.votes.forEach((destId, rank) => {
      const s = scores[destId]
      if (!s) return
      s.points += 3 - rank
      if (rank === 0) s.firsts += 1
      s.voters.push(m.name)
    })
  }
  return Object.values(scores).sort((a, b) => b.points - a.points || b.firsts - a.firsts)
}

export const today = () => new Date().toISOString().slice(0, 10)

// 'YYYY-MM' keys for this month and the n-1 after it.
export function upcomingMonths(from = today(), n = 18) {
  let [y, m] = from.split('-').map(Number)
  const out = []
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) (m = 1), y++
  }
  return out
}

export function monthDays(ym) {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return daysBetween(`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`)
}

export function dayCounts(members) {
  const counts = {}
  for (const m of members.filter(going)) for (const d of m.availability) counts[d] = (counts[d] || 0) + 1
  return counts
}

// Best stretches of `length` days where the most people are free every day.
export function bestWindows(members, { start, end, length = 4, limit = 3 } = {}) {
  const people = members.filter(going)
  const all = people.flatMap((m) => m.availability).sort()
  start ||= all[0]
  end ||= all[all.length - 1]
  if (!start) return { windows: [], total: people.length }
  const sets = people.map((m) => ({ name: m.name, days: new Set(m.availability) }))
  const windows = []
  for (const first of daysBetween(start, addDays(end, -(length - 1)))) {
    const days = daysBetween(first, addDays(first, length - 1))
    const free = sets.filter((p) => days.every((d) => p.days.has(d))).map((p) => p.name)
    if (free.length) windows.push({ start: first, end: days[days.length - 1], count: free.length, names: free })
  }
  windows.sort((a, b) => b.count - a.count || a.start.localeCompare(b.start))
  // Skip windows that overlap a better one already picked.
  const picked = []
  for (const w of windows) {
    if (picked.some((p) => !(w.end < p.start || w.start > p.end))) continue
    picked.push(w)
    if (picked.length === limit) break
  }
  return { windows: picked, total: people.length }
}

export function estimate(dest, nights = 3) {
  const c = dest.costs
  const rows = [
    ['Getting there and back', c.transport],
    [`Stay (${nights} nights, shared)`, c.stayPerNight * nights],
    [`Food (${nights + 1} days)`, c.foodPerDay * (nights + 1)],
    ['Activities', c.activities],
  ]
  const total = rows.reduce((sum, [, v]) => sum + v, 0)
  return { rows, total, fits: total <= BUDGET }
}

// Who owes whom, using as few payments as possible.
export function settleUp(members, expenses) {
  const balance = Object.fromEntries(members.map((m) => [m.id, 0]))
  for (const e of expenses) {
    const share = e.amount / e.splitWith.length
    if (e.paidBy in balance) balance[e.paidBy] += e.amount
    for (const id of e.splitWith) if (id in balance) balance[id] -= share
  }
  const round = (n) => Math.round(n * 100) / 100
  const creditors = Object.entries(balance).filter(([, v]) => v > 0.009).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v)
  const debtors = Object.entries(balance).filter(([, v]) => v < -0.009).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v)
  const payments = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v)
    payments.push({ from: debtors[i].id, to: creditors[j].id, amount: round(pay) })
    debtors[i].v -= pay
    creditors[j].v -= pay
    if (debtors[i].v < 0.01) i++
    if (creditors[j].v < 0.01) j++
  }
  return { balance: Object.fromEntries(Object.entries(balance).map(([k, v]) => [k, round(v)])), payments }
}

export function scoreQuiz(questions, answers) {
  const scores = {}
  answers.forEach((optionIndex, q) => {
    const option = questions[q]?.options[optionIndex]
    if (!option) return
    for (const [dest, pts] of Object.entries(option.points)) scores[dest] = (scores[dest] || 0) + pts
  })
  return Object.entries(scores).sort((a, b) => b[1] - a[1]).map(([id, points]) => ({ id, points }))
}
