# RunningGround release MVP plan

## Why we are changing direction
The current app has enough surface area to validate the product concept, but it is still mostly a UX prototype backed by mock data.

From this point on, the goal is **not to add more screens first**.
The goal is to **ship the first real version**.

That means:
- narrow scope
- remove non-essential work from v1
- connect real data flows
- make one core competition loop work end to end

---

## Product direction for v1 release

### Core promise
A runner can:
1. create an account
2. set their profile and home district
3. connect a running data source
4. see their own activity
5. add friends by public tag
6. compete on a friend leaderboard

This is the smallest version that still feels like a real product.

---

## v1 in scope

### 1. Account and identity
- onboarding
- signup
- login
- profile edit
- logout

### 2. User setup
- region selection
- public tag exposure
- basic notification preferences

### 3. Activity ingestion
- support **one primary integration path** only for first release
- recommended first path:
  - iOS: Apple Health
  - fallback/manual support: Manual input or manual record sync state
- integration management screen with:
  - connected status
  - last synced time
  - sync action state

### 4. Personal running view
- home summary
- my activity list
- run detail screen

### 5. Friend competition
- add friend by tag
- friend request flow
- friend ranking
- friend activity detail

### 6. Home dashboard
- summary of this week
- friend competition summary
- my activity shortcut
- integration shortcut

### 7. Release MVP tab structure
Visible bottom tabs for v1:
- 리그
- 친구
- 홈
- 마켓
- 마이

The release build should keep league and market in the main navigation because they are part of the product promise, even if some sub-features inside them are still thinner than post-launch versions.

---

## Explicitly out of scope for v1
These are good product ideas, but they increase complexity and slow down release.

### Move to v1.1 or later
- district personal ranking as a polished live feature
- district vs district battle as a live feature
- national/province/city drilldown competition
- multiple integration providers at launch
- map-based regional visualization
- advanced points explanations
- market tab with real commerce
- deep notification system

### Temporary handling in v1
- keep regional competition visible in the tab bar, but reduce scope to the flows that are already stable
- keep market visible in the tab bar, but launch with a small curated reward set instead of expanding commerce scope
- avoid adding more feature branches until the real backend loop works

---

## Recommended release structure

### v1
- auth
- profile
- region setup
- Apple Health or one primary source
- manual backup flow if needed
- my activity
- friend add by tag
- friend leaderboard
- home dashboard

### v1.1
- district personal ranking
- improved friend detail interactions
- richer run detail

### v1.2
- district battle
- region drilldown competition
- Garmin / Strava / Health Connect expansion

---

## Real-data transition plan
The biggest gap right now is that most screens are driven by `src/data/mock.ts`.

To ship, we need to replace mock-driven UX with real app state.

### Step 1. Define the minimum real entities
Need real backend entities and API contracts for:
- user
- profile
- district
- friend relationship
- friend request
- run record
- connected source
- leaderboard entry

### Step 2. Define minimum APIs
Minimum backend/API surface for release:
- auth/signup
- auth/login
- me/profile GET
- me/profile PATCH
- me/region PATCH
- me/runs GET
- me/integrations GET
- me/integrations sync action
- friends search/add by tag
- friends requests GET
- friends requests accept
- friends leaderboard GET
- friends/{id}/activity GET
- home summary GET

### Step 3. Introduce app data layer
Current route files render mock data directly.
Before release, introduce:
- API client layer
- feature-level hooks or service functions
- loading / empty / error states
- replacement strategy where screens consume typed server data instead of static arrays

### Step 4. Lock one primary sync path
Do not build all providers at once.
Pick one:
- Apple Health first if targeting iPhone-first release
- Health Connect first if targeting Android-first release

Current recommendation: **Apple Health first**.

---

## What should change in the codebase now

### Stop prioritizing
- new exploratory screens
- broader regional simulation
- more mock-only UX branches

### Start prioritizing
- release scope clarity
- backend contract definition
- mock-to-real replacement strategy
- navigation cleanup for v1
- hidden/beta treatment for non-v1 features

---

## Immediate execution order

### Priority 1
Create a release-oriented app shell:
- keep only the tabs and screens needed for v1
- mark non-v1 screens as deferred or beta

### Priority 2
Document and implement the real frontend data boundary:
- create typed API interfaces
- create one place for fetching home, profile, friends, runs, integrations

### Priority 3
Connect one live vertical slice end to end:
- login
- profile
- home summary
- my activity

### Priority 4
Connect friend system vertical slice:
- add by tag
- request states
- ranking
- friend detail

### Priority 5
Connect integration state vertical slice:
- source status
- sync metadata
- sync trigger action

---

## Release question to keep asking
For every next task, ask:

> Does this help us ship v1 faster?

If not, it probably belongs after launch.
