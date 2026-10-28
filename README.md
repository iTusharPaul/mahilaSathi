# NightWise 🦉

> *"Google Maps gets you home fastest. NightWise gets you home accompanied."*

**NightWise** is a responsive web application that helps women in Indian cities choose **safer** (not just fastest) routes at night, backed by a live community safety layer powered by the **Nexconn Chat SDK**.

Built for the **Nexconn Build Challenge 2026** (Reskilll) — **Social & Community Track**.

---

## 1. Problem Statement

For women in Indian urban centers, nocturnal mobility is frequently constrained not by distance, but by the absence of active street life, lighting, and accompaniment.

* **National Safety Index:** *"In NCW's NARI 2025 index (12,770 women, 31 cities), India's national safety score was 65%, and roughly 4 in 10 women said they feel unsafe."* — **National Commission for Women (NCW)**, *National Annual Report & Index on Women's Safety 2025*.
* **Crime Statistics:** *"NCRB recorded 4,48,211 crimes against women in 2023 (rate 66.2 per lakh female population) — registered cases only; under-reporting is severe."* — **National Crime Records Bureau (NCRB)**, *Crime in India 2023*.
* **Companion Travel:** *"World Bank research in Delhi's suburbs found about two-thirds of women travelled with companions in the past week to mitigate safety concerns, vs 18% of men."* — **World Bank**, *She Drives Change*.
* **Restricted Mobility:** *"In a study of women entrepreneurs in India, 83% reported avoiding travel after dark."* — **Sheth**, *Navigating Business Interactions*.

Conventional mapping platforms optimize strictly for **travel time**, often directing pedestrians and commuters through deserted alleys, unlit bypasses, or shuttered commercial districts. **NightWise** optimizes for **night activity, open eyes-on-the-street, and mutual accompaniment**.

---

## 2. Product Architecture

NightWise unites two complementary layers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NightWise Frontend                            │
│           (React 18 + Vite + TypeScript + MapLibre GL + Tailwind)        │
├────────────────────────────────────┬────────────────────────────────────┤
│     A. Safest-Route Engine         │       B. Nexconn Community Layer    │
│  • Geoapify Routing & Places API   │  • Journey Rooms (GroupChannel)    │
│  • Overpass API (CCTV & Lit roads) │  • Guardian Circle Narration Cards │
│  • Night Activity Score (0–100)    │  • SOS Priority Fan-out            │
│  • Safe Havens Discovery           │  • Walk Together (DirectChannel)   │
│  • Proportional Redistribution     │  • Neighbourhoods (OpenChannel)    │
├────────────────────────────────────┴────────────────────────────────────┤
│                       NightWise Backend (Express)                       │
│    • Node.js + TypeScript + SQLite (better-sqlite3)                     │
│    • Nexconn Server API Service & Security Token Dispatcher             │
│    • Rate Limiting, Privacy Trimming & Moderation Webhook Target        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Layer A: Safest-Route Engine
When origin and destination are entered, the engine evaluates route alternatives and computes a **Night Activity Score (0–100)**:

$$\text{Score} = 100 \times \sum_{i} (w_i \times f_i)$$

| Factor | Weight | Definition |
|---|---|---|
| **Open Places Density** | 0.22 | Verified open-now shops, pharmacies, hospitals, and staffed venues within 60 m of route, per km |
| **Transport Points** | 0.10 | Active transit stops, bus terminals, and metro stations within 100 m, per km |
| **Main-Road Share** | 0.16 | Fraction of route length on primary arterial and secondary roads (avoiding deserted shortcuts) |
| **Longest Dark Gap** | 0.20 | $1 - (\text{longest stretch with no open venue within 60 m} \div \text{route length})$, floored at 0 |
| **Simplicity** | 0.07 | Fewer turns per km scores higher (direct corridors minimize entrapment risk) |
| **Help Points** | 0.10 | Open 24/7 pharmacies, hospitals, and police kiosks within 150 m, per km |
| **Camera Coverage** | 0.05 | Fraction of route length within 75 m of a mapped CCTV camera (from OSM Overpass) |
| **Community Pulse** | 0.10 | Blended score from recent live reports (streetlights out, deserted stretches, active crowds) |

