// Full-screen step-by-step flows: landing, create a trip, join a trip, the quiz.
import { state, esc, mascot, view, api, act, saveAuth, rememberTrip, knownTrips, toast, dest, avatar } from './lib.js'
import { scoreQuiz } from './logic.js'
import { go } from './app.js'

function flow({ progress, back, body, foot }) {
  return `<div class="flow">
    <div class="flow-top">
      ${back ? `<button class="icon-btn" data-action="${back}" aria-label="Back">←</button>` : ''}
      ${progress != null ? `<div class="progress"><div style="width:${Math.round(progress * 100)}%"></div></div>` : ''}
    </div>
    <div class="flow-body">${body}</div>
    ${foot ? `<div class="flow-foot"><div>${foot}</div></div>` : ''}
  </div>`
}

const continueBtn = (enabled = true, label = 'Continue', action = 'next') =>
  `<button class="btn" data-action="${action}" ${enabled ? '' : 'disabled'}>${label}</button>`

/* ---------- Landing ---------- */

export function landing() {
  const trips = knownTrips()
  view(`<div class="landing">
    <header><a class="logo" href="/"><img src="/img/kweku.svg" alt="">boys trip</a></header>
    <div class="hero">
      <img class="hero-art" src="/img/kweku.svg" alt="Kweku the parrot">
      <div class="hero-text">
        <h1>The free, fun way to plan a trip around Ghana with your friends!</h1>
        <div class="stack">
          <button class="btn block" data-action="create">Plan a new trip</button>
          ${trips
            .map((t) => `<a class="btn ghost block" href="/t/${esc(t.id)}">Open ${esc(t.name)}</a>`)
            .join('')}
        </div>
        <p class="muted small" style="margin-top:20px">Got an invite link from a friend? Just open it.</p>
      </div>
    </div>
    <footer>Pick a place · Vote on dates · Plan it · Split the bill</footer>
  </div>`, { create: () => createFlow() })
}

/* ---------- Create a trip ---------- */

function createFlow() {
  const data = { tripName: 'Boys Trip', name: '', pin: '' }
  let step = 0
  const steps = [
    () => ({
      say: "Akwaaba! I'm Kweku. Let's set up your trip. What should we call it?",
      field: `<input name="v" maxlength="60" value="${esc(data.tripName)}" placeholder="Boys Trip 2026" autofocus>`,
      save: (v) => (data.tripName = v),
    }),
    () => ({
      say: "Nice! And what's your name? Your friends will see this.",
      field: `<input name="v" maxlength="30" value="${esc(data.name)}" placeholder="Your name" autofocus>`,
      save: (v) => (data.name = v),
    }),
    () => ({
      say: 'Pick a 4-digit PIN. You only need it if you sign in on another phone.',
      field: `<input name="v" class="pin-input" inputmode="numeric" maxlength="4" pattern="\\d{4}" placeholder="••••" autocomplete="off" autofocus>`,
      save: (v) => (data.pin = v),
      check: (v) => /^\d{4}$/.test(v) || 'PIN must be 4 digits',
    }),
  ]

  function render() {
    const s = steps[step]()
    view(
      flow({
        progress: (step + 1) / (steps.length + 1),
        back: 'back',
        body: `${mascot(s.say)}<form data-form="next">${s.field}</form>`,
        foot: continueBtn(true, step === steps.length - 1 ? 'Create trip' : 'Continue'),
      }),
      {
        back: () => (step ? (step--, render()) : landing()),
        next: async () => {
          const v = document.querySelector('.flow-body input').value.trim()
          if (!v) return toast('Fill this in first', true)
          const ok = s.check ? s.check(v) : true
          if (ok !== true) return toast(ok, true)
          s.save(v)
          if (step < steps.length - 1) return step++, render()
          const res = await api('trips', { method: 'POST', body: data })
          state.tripId = res.trip.id
          state.memberId = res.memberId
          state.isAdmin = true
          saveAuth(res.trip.id, { token: res.token, memberId: res.memberId, adminKey: res.adminKey })
          rememberTrip(res.trip)
          history.replaceState(null, '', `/t/${res.trip.id}`)
          shareScreen(res.adminKey)
        },
      },
    )
  }
  render()
}

export function shareScreen(adminKey) {
  const link = `${location.origin}/t/${state.tripId}`
  const adminLink = `${link}#admin=${adminKey}`
  const msg = `Join our trip planner for ${state.trip.name}! 🇬🇭 ${link}`
  view(
    flow({
      progress: 1,
      body: `${mascot('Your trip is ready! Share this link in the group chat so the boys can join.')}
        <div class="card stack">
          <h3>Invite link</h3>
          <input readonly value="${esc(link)}" data-action="select">
          <div class="row">
            <button class="btn blue small" data-action="copy" data-text="${esc(link)}">Copy link</button>
            <a class="btn small" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Share on WhatsApp</a>
          </div>
          <p class="muted small">Anyone with this link can see and join the trip, so only share it with the group.</p>
        </div>
        <div class="card stack" style="margin-top:16px">
          <h3>Your organiser link 🔑</h3>
          <p class="muted small">Keep this one to yourself. It lets you lock in the place and dates and manage the group from any device.</p>
          <input readonly value="${esc(adminLink)}" data-action="select">
          <button class="btn ghost small" data-action="copy" data-text="${esc(adminLink)}">Copy organiser link</button>
        </div>`,
      foot: continueBtn(true, "Let's go", 'done'),
    }),
    {
      select: (el) => el.select(),
      copy: async (el) => {
        await navigator.clipboard.writeText(el.dataset.text)
        toast('Copied!')
      },
      done: () => go('home'),
    },
  )
}

