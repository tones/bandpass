# Phase 0: Research — Validate the Data Layer Before Building

> Research-first approach. No scaffolding until we know what data is available and how to get it.

**Goal:** Determine whether bandcamp-fetch is worth depending on, map Bandcamp's internal API surface (especially the feed), and make an informed build-or-wrap decision before writing any application code.

---

## Step 1: Evaluate bandcamp-fetch

Examine the library's source code to assess quality, substance, and maintainability.

**Questions to answer:**
- How substantial is it? Is it a thin wrapper or does it do meaningful parsing/normalization?
- How does it hit Bandcamp's endpoints? (scraping HTML? calling internal APIs? both?)
- How does it handle auth, pagination, errors, rate limiting?
- When was it last updated? Is it actively maintained?
- Is it well-tested?
- How fragile is it? (Would Bandcamp HTML changes break it?)
- What Bandcamp endpoints does it use? (This teaches us the API surface even if we don't use the library.)

**Output:** `docs/research/bandcamp-fetch-evaluation.md` — an honest assessment with a recommendation: depend on it, learn from it, or skip it.

---

## Step 2: Investigate Bandcamp's endpoints directly

Independent of bandcamp-fetch, map the actual API surface by observing what Bandcamp's web app does.

**Approach:**
- Browser DevTools: observe network requests on the feed page, discover page, collection page
- Document each endpoint: URL, method, headers, request/response shapes
- Special focus on the **feed** — this is the highest-priority data source and the one bandcamp-fetch doesn't cover

**Questions to answer:**
- What endpoint(s) serve the social feed? What event types exist?
- What do the discovery, collection, and album detail endpoints look like raw?
- How does auth work? (Cookie? Bearer token? Both?)
- What data is available in the feed that ISN'T available through other endpoints?
- Rate limiting behavior?

**Output:** `docs/research/bandcamp-api-surface.md` — a map of Bandcamp's internal API endpoints relevant to our use case.

---

## Step 3: Decide the data layer approach

Based on Steps 1 and 2, choose one of:

**A. Use bandcamp-fetch** — if it's substantial, well-maintained, and covers most of what we need. Supplement with custom code for the feed.

**B. Learn from bandcamp-fetch, build our own** — if bandcamp-fetch is thin/fragile but its source teaches us the endpoints and patterns. Build a unified wrapper.

**C. Build from scratch using the endpoint map** — if bandcamp-fetch doesn't teach us much beyond what we found in Step 2.

**Output:** A decision documented in `docs/research/data-layer-decision.md`, feeding into a revised design and implementation plan.