* **Data Confidence Indicator:** Every route prominently displays its data confidence (`high`, `medium`, `low`) alongside the score.
* **Missing Data Rule (R5):** Missing data is treated as **unknown**, never as "unsafe". If a factor has zero coverage along a route, its weight is **proportionally redistributed** across the remaining factors.

### Layer B: Nexconn Community Layer
The community experience is powered entirely by the **Nexconn Chat SDK**:
1. **Journey Rooms:** Ephemeral corridor group channels scoped to 45-minute departure windows (`originSlug→destSlug-bucket45`). When a trip concludes, the room dissolves automatically.
2. **Guardian Circle:** A persistent group channel with trusted guardians. Live trip narration cards (`NW:trip_started`, `NW:checkin`, `NW:im_ok`, `NW:arrived`) post automatically into this channel.
3. **SOS Priority Fan-Out:** A single long-press sends a priority alert simultaneously to the Guardian Circle (with exact GPS coordinates) and the Journey Room (with coarse area-level privacy and nearest Safe Haven).
4. **Neighbourhood Channels:** OpenChannels for public urban clusters (`Indiranagar Late Hours`, `Koramangala Night Owls`, `Whitefield after 9 PM`, `HSR after Dark`) with quick-report safety chips.
5. **Walk Together:** Mutual opt-in 1-to-1 direct chat (`DirectChannel`) enabling two verified travellers on the same corridor to coordinate meeting at a staffed Safe Haven.

---

## 3. Nexconn Features Used

Judges can verify our deep, measurable integration with the **Nexconn Chat SDK** (`@nexconn/engine` and `@nexconn/chat`):

| Nexconn Feature | SDK Class / API | Where & How Used in NightWise |
|---|---|---|
| **Group Channels** | `GroupChannel` | **Journey Rooms** (ephemeral corridor channels) & **Guardian Circles** (private family/friend narration). |
| **Open Channels** | `OpenChannel` | **Neighbourhood Channels** where local residents broadcast live community pulse reports. |
| **Direct Channels** | `DirectChannel` | **Walk Together** 1-to-1 chats, unlocked strictly upon mutual acceptance at an open Safe Haven. |
| **Custom Messages** | `NCEngine.registerCustomMessages` | 8 registered structured message types (`NW:*`) rendered as rich native UI cards in chat streams. |
| **Message Queries** | `BaseChannel.createMessagesQuery` | Chronological history fetching (`loadNextPage()`) with auto-pagination across all channels. |
| **Presence Indicators** | `NCEngine.addConnectionStatusHandler` | Realtime SDK connection badge (`Connected`, `Connecting`, `Disconnected`) on all headers. |
| **Read Receipts & Delivery** | `SendTextMessageParams` / `SendMessageParams` | Per-message delivery receipts and status notifications. |
| **Server API Token Dispatch** | `POST /v4/user/get-token` | Backend issues secure user access tokens via HMAC-SHA1 signature using Server App Secret. |
| **Server API Moderation** | `POST /v4/user/block` & Pre-message webhook | Remote server-side user blocking and automated pre-message text keyword moderation. |

### Registered Custom Messages (`NW:*`)

| Message Type | Persisted | Counted | Payload Data | Usage |
|---|---|---|---|---|
| `NW:trip_started` | Yes | Yes | `tripId`, `originArea`, `destArea`, `etaMinutes`, `score`, `mode` | Narrates journey commencement to Guardian Circle |
| `NW:checkin` | Yes | No | `tripId`, `segmentLabel`, `minutesRemaining`, `escalated` | Regular progress heartbeats; marks overdue status |
| `NW:im_ok` | Yes | No | `tripId` | Quick traveller response clearing escalation alerts |
| `NW:arrived` | Yes | Yes | `tripId`, `durationMinutes`, `score` | Celebrates safe arrival; triggers corridor room dissolution |
| `NW:sos` | Yes | Yes | `tripId`, `coarseArea`, `nearestHavenName`, `preciseCoords?` | Dual fan-out: exact coords to guardians, coarse to corridor |
| `NW:haven_card` | Yes | Yes | `havenId`, `name`, `category`, `distanceM`, `openUntil` | Staffed safe haven card shared as meetup anchor |
| `NW:report` | Yes | No | `reportId`, `category`, `segmentId`, `areaLabel`, `note` | Community pulse incident updates in OpenChannels |
| `NW:live_ping` | No | No | `tripId`, `segmentId` | Ephemeral corridor presence heartbeat |

