# Time Builder

Spin a wheel of public-use airports you can reach from your home field inside a
chosen block of flight time. Built for hour building: pick a departure airport,
say how long you want to be in the air each way, and the wheel draws a destination.

## Running it

```sh
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # production build into .output/
pnpm start        # run the built node server
pnpm typecheck
pnpm test         # vitest, no watch
```

## Data

`src/data/*.generated.ts` each hold one pipe-delimited string, parsed once on the
server at first use.

| Table | Rows | Contents |
| --- | --- | --- |
| `airports` | 4,718 | Every US public-use airport |
| `runways` | 6,424 | Both ends, dimensions, surface, true heading |
| `frequencies` | 7,155 | CTAF, tower, ground, clearance, UNICOM, ATIS, AWOS, ASOS |
| `state-rings` / `state-labels` | 103 / 52 | State outlines for the map |
| `airspace` | 2,826 | Class B, C and D surface areas plus MOAs and restricted, prohibited, warning and alert areas |

- Public-use status, position, elevation and instrument-approach flags come from
  the FAA Aeronautical Information Services airport layer, the authoritative
  source for the public/private distinction.
- Runways and frequencies come from OurAirports. 95% of the airports have runway
  data and 72% have at least one frequency; pages degrade to "unknown" for the rest.
- State outlines come from a pre-simplified public GeoJSON, delta-encoded to
  hundredths of a degree, which is about half a nautical mile.
- Airspace comes from the FAA Class Airspace and Special Use Airspace layers.
  Their 4.7 million raw vertices are reduced to 53,000 by Douglas-Peucker with a
  tolerance that scales with the size of each area, so a four-mile Class D circle
  stays round while a restricted area spanning a degree does not cost a thousand
  points.

Regenerate with `pnpm data:build` after an FAA 56-day cycle. The airspace layers
meter by returned vertex rather than by request, so that part is paced and takes
several minutes; raw pulls are kept in `.cache/` and reused on a re-run.

## How the pieces fit

### Routes

| Route | SSR mode | Why |
| --- | --- | --- |
| `_planner` | inherited | Pathless layout owning the validated search params and the one loader both child views read |
| `_planner/` (the wheel) | `true` | A shared spin link has to render correctly before hydration |
| | | The wheel and the candidate list are two ways to set the same `?pick=`, and the pointer parks on whichever is chosen |
| `_planner/map` | `'data-only'` | Loader runs on the server, but the component measures the DOM and paints a canvas |
| `airport/$id` | `true` + streaming | Field data flushes immediately, the METAR streams in behind it |
| `logbook` | `false` | Every byte comes from `localStorage`, so there is nothing to render on the server |

### Remembered setup

The URL stays the source of truth for any one spin. Alongside it,
`src/lib/preferences.ts` keeps the pilot's own setup in `localStorage`: departure
field, time band, cruise speed, runway minimum and the two filters. A departure
airport and a cruise speed describe the aeroplane and the home field rather than
the trip, so they should not have to be re-entered every visit.

A visit that names no departure airport picks the saved setup up; a shared spin
always names one, which is what keeps someone else's link intact. The setup is
saved only once a control has actually been touched and only when the identifier
resolved to a real airport, so opening a link does not replace your home field
and a half-typed code is never handed back to you. The `?pick=` is never saved.
Stored values are re-validated through the same ArkType schema the address bar
uses, so a blob left by an older version cannot put the app into a state the URL
could not.

### Search params

`src/lib/search.ts` defines the schema with ArkType, wired to the layout route
through `validateSearch`. Every knob lives in the URL, so a spin is shareable and
the loader is a pure function of the address bar. Numbers arriving out of range
are clamped by morphs rather than rejected, because these come from hand-edited
URLs as often as from the form.

### One definition of "in range"

`matchingLegs` in `airport-db.server.ts` is the only place that decides whether an
airport is reachable inside the time band. Everything else is derived from it:
`findLegs` thins the result to at most 400 candidates for the wheel and the list,
`inRangeIds` gives the map the full set of identifiers, and `findLeg` resolves a
`?pick=` against the whole match set rather than the thinned one. That last part
matters because the map can pick any in-range field, including one the cap
dropped. When the cap bites, the header and the list heading both say how many of
how many are shown.

### Server boundaries

```
src/server/airport-db.server.ts   airports, runways and frequencies
src/server/airspace.server.ts     airspace geometry, filtered to the view
src/server/geography.server.ts    state outlines
src/server/weather.server.ts      live METAR lookups
src/server/tfr.server.ts          live TFR lookups
src/server/cache.server.ts        the TTL cache both live sources use
src/server/airports.functions.ts  createServerFn wrappers, safe to import anywhere
```

The `.server.ts` suffix is enforced by Start's import protection, configured in
`vite.config.ts` to `behavior: 'error'` so a leak fails the dev server too, not
just the production build. Components only ever import
`airports.functions.ts`; the build replaces those handler bodies with RPC stubs,
which is why the 310 kB airport table never reaches a client bundle.

