# Live Monitoring Dashboard

A real-time monitoring dashboard built with **React 19 + TypeScript + Vite**. Events stream in
continuously, from a built-in simulated socket or a real WebSocket. The UI stays smooth, correct and safe
under high-frequency updates, malformed/hostile data and a flapping connection.

![stack](https://img.shields.io/badge/React-19-blue) ![ts](https://img.shields.io/badge/TypeScript-strict-blue) ![tests](https://img.shields.io/badge/tests-80%20passing-green)

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

That's all. With no configuration the app connects to the **built-in simulated stream**. No
backend is needed.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Type-check (app + tests) and build for production into `dist/` |
| `npm run preview` | Serve the production build **with a strict Content-Security-Policy** |
| `npm test` | Run the Vitest suite (80 tests: unit, integration, render budget) |
| `PERF_REPORT=1 npm test` | Same, and print the render-budget measurements |
| `npm run lint` | ESLint, including security rules (see below) |
| `npm run typecheck` | `tsc -b --noEmit` |

Requirements: Node 20+ (developed on Node 26).

### Configuration (all optional)

Copy `.env.example` to `.env.local`:

| Variable | Default | Notes |
|---|---|---|
| `VITE_STREAM_URL` | *(empty → simulator)* | WebSocket endpoint. Must be `wss://` in production. `ws://` is accepted only in dev. URLs with embedded credentials are rejected. |
| `VITE_BUFFER_SIZE` | `5000` | Max events held in memory (clamped 100–50,000). Also adjustable at runtime in the UI. |
| `VITE_FLUSH_INTERVAL_MS` | `250` | How often buffered updates are committed to React (clamped 50–2,000). Also adjustable at runtime. |

> `VITE_*` values are compiled into the public bundle. **Never put secrets there.** See
> [Security](#security) for how auth tokens are handled.

### Using a real WebSocket

Set `VITE_STREAM_URL=wss://your-host/stream`. The server sends one JSON text frame per event:

```json
{ "id": "evt-123", "ts": 1758628800000, "source": "payments", "severity": "error",
  "status": "degraded", "latencyMs": 231.4, "message": "Upstream timeout" }
```

`ts` may be epoch-ms or ISO-8601. `severity` ∈ `info|warning|error|critical`; `status` ∈ `ok|degraded|down`.
Anything else is rejected and counted in **Rejected frames**.

---

## Using the dashboard

- **Connection pill** (top right): *Connecting · Live · Paused · Reconnecting (with countdown and attempt) ·
  Disconnected*, plus a **Retry now** button when relevant.
- **Simulator bar** (only with the simulated feed): change the message rate from 5/s to **10,000/s**, **Drop
  connection** to watch backoff and reconnect, **Stall feed** to leave the socket open but silent (the
  stale-connection watchdog detects it and reconnects).
- **Controls**: Pause/Resume, time window (30s / 1m / 5m / 15m / All buffered), severity filter chips,
  text search, **buffer size** and **UI update interval**.
- **KPIs**: throughput (events/s), events in view, avg and p95 latency, error rate, service health
  (latest status per service), rejected frames and buffer fill.
- **Latency chart**: avg (solid) and max (dashed) latency per time bucket, with hover readout.
- **Recent events**: virtualized, newest first. If you scroll down to read, rows stay put and a
  "↑ N new events" button appears.

---

## Project structure

The structure follows the one suggested in the brief, with a few justified additions:

```
src/
├── components/            # Pure, typed, memoised presentation (props in → JSX out)
│   ├── KpiCards.tsx
│   ├── LiveChart.tsx        # uPlot canvas, updated imperatively
│   ├── EventsList.tsx       # virtualised, XSS-safe rendering
│   ├── ConnectionBar.tsx
│   ├── Loading.tsx
│   ├── Controls.tsx  SimulatorPanel.tsx  Panel.tsx  EmptyState.tsx  StatusBadge.tsx  ErrorFallback.tsx
├── containers/            # (addition) connect store slices → components; no markup of their own
│   ├── Dashboard.tsx  LivePanels.tsx  LiveConnectionBar.tsx  LiveControls.tsx  LiveSimulator.tsx
├── hooks/
│   ├── useLiveStream.ts     # wires client + store to React; useLiveSelector()
│   ├── LiveStreamProvider.tsx  useEventFilters.ts  useNow.ts
├── services/
│   ├── streamClient.ts      # connection state machine, backoff, validation, flood guard
│   ├── liveStore.ts         # (addition) bounded buffer + batching external store
│   ├── streamSource.ts  authToken.ts
│   └── transports/          # WebSocket adapter + simulated socket
├── types/                 # event.ts, stream.ts
├── utils/                 # validate.ts, helpers.ts, ringBuffer.ts, backoff.ts, logger.ts
├── test/                  # fake socket, render helpers, render-budget (perf) test
├── config.ts  App.tsx  main.tsx  styles.css
```

**Why `containers/` and `liveStore.ts`?** The brief asks to keep data logic out of presentation *and*
to isolate fast-changing widgets. Splitting "which slice of live data does this need?" (containers)
from "how does it look?" (components) meets both. Every component can be rendered and tested with plain
props.

---

## Architecture

```
 WebSocket / Simulator           services/ (no React)                          React
┌───────────────────┐  raw   ┌───────────────────────────┐ LiveEvent ┌───────────────────────┐  snapshot
│ Transport         │ ─────► │ StreamClient              │ ────────► │ LiveStore             │ ─────────┐
│ connect/send/close│ frames │ • state machine           │  (valid   │ • RingBuffer (bounded)│ ≤1 per   │
└───────────────────┘        │ • backoff + jitter        │   only)   │ • dedupe by id        │ flush    │
                             │ • stale watchdog          │           │ • counters, rate      │ interval │
                             │ • flood limiter           │ status ─► │ • pause = freeze view │          ▼
                             │ • parseFrame → validate   │           └───────────────────────┘  useSyncExternalStore
                             └───────────────────────────┘                        (per-slice selectors)
                                                                                           │
             ┌────────────────────────┬────────────────────────────┬───────────────────────┘
             ▼                        ▼                            ▼
   LiveConnectionBar          LiveControls                 LivePanels
   (connection slice)         (paused/capacity slice)      (events + stats slice)
   re-renders on status       re-renders on user input     re-renders ≤ 4×/s (250 ms flush)
                                                            └─ useMemo: filter → KPIs, chart series, list
```

- **`StreamClient`** is framework-agnostic and owns the whole connection lifecycle:
  `connecting → live → (drop) → reconnecting ⟲ … → error`. `paused` is a user state layered on top,
  so a drop while paused is still shown.
- **`LiveStore`** is an external store. The hot path (`ingest`) is O(1) and never touches React. A timer
  publishes an immutable snapshot at most once per flush interval.
- **`useLiveSelector(selector)`** is built on `useSyncExternalStore`. Each widget subscribes to just the
  slice it needs, and snapshot sub-objects keep their identity when unchanged, so a status change doesn't
  re-render the chart and a data flush doesn't re-render the header or controls.
- **Derived state, never duplicated**: filtered events, KPIs and chart series are `useMemo` derivations
  of one snapshot plus the filter state. KPIs, chart and list therefore always agree, live or paused.

### Phases (as built; see `git log`)

1. **Scaffold & foundation**: Vite/TS strict config, ESLint security rules, types, validation, ring
   buffer, backoff, logger, config.
2. **Real-time service layer**: transports (WebSocket + simulator), `StreamClient`, `LiveStore`.
3. **React wiring**: `useLiveStream`, provider, per-slice selectors.
4. **Dashboard UI**: KPI cards, chart, virtualized list, connection bar, controls, loading, empty and
   error states, responsive styling (light/dark).
5. **Tests**: unit, integration (fake socket) and render-budget tests.
6. **Hardening & docs**: CSP check on the production build, this README.

---

## Performance

| Technique | Where | Why |
|---|---|---|
| **Batching / throttled commits** | `LiveStore.flush` | Messages go into a buffer. React sees ≤ 1 snapshot per flush interval (default 250 ms), whatever the message rate. |
| **Per-slice subscriptions** | `useLiveSelector` | Only widgets whose slice changed re-render. Header, controls and connection bar do **0** renders during data flow. |
| **Memoisation** | `React.memo` on every presentational component, `useMemo` derivations, stable `useCallback` handlers | Unchanged KPI cards and rows skip rendering. Stable props keep memo effective. |
| **Bounded memory** | `RingBuffer` (O(1) push, fixed allocation), id-set kept in sync with evictions | A flood cannot grow memory. The capacity is user-configurable. |
| **Virtualised list** | `@tanstack/react-virtual` | 25,000 buffered events → ~20 DOM rows. |
| **Canvas chart, imperative updates** | uPlot + `setData` | No DOM nodes per point and no React reconciliation of the plot. |
| **Rate-independent chart cost** | `bucketSeries` + `pickBucketMs` | Points are time buckets (≤ 300), so 10k msgs/s draws as cheaply as 10 msgs/s. |
| **Binary search for time windows** | `lowerBoundByTs` | The buffer is time-ordered, so the window cut-off is O(log n). |
| **Deferred filtering** | `useDeferredValue(filters)` | Typing in search stays responsive while re-filtering runs at low priority. |
| **Isolated timers** | `RetryCountdown` + `useNow` | The 250 ms countdown tick re-renders one `<span>`, not the bar. |

### Measured (render-budget test, `PERF_REPORT=1 npm test`)

Streams messages through the **real** client → store → React path and counts React commits per widget
with `<Profiler>`:

| Scenario | Data-panel commits | Connection bar | Controls |
|---|---|---|---|
| 500 msgs over 1 s, 250 ms flush | 4 | 0 | 0 |
| 5,000 msgs over 1 s, 250 ms flush | 4 | 0 | 0 |
| 20,000 msgs over 1 s, 250 ms flush | 4 | 0 | 0 |
| 5,000 msgs over 1 s, 100 ms flush | 10 | 0 | 0 |

**Before/after**: the naive approach (`setState` per message, as a socket delivers each message as its own
task) versus this design, for 2,000 messages:

| | React commits | Wall time (jsdom) |
|---|---|---|
| Naive `setState` per message | **2,000** | ~800 ms |
| Batched store (250 ms flush) | **4** | ~9 ms |

Commits scale with the **flush interval**, not the **message rate**. That is the core performance
property, and a test enforces it (`src/test/perf.test.tsx`).

**In the browser**: with the simulator at 2,000 msgs/s the dashboard holds ~2k events/s of throughput,
the buffer stays capped (e.g. 5,000/5,000) and the UI stays interactive. To profile it yourself: React
DevTools Profiler → record while switching the simulator to 10,000/s. Only `LivePanels` commits, at
the flush cadence.

---

## Security

| Concern | Mitigation |
|---|---|
| **Untrusted stream data** | Every frame is `unknown` until `parseFrame` accepts it: size check **before** `JSON.parse` (4 KB cap), `try/catch` parse, then an **allow-list** schema (`toLiveEvent`) with types, enums, ranges, id/source patterns and timestamp sanity checks. Unknown keys (including `__proto__`) are dropped. Rejections are counted, never rendered. |
| **XSS** | Stream text is only rendered as React text children (auto-escaped). `dangerouslySetInnerHTML` is **banned by ESLint** (`no-restricted-syntax`), as are `eval`/`new Function`. Control and bidi-override characters are stripped (Trojan-Source style spoofing). The simulator deliberately sends payloads such as `<img onerror>`, `<script>` and `javascript:`, and a test asserts they stay inert. |
| **No secrets in the client** | Nothing secret is bundled. An auth token, if needed, lives **in memory only** (`services/authToken.ts`). It's sent as the **first frame after the socket opens**, never in the URL (URLs leak into logs and history), and never logged. |
| **Transport safety** | `wss://` required in production. `ws://` is allowed only in dev. URLs with embedded credentials are refused. |
| **Resilience against abuse** | Bounded ring buffer. Per-second flood limiter drops excess frames **before parsing**. Duplicate/replayed ids rejected. Exponential backoff **with jitter** and a **minimum delay** (no tight reconnect loop). The backoff counter resets only after the connection has been **stable for 5 s** (anti-flapping). Gives up after N attempts into a visible *Disconnected* state with manual retry. Late callbacks from superseded sockets are ignored (generation counter). |
| **No leaky errors or logs** | Users only see fixed, generic messages. Error boundaries show a generic fallback, never `error.message`. Logging goes through `utils/logger.ts` (enforced by ESLint `no-console`), which accepts only event names plus numeric/enum context and is silent in production. |
| **Browser hardening** | `npm run preview` serves a strict **CSP** (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, …), `nosniff` and `no-referrer`. Production source maps are disabled. The production build was checked in Chrome with no CSP violations. |

---

## Edge cases & robustness

| Case | Behaviour |
|---|---|
| Dropped connection | *Reconnecting* with countdown and attempt number. Backoff 0.5 s → 15 s with jitter. Retry-now button. |
| Silent/stalled socket | Watchdog: no frames for 8 s while live → treated as dead → reconnect. |
| Repeated failure | After 8 attempts: *Disconnected* with a clear message and **Retry connection**. No silent freeze and no infinite loop. |
| Browser offline/online | `offline` → treated as a drop. `online` → immediate retry. |
| Empty feed | Skeletons plus "Connecting…" / "Waiting for the first events…". Filters with no matches show an empty state with guidance. |
| Malformed messages | Rejected and counted (**Rejected frames** KPI). The app never throws. |
| Paused | The view (events, KPIs, chart, time window clock) is frozen and consistent. Data keeps buffering (bounded). The pill shows how many events arrived. Resume catches up instantly. |
| Burst / backpressure | Ring buffer + flood limiter + batched commits. If the buffer holds less history than the selected window, the chart subtitle says so and suggests raising the buffer. |
| Background tab | Timers are throttled, but the simulator emits by wall-clock time (like a real socket) with bounded catch-up. |
| Render crash in one widget | Per-panel error boundaries: the rest of the dashboard keeps working. |

---

## Library choices

| Library | Why |
|---|---|
| **uPlot** | ~45 KB canvas time-series chart designed for streaming. Updates via `setData` without React reconciliation. SVG libraries (e.g. Recharts) re-render a DOM node per point on every update. |
| **@tanstack/react-virtual** | Headless, tiny, well-maintained virtualization. Full control over markup and a11y. |
| **react-error-boundary** | Error boundaries without writing class components (the brief requires function components only). |
| **Vitest + Testing Library** | Native to Vite. Fast, with jsdom integration tests. |

Validation is hand-written rather than using zod: the schema is tiny, the hot path runs per message,
and it avoids a runtime dependency.

---

## Testing

```bash
npm test
```

- `utils/*.test.ts`: validation (including prototype-pollution and XSS payloads), ring buffer bounds,
  backoff math, filters, KPIs, bucketing.
- `services/streamClient.test.ts`: state machine, backoff timing, give-up and manual retry, stale
  watchdog, anti-flapping, superseded sockets, in-band auth token, flood limiter, non-leaky errors
  (fake timers and a fake socket).
- `services/liveStore.test.ts`: batching, boundedness, slice identity, pause/resume, dedupe, resize, rate.
- `components/*.test.tsx`: XSS-safe rendering, virtualization, connection states.
- `containers/Dashboard.test.tsx`: end-to-end over a fake socket (loading → live, malformed frames,
  pause/resume, filters, reconnect → error → retry).
- `test/perf.test.tsx`: render budget and before/after comparison (see Performance).

---

## Trade-offs & next steps

- The simulator runs on the main thread for simplicity. Moving it (or a real socket plus parsing) into a
  **Web Worker** would take JSON parsing off the main thread at very high rates.
- The store is hand-rolled (≈200 lines) rather than Zustand/Redux, to keep the batching and pause
  semantics explicit and testable. Zustand with `subscribeWithSelector` would be a reasonable swap.
- The theme follows the OS (`prefers-color-scheme`). The CSS also supports a `data-theme` override if a
  toggle is wanted.