---

## 4. Safety & Privacy Design (Rules R1–R7)

Safety rules supersede convenience throughout NightWise:

* **R1. Pseudonyms Only:** Users are identified exclusively by generated handles (e.g. `Lotus-42`, `Jasmine-17`). Real names, avatars, and phone numbers are **never** displayed or exposed on any chat or API surface.
* **R2. No Exact Location to Strangers:** Journey Rooms and Neighbourhood Channels see segment/corridor-level presence only. Exact live coordinates are restricted strictly to the user's private Guardian Circle during active trips.
* **R3. Trim the Ends (300 m):** Every route geometry viewed by anyone other than the traveller herself is fuzzed/trimmed by 300 meters at both the origin and destination (`ROUTE_TRIM_METRES = 300`). Home/hostel addresses can never be pinpointed.
* **R4. No Stranger DMs by Default:** 1-to-1 direct messaging is strictly blocked by default. A `DirectChannel` is permitted only (a) between members sharing a Guardian Circle, or (b) following mutual acceptance of a Walk Together invitation.
* **R5. Missing Data = Unknown (Never Unsafe):** Unmapped areas display a transparent coverage note rather than a penalty; weights redistribute proportionally.
* **R6. Honest Numbers Only:** No statistics or camera numbers are fabricated. All metrics derive from live Geoapify/Overpass APIs or cited official sources.
* **R7. Day-One Moderation & Reporting:** Every message and member has native Report and Block actions. Blocking triggers the Nexconn Server API block endpoint immediately.

### Phase 4 Abusability Audit Results

During Phase 4 hardening, NightWise was subjected to deliberate adversarial abusability tests (`tests/phase4_abusability.test.ts`):

| Attack Vector | Security Test | Result | Defense Mechanism |
|---|---|:---:|---|
| **(i) DM a Stranger** | Stranger attempts to open DirectChannel with arbitrary user | **BLOCKED (403)** | Backend verifies common circle or accepted Walk Together agreement. |
| **(ii) Location / Phone Leak** | Stranger queries `/api/circles` or `/api/sos/recent` | **PREVENTED** | Phone numbers excluded from all queries; SOS queries filtered to circle guardians. |
| **(iii) Untrimmed Route Snooping** | Non-owner queries `/api/trips/:id` route geometry | **TRIMMED** | Geometry automatically clipped by 300 m at both ends (`isTrimmed: true`). |
| **(iv) Unauthorized Journey Room Access** | User without active trip attempts to view corridor room | **BLOCKED (403)** | Access denied unless user has active trip registered on corridor. |
| **(v) Spam / Flooding** | Attacker floods OTP requests or abusive chat messages | **RATE-LIMITED / REJECTED** | Sliding-window limit (5 OTPs / 15m; 429) & pre-message moderation filter. |

---

## 5. Clean-Clone Setup & Running

NightWise is packaged as a **single deployable** — the Express backend serves the built React frontend from `client/dist`.

### Prerequisites
* **Node.js** >= 18.0.0
* **npm** >= 9.0.0

### Step 1: Clone and Configure Environment
```bash
git clone https://github.com/your-username/nightwise.git
cd nightwise
cp .env.example .env
```

Edit `.env` with your credentials:
```env
# Nexconn Chat SDK (Reskilll Hackathon)
NEXCONN_APP_KEY=your_nexconn_app_key
NEXCONN_APP_SECRET=your_nexconn_app_secret
VITE_NEXCONN_APP_KEY=your_nexconn_app_key

# Geoapify API (Routing & Places)
GEOAPIFY_API_KEY=your_geoapify_api_key
VITE_GEOAPIFY_API_KEY=your_geoapify_api_key

# App Configuration
JWT_SECRET=nightwise-secure-jwt-key-2026
ADMIN_TOKEN=nightwise-admin-secret-2026
DEMO_MODE=true
PORT=8080
```