### Outbound calls and caching

Two upstream services, both cached through `createTtlCache` in
`src/server/cache.server.ts`, which also collapses concurrent misses for the same
key into a single request so a burst of traffic cannot fan out upstream.

| Source | Cached | Empty or failed |
| --- | --- | --- |
| NOAA METAR, per station | 5 min | 90 s |
| FAA TFR index | 10 min | 60 s |
| FAA TFR shape, per NOTAM | 60 min | 5 min |

TFR shapes are only pulled for the states the plot covers, and run four at a
time. Everything else, the airports, runways, frequencies, airspace and state
outlines, is generated at build time and served from memory, so a page view makes
no outbound call at all once the weather is warm.

### Streaming

`airport/$id` awaits the field record but returns the METAR promise unawaited.
Start flushes the shell immediately and streams the observation into the
`<Await>` boundary when the upstream request settles, typically 300 ms later.

The runway diagram uses this deliberately: its `Await` fallback is the same
component with no observation, so the runway layout and dimensions paint with the
shell, and the streamed wind only adds the windsock and the favoured runway.

Note that TanStack Router buffers the whole document instead of streaming when
the request looks like a bot, so `curl` sees one chunk unless you pass a browser
`User-Agent`.

## Deployment

The runtime is selected in `vite.config.ts` and nowhere else:

```ts
const preset = process.env.NITRO_PRESET
```

Left undefined, Nitro reads the host it is building on. Vercel, Netlify and
Cloudflare each identify themselves through the environment, and a plain checkout
falls back to `node-server`, which is what `pnpm start` runs. Presets swap the
server output without touching routes, loaders or server functions, so
`NITRO_PRESET=cloudflare_module pnpm build` and
`NITRO_PRESET=netlify pnpm build` force a target from a local machine.

### Vercel

Import the repository and take the defaults: framework preset "Other", build
command `pnpm build`, install command `pnpm install`, output directory left
alone. Nitro writes Build Output API v3 into `.vercel/output`, which Vercel picks
up on its own, so there is no `vercel.json` and no environment variable to set.
The app calls NOAA and the FAA, both open, so there are no secrets either.

Two things are worth knowing about a serverless target:

- The TTL cache in `cache.server.ts` lives in instance memory. Every instance
  keeps its own and a cold start begins empty, so the METAR and TFR hit rate is
  lower than on a long-lived node server. Nothing is incorrect, the upstreams are
  just asked more often.
- Function invocations run under a ceiling that starts at ten seconds. The TFR
  timeout is set well inside it, so a slow FAA feed is reported to the pilot as
  unreachable rather than taking the whole request down with it.

`engines.node` is a floor rather than a pin: it drives which Node the build
container runs, and Nitro stamps the matching runtime into the function config.

## Airspace and TFRs on the map

Airspace uses the sectional convention: blue for Class B and D and for
restricted, prohibited and warning areas, magenta for Class C, MOAs and alert
areas, lightened for a dark ground. Blue against magenta is a hard pair to tell
apart, so hue is never the only signal. Every kind has its own dash pattern and
weight, areas carry text labels, the legend repeats the pattern, and clicking an
area names it and gives its vertical limits. Each legend entry toggles that kind
off and on.

The plot pans by dragging and zooms with the buttons or the scroll wheel;
airspace is fetched out to 1.8 times the outer ring so zooming out does not run
into a void, and geometry is clipped in screen space so panning never clips the
side you are heading toward. A press that travels more than four pixels counts as
a drag rather than a click. Labels all share one reservation list, and airports claim their space first,
because they are what the map is for. A Class D is centred on its airport, so its
"D 26/SFC" annotation used to print straight over the field it belongs to; it now
falls back to the top of the shape, the way a sectional prints it, and is dropped
altogether when there is nowhere left or when the label budget below is spent. In
dense areas at low zoom that means few airspace annotations survive, which is the
intended trade: the line styles and the legend still identify each kind, clicking
names it outright, and zooming in gives the annotations room.

Every public-use field in view is plotted, not only the ones the time band
selects. Candidates are bright and everything else is dim. Dots have a dark ring
so an airport stays legible where it sits on an airspace boundary. Clicking a
field the band excludes names it, gives its distance and time, and offers to
stretch the band far enough to include it.

Identifiers are rationed by a budget, `src/lib/map-labels.ts`. Collision
avoidance alone only stops two labels overlapping, and a wide band can hold
several hundred fields that all fit somewhere, which buries the chart under its
own text. The budget scales with canvas area, so a phone is not handed a
desktop's worth of labels, and with the log of the zoom, so moving in is what
reveals more, the way unfolding a sectional does. It is spent on whatever is
picked or hovered first, then the fields in range, then the rest; the origin and
the active field are exempt and are never dropped.

