# everytrip

A free, phone-friendly web app for planning a trip around Ghana with your friends. It has a clean, minimalist look inspired by Duolingo's onboarding, with Kweku the backpacker guiding you through each step.

**How it works**

1. **Explore:** browse 8 Ghana destinations with rough costs, activities, food, stays, live weather, a map and nearby spots.
2. **Quiz:** answer 8 quick questions and Kweku picks a place for you.
3. **Vote:** everyone ranks their top 3 places (3, 2 and 1 points).
4. **Dates:** everyone taps the days they're free in December and January, and the app finds the best 3-day and 4-day stretches.
5. **Plan:** build a day-by-day itinerary, food list, to-dos and a packing list together.
6. **Money:** check the per-person estimate against the GH₵ 2,000 budget, log expenses and see who owes whom.

## Access and security

- Each trip lives at a long random link (`/t/<id>`) that's shared in the group chat. Anyone with the link can see the trip.
- People join with their name and a 4-digit PIN. Their device then remembers them, and the PIN stops anyone voting as someone else. After 8 wrong PINs, sign-in is locked for 15 minutes.
- The organiser gets a private organiser link (`#admin=<key>`) to lock in the place and dates, reset PINs, remove people and change the invite link.
- No emails, passwords or payment details are stored. PINs are hashed with scrypt.

## Free services used

| What | Service | Key needed |
|---|---|---|
| Hosting and API | Netlify (static site and Functions) | No |
| Storage | Netlify Blobs | No |
| Place summaries and photos | Wikipedia REST API | No |
| Maps | OpenStreetMap tiles with Leaflet | No |
| Nearby food, bars and stays | Overpass API (OpenStreetMap) | No |
| Weather | Open-Meteo | No |
| Font | Nunito (Google Fonts) | No |

Destination costs in `public/data/destinations.json` are rough per-person estimates written by hand. Edit that file to update them.

## Run it locally

```bash
npm install
npm run dev     # http://localhost:8888, stores trips in .local-blobs/
npm test
```

## Deploy to Netlify

1. In Netlify, choose **Add new site → Import an existing project** and pick this repo.
2. Leave the build command empty. The publish directory (`public`) and functions folder come from `netlify.toml`.
3. Deploy. Netlify Blobs works automatically, with no setup.

## Project layout

```
public/              static front end (no build step)
  js/app.js          boot, routing, app shell
  js/flows.js        landing, create/join and quiz flows
  js/pages.js        home, explore, vote, dates, plan, money, crew
  js/logic.js        vote tally, date overlap, budget, settle-up maths
  data/              destinations and quiz questions
netlify/functions/   api.mjs, the whole backend
lib/store.mjs        Netlify Blobs, or local JSON files in dev
test/                node:test tests for the API and maths
```