> **Note on Sandbox Fallback:** If Nexconn credentials are left blank, NightWise runs automatically in sandbox simulation mode so judges can evaluate all community flows immediately without external network dependencies.

### Step 2: Install Dependencies & Build Single Deployable
```bash
npm install
npm run build
```

`npm run build` compiles `@nightwise/shared`, builds the React Vite application into `client/dist`, and compiles the Express server into `server/dist`.

### Step 3: Launch NightWise
```bash
npm start
```
Open **`http://localhost:8080`** in your browser.

---

## 6. Two-Window Judge Script (§10)

Judges can verify the entire end-to-end community experience in under 3 minutes using two browser windows (or an Incognito window):

### Setup:
1. Open **Window A** (`http://localhost:8080`) — Traveller (**Lotus-42**).
2. Open **Window B** (Incognito window at `http://localhost:8080`) — Guardian (**Jasmine-17**).

### Window A (Traveller: Lotus-42):
1. **Login:** Enter phone `9990001111`. Click **Send OTP**. The demo OTP hint (`123456`) appears on screen. Click **Verify & Login**.
2. **Handle:** Notice your pseudonym handle is `Lotus-42`.
3. **Plan Demo Corridor:** Navigate to **Plan**. Click the quick demo corridor button **"Manyata Tech Park → Whitefield"**. Select **Walk** mode and tap **Plan Safest Route**.
4. **Compare Routes:** Review the **Fastest** vs **Safest** route cards side by side. Inspect the **Night Activity Score (0–100)** breakdown, data confidence badge, safe havens, and longest dark gap.
5. **Start Journey:** On the **Safest** card, tap **Start Accompanied Journey**.

### Window B (Guardian: Jasmine-17):
1. **Login:** Enter phone `9990002222`. Enter OTP `123456`. Click **Verify & Login**.
2. **Chats:** Navigate to **Chats** and select **Guardian Circle**.
3. **Verify:** Notice the **`NW:trip_started`** card arrives in realtime from Lotus-42 showing origin, destination, ETA, and safety score.

### Window A (Live Trip & Community):
6. **Live Dashboard:** Look at the live trip dashboard:
   * Header displays: *"Trimmed for privacy — others see corridor only (-300m ends)"*.
   * Headcount badge shows women travelling this corridor now.
   * Expand the **Journey Room** accordion to see anonymous corridor chat.
7. **Heartbeat Check-in:** Tap **Check In: I'm OK**.
   * Window B instantly receives the check-in heartbeat card.
8. **Safe Haven Walk Together:** In the Journey Room panel, tap **Walk Together**. Select **Jasmine-17** and an open Safe Haven (e.g. *MedPlus 24/7 Pharmacy*). Tap **Send Walk Request**.
   * Window B sees the pending Walk Together invitation banner in Chats. Tap **Accept**. A mutual 1-to-1 direct chat unlocks!
9. **Emergency SOS Test:** Press and hold the red **Hold for SOS (2s)** button.
   * Window B (Guardian Circle) receives a priority red SOS card with **exact coordinates** and nearest Safe Haven.
   * The Journey Room receives coarse corridor-level alert (with NO precise coordinates, strictly honoring Rule R2).
10. **Arrive Safely:** Tap **I've Arrived Safely**.
    * Arrival summary displays duration and safety score.
    * An **`NW:arrived`** card posts to Guardian Circle.
    * The ephemeral Journey Room automatically dissolves once the corridor clears.

---

## 7. Verified at Build Notes & Console Settings

Verified against official Nexconn documentation (`docs.nexconn.ai`) and Console during build:

### Nexconn Console Configurations (§6.6):
1. **Restrict Direct Messaging:** Enabled in *Chat Settings*. Non-friends and non-consensual strangers cannot initiate DMs. Backed by NightWise backend check (`/api/walk-together/check-dm-permission`).
2. **Pre-join History OFF:** Group channels leave pre-join history disabled to protect prior travellers' privacy when new women join a corridor Journey Room.
3. **Pre-Message Moderation Webhook:** Pointed at `POST /api/moderation/pre-message` to automatically screen prohibited/harassing keywords before message delivery.
4. **Console Plan & Capacity:** Verified on Nexconn Free Plan: **300 members per group**, unlimited group channels per App Key, with 7-day offline message retention.

