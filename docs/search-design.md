# Search Design — University Library Portal

## Purpose of this document

This document works out how search should function in the portal, and — as importantly — how it should *not*. Search is the single feature most likely to be over-scoped on a project like this, because "smart search like Google" is easy to imagine and expensive to build well. The reasoning below separates what genuinely serves this domain from what would be architecture theater, and gives explicit, defensible answers for both.

The through-line: the hard problem in this system is **retrieval across structurally dissimilar records**, not **predicting user intent**. Almost every design decision falls out of taking that distinction seriously.

---

## 1. Two problems that look like one

"Smart search" bundles two fundamentally different problems. Conflating them is the most common way search design goes wrong, because they demand different data, different infrastructure, and different success criteria.

### Problem A — Query assistance (intent prediction)

Predict or suggest what the user wants *as they type, before the query is complete*. This is the Google autocomplete experience: type three characters, get ranked suggestions of what you probably meant; submit a typo, get "did you mean…"; search one term, see related terms.

The defining characteristic: it guesses intent from **prior behavior patterns**, not from the content being searched.

### Problem B — Retrieval over heterogeneous, richly-structured data

Given a completed query, search across resources that have fundamentally different fields and return a relevant, ranked, mixed result set. A thesis has a department, supervisor, and degree type. A journal article has a DOI, journal, volume, and citation fields. A physical book has an ISBN and copies. The query has to span all of them and still produce a sensible ordering.

The defining characteristic: it matches a query against **structurally dissimilar records** and has to decide what "relevance" means across shapes that don't share fields.

### Why the distinction is load-bearing

- Problem B is solvable with data you already have (the documents themselves) plus structured filtering and a type-aware index. It needs **no behavioral data**.
- Problem A, done properly, needs data you structurally won't have (large-scale query logs). Building its mechanism without that data produces something that looks capable and performs poorly.

The rest of this document treats them separately and reaches opposite conclusions: build a strong answer to B, deliberately decline the hard version of A.

---

## 2. Problem B in depth — why retrieval here is genuinely hard

### 2.1 The same query string carries multiple intents

Consider the query `Tanaka machine learning 2023`. Legitimate interpretations:

- Author whose surname is Tanaka, on the topic of machine learning, from 2023
- A thesis *supervised by* someone named Tanaka (supervisor, not author)
- A resource with "Tanaka" in the title
- Any of the above, where "2023" means publication year, submission year, or acquisition year depending on resource type

A public library's `books` table has one plausible reading of "author" — there's one author relationship. This system has *several* person-to-resource relationships (author, supervisor, submitter) that a bare keyword can't disambiguate. The search layer has to either resolve this with structure (facets/filters) or rank across the interpretations sensibly — ideally both.

### 2.2 Resource types do not share fields

This is the core structural difficulty. The `Resource` hierarchy's whole point is that subtypes diverge:

| Field | PhysicalBook | Thesis | JournalArticle | ResearchReport | RareMaterial |
|---|---|---|---|---|---|
| ISBN | ✓ | — | — | — | — |
| DOI | — | sometimes | ✓ | — | — |
| Department | — | ✓ | — | ✓ | — |
| Supervisor | — | ✓ | — | — | — |
| Journal / volume / issue | — | — | ✓ | — | — |
| Degree type | — | ✓ | — | — | — |
| Embargo status | — | ✓ | — | — | — |
| Reading-room-only | — | — | — | — | ✓ |

A single ranked result list mixing these types can't rank on a shared column, because there isn't one. Relevance has to be computed per-type and then merged into one ordering — which is exactly the capability plain column matching doesn't provide.

### 2.3 Meaningful signal lives inside documents, not in columns

"Keywords" and "references" are the clearest cases. A thesis's keywords might be author-supplied metadata; its reference list is embedded in the PDF. Searching these means either extracting them into searchable fields at ingest time, or indexing document text — neither of which a relational `LIKE` query handles well. This is the first real pressure toward a dedicated search index rather than SQL text matching.

### 2.4 Relevance is not uniform across fields

A title match should rank higher than a keyword match, which should rank higher than a match buried in a reference list. "The word appears somewhere" is not the same as "the word is the subject." Field-weighted relevance is a requirement, not a refinement — without it, a paper that merely *cites* a Tanaka paper outranks a paper *by* Tanaka, which is backwards.

---

## 3. Problem A in depth — why intent prediction is deliberately out of scope

### 3.1 The mechanism runs on data this system won't have

Google's autocomplete and "did you mean" are not powered by cleverness applied to documents. They're powered by **query volume** — billions of prior searches, and crucially, *what people searched next after each query*. The prediction is a statistical read on collective behavior, not an analysis of content.