Drawing only candidates was wrong: a Class D circle exists because there is a
towered airport at its centre, so leaving that airport out because it was a
five-minute hop rather than an hour made the chart look broken.

TFRs work differently on purpose. The **list under the map is authoritative** and
comes straight from the FAA index; the drawn shapes are a convenience. Straight
segments, circles and arcs are all parsed, which covers the whole current feed,
but anything unparseable is still listed, marked "not drawn", and counted in the
heading, so the map can never look more complete than it is. If the feed cannot
be reached at all, the panel says so rather than showing nothing.

The FAA index is keyed by state, so the candidate set is narrowed to the states
the plot covers. Nationwide restrictions carry `USA` or an empty state field
rather than a code, so anything that is not a two-letter code is always kept and
flagged as nationwide; narrowing on the state set alone would drop every
nationwide security notice. A restriction with several boundaries gets each one's
own floor and ceiling, since the published limits often differ between them, and
the popup reports the limits of the part you clicked.

Deciding whether a shape reaches the plot is `ringWithinRange` in
`src/lib/ring.ts`. Testing vertices alone was wrong twice over: a long edge can
cross the plot with both endpoints outside it, and a large area can enclose the
departure airport while every vertex sits beyond the radius. Both containment and
edge distance are checked.

## Tests

`pnpm test` runs vitest. Nothing reaches the network: the two modules that make
outbound calls are driven against a stubbed `fetch`. Node is the default
environment, and the files that need a browser opt in with a
`@vitest-environment jsdom` docblock, so a pure module is never tested against a
DOM it will not run in.

Pure modules:

- `src/lib/geo` great-circle distance and bearing against published figures, and
  that the bounding box never rejects a point inside the radius it stands for.
- `src/lib/wind` crosswind and headwind components, which side the crosswind is
  on, and the cases where no runway can be favoured.
- `src/lib/ring` arc and circle points against their declared radius, point in
  polygon, and the two range failures described above.
- `src/lib/search` the ArkType schema: defaults, string parsing from a URL, and
  clamping instead of rejection.
- `src/lib/sample` that a seed gives the server and the client the same wheel,
  and that a draw never repeats an airport or sticks to the near end of the band.
- `src/lib/airport` and `src/lib/airspace` the formatters, plus the rule that no
  two airspace kinds share both a stroke and a dash pattern, since hue alone
  cannot be the signal.
- `src/lib/map-labels` the label budget: that it grows with zoom, spends less on
  a phone, and never returns a fraction or a NaN.

Data and server:

- `src/data` every generated row against its declared field count, so a data
  refresh that smuggled a `|` into a name would fail rather than shift every
  field after it.
- `src/server/airport-db` the in-range invariant: the capped candidate list, the
  identifier set and a `?pick=` lookup all agree with the full match set.
- `src/server/geography` and `src/server/airspace` that the delta-encoded rings
  decode back onto the United States, and that the cheap bounding-box filter
  never drops an area that genuinely reaches the radius.
- `src/server/cache` time-to-live expiry, eviction, and that concurrent misses
  for one key collapse into a single upstream call.
- `src/server/weather` the AWC field mapping against a stubbed feed, including a
  variable wind, millibars to inches, and every way a report can be absent.
- `src/server/tfr` the XNOTAM parser end to end against a stubbed FAA feed:
  circle, polygon and arc boundaries, per-part altitude limits, the nested
  reference blocks that would otherwise be read as vertices, the state filter,
  and the count of restrictions that could not be drawn.

Browser (`jsdom`):

- `src/lib/storage`, `src/lib/preferences` and `src/lib/logbook` the localStorage
  layer: round trips, a corrupt or stale blob, and storage that refuses to answer.
- `src/components/NumberField` when a value is allowed to leave the field, and
  what it has been rounded to when it does.
- `src/components/DualRangeSlider` that the ends may meet but never cross, that a
  drag fires one navigation rather than one per pixel, and that a range whose
  ends have met can still be pulled apart.

## Caveats

Distances are great-circle and times are distance over true airspeed. There is no
wind aloft, no climb or descent profile, no airspace or terrain check.

Runway selection compares the METAR wind against surveyed true runway headings,
which is the correct pairing since coded METAR winds are true north referenced.
Where a survey heading is missing, roughly one runway in six, the heading falls
back to the painted runway number, which is magnetic; the diagram says so when
that applies. Runway numbers are always shown as painted.

State outlines cover the 50 states and DC. Puerto Rico and the other territories
have airports in the dataset but no outline on the map.

Airspace is lateral limits only, from the published cycle. It is not a substitute
for a current sectional, and it says nothing about whether a MOA or restricted
area is hot. TFRs come from a live feed that can be stale or unreachable; the
NOTAMs remain the authority.

Treat all of it as a starting point for real planning, not a substitute for it.