### Documentation vs Reality Findings:
* **Spelling Difference:** `@nexconn/chat` TypeScript definition files declare `isPersisted` (with 's') rather than `isPersited` found in online doc snippets. NightWise registers both properties in `NEXCONN_CUSTOM_MESSAGE_REGISTRATIONS` to guarantee runtime and compiler compatibility.
* **Server API Authentication:** Base URL is `https://api.sg-light-api.com`. Signature header requires `sha1(AppSecret + Nonce + Timestamp)`.
* **Ephemerality Handling:** Nexconn does not provide built-in TTL messages or self-destructing channels. NightWise achieves genuine ephemerality via backend tracking: when active trips on a corridor drop to 0, the backend calls `POST /v4/group-channel/dismiss` and purges room history.

---

## 8. Data Sources & Honesty Rules

* **Geoapify Routing & Places API:** Computes pedestrian and driving route geometries and identifies verified commercial venues (pharmacies, supermarkets, transport nodes). All routing and places queries are cached in SQLite for **6 hours** to conserve API credit limits.
* **OpenStreetMap Overpass API:** Realtime querying of mapped CCTV surveillance cameras (`man_made=surveillance`) and street-lit ways (`lit=yes`) across Bengaluru bounding boxes, cached for 6 hours.
* **Opening Hours Evaluation:** Custom OSM `opening_hours` parser evaluated in `Asia/Kolkata` time, accurately handling 24/7, overnight shifts (e.g. `18:00-02:00`), day-specific schedules, and graceful `"unknown"` fallback.

---

## 9. Test Suite Verification

NightWise includes comprehensive unit, integration, and security test suites (**29 passed tests across 7 test files**):

```bash
npm test
```

```
 ✓ tests/nightwise.test.ts (12 tests) - Score formula, weight redistribution, open-now parsing, route trimming, corridor keys
 ✓ tests/phase0_spike.test.ts (1 test) - Server API token generation, client initialization, group chat
 ✓ tests/phase1_chat_spine.test.ts (1 test) - OTP auth, pseudonym handles, guardian circles, NW:* custom narration cards
 ✓ tests/phase2_routes_score.test.ts (1 test) - Geoapify routing alternatives, Overpass CCTV caching, Night Activity Score
 ✓ tests/phase3_community_layer.test.ts (1 test) - Full two-window judge script, Journey Rooms, SOS dual fan-out, dissolve
 ✓ tests/phase4_abusability.test.ts (10 tests) - Security audits: stranger DM blocking, leak prevention, 300m trimming, rate limits
 ✓ tests/integration_smoke.test.ts (3 tests) - Server boot, 2-user login, demo corridor planning, active trip lifecycle

Test Files  7 passed (7)
Tests       29 passed (29)
```

---

## 10. Known Limitations

* **Single City Focus (v1):** Pre-configured and tested for Bengaluru urban corridors (Manyata Tech Park, Whitefield, Koramangala, Indiranagar, HSR Layout).
* **Emergency Copy Notice:** SOS notifications are routed to guardians and fellow corridor travellers. NightWise does not claim direct integration with police control rooms (strictly labeled: *"Alerts your guardians and women on your route"*).
* **Web Push Notifications:** Realtime in-app alerts and notifications are prioritized in v1; browser background web push depends on active service worker permissions.

---

## 11. Hackathon Disclosure

* **Pre-existing Code:** None. This codebase was engineered from scratch specifically for the **Nexconn Build Challenge 2026** (Reskilll) between October 28, 2026 and November 2026.
* **Third-Party Libraries:** React, Vite, MapLibre GL, Tailwind CSS, `@nexconn/engine`, `@nexconn/chat`, Express, `better-sqlite3`, `jsonwebtoken`, Vitest.

---

*NightWise — Safe streets through visibility, accompaniment, and community.*