A university library portal has, realistically, a few thousand users and a modest query log that grows slowly. The fuel that makes intent prediction work — high query volume with observable follow-on behavior — structurally isn't present. This is not a temporary limitation that scales away; it's intrinsic to the size of the user base.

### 3.2 Building the mechanism without the fuel is worse than not building it

A learning-to-predict search system with no meaningful data to learn from will:

- Perform visibly poorly (suggestions that don't match what users actually want)
- Invite the exact question that can't be answered well: "how does it learn what users want, and on what data?"
- Consume build effort that would produce more value spent on faceting and relevance

The failure mode is specific: it looks impressive in an architecture diagram and disappoints in use. For a portfolio piece especially, an honest, well-scoped feature beats an ambitious feature that underperforms — because the reviewer's follow-up questions land on the weakness rather than a strength.

### 3.3 The distinction between "hard A" and "cheap A"

Not all of Problem A is off the table. There's a cheap, content-derived subset that doesn't need behavioral data:

- **Did-you-mean via fuzzy string matching** — derived from the corpus of existing terms (does "machien" closely resemble an indexed token "machine"?), not from a query log. Achievable.
- **Behavioral autocomplete / related-searches** — derived from query logs and follow-on behavior. Not achievable at this scale.

The document builds the first and declines the second. The line is: *content-derived assistance is fine; behavior-derived prediction is out.*

---

## 4. What to build

### 4.1 Faceted search (the primary mechanism)

Filters for resource type, department, year, language, degree type, availability/access status. This is what actually makes heterogeneous academic data navigable, and it's what real academic library portals lean on hardest — precisely because it sidesteps the intent-disambiguation problem by letting the user *state* their intent structurally rather than making the system guess it.

Facets also solve section 2.1 elegantly: rather than guessing whether "Tanaka" means author or supervisor, the interface exposes both as filterable dimensions and lets the user choose. The system doesn't predict; it lets the user narrow.

### 4.2 Field-weighted relevance ranking

A deterministic, explainable scoring model: title matches weighted highest, then author/keyword metadata, then body text, then reference-list mentions. Explainability matters here — "why did this rank first" has a concrete answer (it matched in the title), which is defensible in a way a black-box learned ranker is not, and appropriate for the data scale.

### 4.3 Did-you-mean via trigram fuzzy matching

Postgres `pg_trgm` provides trigram similarity for free — no query log, no external service. It catches typos ("machien" → "machine") by comparing against indexed tokens in the corpus. This delivers the *perceived* smartness of "did you mean" without any of the behavioral-data machinery, which is exactly the cheap-A subset from section 3.3.

---

## 5. What to design for, but not build now

**Query autocomplete from a query log.** Don't build the prediction engine, but *do* design the schema so queries are logged from day one — the existing `audit_log_entry` table (or a dedicated `search_query_log`) is a natural home. This keeps the capability *possible* later without committing to it now. If the system ever reached a user scale where behavioral prediction became viable, the historical data would already be accumulating. Building the capture now and the prediction never (or later) is the correct sequencing — the reverse (prediction engine, no data) is the trap.

---

## 6. What to explicitly decide against

**Behavioral intent prediction.** Out of scope because the user volume wouldn't support it — stated as a deliberate decision with a reason, not an omission. This sentence is itself worth including in any writeup: naming a plausible feature and explaining *why it's declined* demonstrates judgment more clearly than silently not building it.

---

## 7. The retrieval engine decision — Postgres FTS vs. a dedicated index

This is the one genuinely open architectural decision in the search layer, and it deserves to be made explicitly rather than defaulted.

### 7.1 What Postgres full-text search does well

`tsvector`/`tsquery` is capable and built-in:

- Tokenization, stemming, and stop-word handling for text columns
- Ranking within a single document type (`ts_rank`)
- Combined with `pg_trgm` for fuzzy matching and facet filtering via ordinary `WHERE` clauses
- No additional infrastructure — no second service to deploy, secure, monitor, or keep in sync

For a search that is mostly **"filter by type + department + year, then match text within the filtered set,"** Postgres FTS carries the entire load. This is the case for the majority of realistic portal queries.

### 7.2 Where Postgres FTS starts to strain

The pressure points are specific to this domain, all traceable to section 2:

- **Cross-type relevance ranking.** Producing one ranked list that merges a thesis, a journal article, and a book — where relevance is computed from *different fields per type* and then reconciled into a single ordering — is awkward in FTS. You end up either querying each type separately and merging in application code (workable, but you're reimplementing ranking) or flattening everything into a shared text column (which loses the per-field weighting from section 2.4).
- **Field-weighted scoring across heterogeneous documents.** FTS supports weighting (`setweight` with A/B/C/D labels), but managing consistent weight semantics across five entity shapes with different field sets is fiddly and easy to get subtly wrong.
- **Document-body search at scale.** Once you're indexing extracted PDF text (references, full thesis body), index size and query performance become real considerations that FTS handles less gracefully than a purpose-built engine.
- **Faceted aggregation.** Computing facet counts ("47 theses, 210 articles, 12 books match your query") alongside results is something dedicated search engines do natively and efficiently; in Postgres it's additional aggregate queries.

### 7.3 What a dedicated index (Elasticsearch / OpenSearch) buys

A dedicated search index is built for exactly the shape of Problem B:

- **Native cross-type relevance.** Documents of different shapes coexist in one index; relevance scoring (BM25) ranks them into a single list without per-type merge logic in application code.
- **Per-field boosting as a first-class feature.** "Title matches worth 3×, keyword matches 2×, body 1×" is declarative configuration, not hand-rolled SQL scoring.
- **Faceted aggregation as a native operation.** Facet counts come back with results in one query — the exact faceting model from section 4.1 is what these engines are designed to serve.
- **Analyzers per field.** Different fields can be tokenized differently (an author name analyzed differently from body text), which matters when the same query term means different things in different fields.

### 7.4 What it costs

The dedicated index is not free, and the costs are real enough to be the reason *not* to reach for it prematurely:

- **A second data store to keep in sync.** The index is a projection of the relational source of truth. Every write to Postgres has to propagate to the index — via dual-write, change-data-capture, or periodic reindex — and sync bugs produce the worst kind of search failure (results that disagree with reality).
- **Operational surface.** Another service to deploy, secure, monitor, back up, and reason about in the CI/CD and deployment blueprint. For a project whose deployment story is already deliberately scoped, this is a meaningful addition.
- **Consistency semantics.** The index is eventually consistent with Postgres; a just-submitted thesis might not appear in search for a moment. Acceptable, but a behavior that has to be designed for rather than assumed away.

### 7.5 The deciding factor, stated plainly

The decision hinges on **how much cross-type relevance ranking the search actually needs to do**, versus simple filtered lookup:

- If search is predominantly **filter-then-match** — the user picks a type and some facets, then text-matches within that narrowed set — **Postgres FTS + `pg_trgm` is the correct, honest choice.** Adding Elasticsearch here would be complexity without a matching need, and the deployment/sync cost wouldn't be earned.
- If search must routinely produce **one relevance-ranked list spanning all resource types**, with per-field weighting reconciled across shapes and native facet counts, **a dedicated index (Elasticsearch/OpenSearch) becomes justified** — this is the workload it exists for, and reimplementing it in application code over Postgres is the more error-prone path.

### 7.6 Recommended sequencing

Start with Postgres FTS + `pg_trgm` + faceted filtering. It covers the realistic majority of queries, keeps the deployment footprint honest, and defers a genuine cost until a genuine need is demonstrated. Design the search layer behind a clean `UnifiedSearchService` interface so the retrieval engine is swappable — meaning the *decision* to introduce a dedicated index later is an implementation change behind that interface, not a rewrite. This makes "Postgres now, Elasticsearch if and when cross-type ranking demands it" a real, low-cost migration path rather than a lock-in.

The senior signal here is not "I used Elasticsearch." It's "I used the simplest thing that fits, isolated it behind an interface, and can articulate the exact condition under which I'd upgrade."

---

## 8. Where this lives in the codebase

Consistent with the existing project structure, this all sits behind the `search/` package's `UnifiedSearchService`, which:

- Accepts a structured query (free text + facet filters)
- Queries across the `Resource` hierarchy with per-type field awareness
- Returns a polymorphic `ResourceSummaryDto` list with relevance ordering
- Hides the retrieval-engine choice (Postgres FTS today, a dedicated index if section 7.5's condition is met) entirely behind its interface

The `search_query_log` capture (section 5) writes here too, so the design-for-later autocomplete capability accumulates data from the first query onward without any prediction logic being built.

---

## 9. One-line framing for a reviewer

> Faceted retrieval over a type-aware index — because the hard problem here isn't guessing intent, it's ranking relevance across resource types that don't share fields. Query-log-based prediction was deliberately scoped out, because the user volume wouldn't support it and building a learning system with no data to learn from would be architecture theater. Postgres full-text search covers the realistic query load; a dedicated index is isolated behind the search interface and introduced only if cross-type relevance ranking demands it.

That answer demonstrates command of the problem, the constraint, and the upgrade path — which is worth more than any single technology name.