/* ---------- Join a trip ---------- */

export function joinFlow() {
  const trip = state.trip
  const data = { name: '', pin: '', memberId: null }
  let mode = null
  let step = 0

  function start() {
    view(
      flow({
        body: `${mascot(`Akwaaba! You've been invited to <b>${esc(trip.name)}</b>.`, true)}
          <p class="center muted">${trip.members.length} ${trip.members.length === 1 ? 'person has' : 'people have'} joined so far</p>
          <div class="stack" style="max-width:380px;margin:24px auto 0">
            <button class="btn block" data-action="new">I'm new here</button>
            <button class="btn ghost block" data-action="returning">I've joined before</button>
          </div>`,
      }),
      {
        new: () => ((mode = 'new'), (step = 0), render()),
        returning: () => ((mode = 'returning'), (step = 0), render()),
      },
    )
  }

  function render() {
    const handlers = { back: () => (step ? (step--, render()) : start()) }
    let body
    let enabled = true
    if (mode === 'new' && step === 0) {
      body = `${mascot("What's your name? Use the one the boys know you by.")}
        <form data-form="next"><input name="v" maxlength="30" value="${esc(data.name)}" placeholder="Your name" autofocus></form>`
    } else if (mode === 'returning' && step === 0) {
      body = `${mascot('Welcome back! Which one are you?')}
        <div class="options">${trip.members
          .map(
            (m) => `<button class="option${data.memberId === m.id ? ' selected' : ''}" data-action="pick" data-id="${esc(m.id)}">
              ${avatar(m)}<span>${esc(m.name)}</span></button>`,
          )
          .join('')}</div>`
      enabled = !!data.memberId
      handlers.pick = (el) => ((data.memberId = el.dataset.id), render())
    } else {
      body = `${mascot(mode === 'new' ? 'Now pick a 4-digit PIN so nobody can vote as you.' : 'Enter your 4-digit PIN.')}
        <form data-form="next"><input name="v" class="pin-input" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off" autofocus></form>`
    }
    handlers.next = async () => {
      const input = document.querySelector('.flow-body input')
      if (step === 0) {
        if (mode === 'new') {
          if (!input.value.trim()) return toast('Type your name first', true)
          data.name = input.value.trim()
        } else if (!data.memberId) return
        step = 1
        return render()
      }
      if (!/^\d{4}$/.test(input.value)) return toast('PIN must be 4 digits', true)
      const res =
        mode === 'new'
          ? await api(`trips/${trip.id}/join`, { method: 'POST', body: { name: data.name, pin: input.value } })
          : await api(`trips/${trip.id}/login`, { method: 'POST', body: { memberId: data.memberId, pin: input.value } })
      saveAuth(trip.id, { token: res.token, memberId: res.memberId })
      state.memberId = res.memberId
      rememberTrip(state.trip)
      toast(mode === 'new' ? "You're in! 🎉" : 'Welcome back!')
      go('home')
    }
    view(flow({ progress: (step + 1) / 3, back: 'back', body, foot: continueBtn(enabled) }), handlers)
  }

  start()
}

/* ---------- Pick-a-place quiz ---------- */

export function quizFlow() {
  const { questions, intro } = state.quiz
  const answers = []
  let step = -1

  function render() {
    if (step < 0) {
      return view(
        flow({
          back: 'exit',
          body: mascot(esc(intro), true),
          foot: continueBtn(true, 'Start quiz'),
        }),
        { exit: () => go('home'), next: () => (step++, render()) },
      )
    }
    if (step >= questions.length) return result()
    const q = questions[step]
    view(
      flow({
        progress: step / questions.length,
        back: 'back',
        body: `${mascot(esc(q.say))}
          <div class="options">${q.options
            .map(
              (o, i) => `<button class="option${answers[step] === i ? ' selected' : ''}" data-action="pick" data-i="${i}">
                <span class="icon">${o.icon}</span><span>${esc(o.label)}</span></button>`,
            )
            .join('')}</div>`,
        foot: continueBtn(answers[step] != null, step === questions.length - 1 ? 'See my place' : 'Continue'),
      }),
      {
        back: () => (step--, render()),
        pick: (el) => ((answers[step] = Number(el.dataset.i)), render()),
        next: () => answers[step] != null && (step++, render()),
      },
    )
  }

  async function result() {
    const ranked = scoreQuiz(questions, answers)
    const top = dest(ranked[0].id)
    const runnerUp = ranked[1] && dest(ranked[1].id)
    await act({ type: 'saveQuiz', destination: top.id })
    view(
      flow({
        progress: 1,
        body: `${mascot(`I've got it! You should go to <b>${esc(top.name)}</b>!`, true)}
          <div class="card stack" style="margin-top:20px">
            <div class="result-art">${top.emoji}</div>
            <h2 class="center">${esc(top.name)}</h2>
            <p class="center muted">${esc(top.tagline)}</p>
            ${runnerUp ? `<p class="center small muted">Close second: ${esc(runnerUp.name)} ${runnerUp.emoji}</p>` : ''}
          </div>`,
        foot: `<button class="btn ghost" data-action="details">See details</button>
               <button class="btn" data-action="vote">Make it my #1 vote</button>`,
      }),
      {
        details: () => go('explore/' + top.id),
        vote: async () => {
          const mine = state.trip.members.find((m) => m.id === state.memberId)
          const votes = [top.id, ...mine.votes.filter((v) => v !== top.id)].slice(0, 3)
          await act({ type: 'setVotes', votes })
          toast('Vote saved!')
          go('vote')
        },
      },
    )
  }

  render()
}
