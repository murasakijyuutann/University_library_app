# Search Interface Contract — University Library Portal

## Purpose and register

This is a working specification, not a reasoning document. It defines the exact shape of the `UnifiedSearchService` interface and the mechanisms that enforce it, so that the retrieval engine underneath (Postgres FTS today, a dedicated index later) can be swapped without callers noticing.

The *why* behind these choices — why faceted retrieval, why not intent prediction, when a dedicated index becomes justified — lives in `search-design.md` and is not re-argued here. This document assumes those conclusions and specifies what they require. It is code-forward on purpose: the type definitions are the spine, and the prose exists only to state the rules that keep the boundary clean.

The single threat this whole contract defends against: **a caller coming to depend on something only the current engine (Postgres FTS) provides**, so that swapping the engine later breaks that caller. Every rule below makes one class of leak impossible to express across the boundary rather than merely discouraged.

---

## 1. The interface

```typescript
export interface UnifiedSearchService {
  search(query: SearchQuery): Promise<SearchResults>;
}
```

One method. Takes a structured query object, returns results and facet counts together. No overload that accepts a raw string. No method that returns engine-specific ranking data. The narrowness is the point — there is no surface through which an engine detail can escape.

In NestJS terms this is an injectable provider bound behind an interface token: consumers depend on the `UnifiedSearchService` token, and the Postgres implementation (or a later index-backed one) is what's provided for it. The consumer never names a concrete class.

---

## 2. The query input

```typescript
export interface SearchQuery {
  readonly text: string;                 // plain search terms — NOT engine query syntax
  readonly filters: ReadonlyArray<FacetFilter>; // typed facet constraints, not raw WHERE fragments
  readonly page: Pagination;
}

export interface FacetFilter {
  readonly dimension: FacetDimension;    // typed enum, not a free string
  readonly value: string;
}

export enum FacetDimension {
  RESOURCE_TYPE = 'RESOURCE_TYPE',
  DEPARTMENT = 'DEPARTMENT',
  YEAR = 'YEAR',
  LANGUAGE = 'LANGUAGE',
  DEGREE_TYPE = 'DEGREE_TYPE',
  ACCESS_STATUS = 'ACCESS_STATUS',
}

export interface Pagination {
  readonly page: number;
  readonly size: number;
}
```

**Why `text` is plain terms, not a query string.** If the field carried engine syntax, Postgres `to_tsquery` operators (`&`, `|`, `:*`) would leak into what callers pass, and callers would come to depend on `tsquery` grammar the index doesn't speak. Plain terms give that leak nowhere to live. The implementation is responsible for translating `text` into whatever its engine understands — that translation is an implementation detail, never the caller's concern.

**Why `FacetFilter` is typed, not a raw fragment.** A typed dimension + value pair cannot smuggle SQL (`"department = 'X' OR 1=1"`) the way a raw string could. The filter expresses *intent* ("department is X"), and each implementation renders that intent in its own dialect — a Prisma `where` clause (or parameterized SQL) for Postgres, a filter clause for the index. Same enforcement as the text field, applied to filtering. (It also keeps the boundary injection-safe: values never become SQL text on the caller's side.)

---

## 3. The return type

```typescript
export interface SearchResults {
  readonly results: ReadonlyArray<ResourceSummaryDto>;
  readonly totalMatches: number;
  readonly facets: ReadonlyArray<FacetCount>; // rides WITH results — never a separate call
  readonly page: Pagination;
}

export interface FacetCount {
  readonly dimension: FacetDimension;
  readonly value: string;
  readonly count: number;                // e.g. DEPARTMENT / "Engineering" / 47
}
```

Note what is **absent**: there is no `score` field, and specifically no `ts_rank` float. This is deliberate and load-bearing (see 4.1). Result ordering is conveyed only by array position — first in the array is most relevant — not by an exposed numeric score.

`ResourceSummaryDto` is the existing discriminated-union result shape from the project structure — the same polymorphic summary used across all `Resource` subtypes, keyed on `type`. Search returns it; search does not introduce a parallel result type. Because backend and frontend are both TypeScript, this is literally the same type on both sides of the wire.

---

## 4. The enforcement mechanisms

Ordered strongest to weakest. The pattern across all of them: real enforcement is the compiler or the build failing, not a person remembering a principle. Anywhere the answer is "the developer will be careful," the boundary eventually leaks. Anywhere the answer is "it won't compile / the build goes red," it holds.

### 4.1 The return type cannot carry engine-specific data — compile-time enforced

The strongest enforcement, because a type the caller cannot name is a dependency the caller cannot form.

`SearchResults` has no `score` field. The moment a caller could read `result.score`, someone writes "only show results with score > 0.4" — a threshold that is meaningful for Postgres `ts_rank` and meaningless for Elasticsearch BM25, whose score ranges aren't comparable. That one line turns the swap into a rewrite. Because the type does not declare `score`, that line does not compile under `strict`/`noImplicitAny`. The type system does the work; nobody has to remember a rule.

> One TypeScript-specific caveat worth naming: structural typing means an object can carry *extra* properties at runtime even if the interface doesn't declare them, and a cast (`as`) or an `any` can reach them. The mitigation is `strict` mode plus a lint rule banning `any` and unchecked casts across this boundary (see 4.4) — so the "no score" guarantee is enforced by the compiler *and* the linter together, which is TypeScript's equivalent of the guarantee Java's nominal typing gave for free. Relevance still reaches the caller only as **order** (array position), which every engine can produce and which means the same thing regardless of engine.

### 4.2 The query input is structured, not parsed — compile-time enforced

Covered by the `SearchQuery` / `FacetFilter` types in section 2. Because the signature is `search(query: SearchQuery)` and not `search(text: string)`, there is no channel in which engine query syntax can travel across the boundary. The leak has nowhere to live. This is enforced by the signature itself — a caller cannot pass a raw `tsquery` string because the method does not accept one.

### 4.3 Facet counts are in the contract from day one — prevents a two-site migration

`SearchResults` carries facet counts alongside results as one returned object. This matters because of a specific coupling: once a dedicated index owns retrieval, it must also own facet counting — only the engine that produced the matched set knows its per-facet breakdown, and Postgres cannot count facets over a result set the index produced.

If facet counts were fetched via a *separate* call in the Postgres-only version, the later migration would have to change two call sites and their coordination. With counts riding in the single search return from the start, the migration changes one implementation behind one interface and callers never notice. The cost of doing this now is one extra aggregate query in the Postgres implementation, returned in the same object — near zero. The cost of *not* doing it is a two-site migration later. This is the enforcement most likely to be skipped precisely because skipping it "feels fine" in v1; that feeling is the trap.

### 4.4 The interface lives in a module the implementation cannot leak into — build-time enforced

Put the interface, `SearchQuery`, `SearchResults`, `FacetFilter`, `FacetCount`, and `FacetDimension` in a directory/module with **no dependency** on Prisma, on the Postgres client, or on any engine-specific type. The Postgres implementation depends on the interface module; the interface module depends on nothing downstream.

This is real enforcement, not tidiness: if the interface module cannot import Prisma types, a return type *cannot accidentally* expose a `Prisma.*` row type, a query-builder object, or a `tsvector` wrapper — because those types aren't imported there. The boundary is enforced by dependency direction, not by reviewer vigilance. This is the difference between "we agreed not to" and "you can't."

To harden it into a red CI check, **`dependency-cruiser`** (or an ESLint `import/no-restricted-paths` / `boundaries` rule) fails the build if anything in the search-API module imports a persistence module:

```json
// .dependency-cruiser.json  (forbidden rule)
{
  "forbidden": [
    {
      "name": "search-api-no-persistence",
      "severity": "error",
      "from": { "path": "^src/search/api" },
      "to":   { "path": "^(src/prisma|node_modules/@prisma)" }
    }
  ]
}
```

This is the TypeScript-ecosystem equivalent of the ArchUnit rule the Java version used — same intent (a build failure, not a hope), different tool.

### 4.5 A second implementation existing early proves the abstraction holds — empirical enforcement

The only mechanism that *verifies* the other four succeeded rather than assuming they did, and the one that catches leaks the type system misses.

Write a trivial second implementation early — an in-memory one that searches a hardcoded list — not for production, but as a test of the interface's honesty:

```typescript
export class InMemorySearchService implements UnifiedSearchService {
  // searches a fixed in-memory list; no Postgres, no index
  async search(query: SearchQuery): Promise<SearchResults> { /* ... */ }
}
```

An interface is only as swappable as your ability to actually swap it. If `InMemorySearchService` can satisfy the interface and every existing caller and test still passes against it (bind it as the provided `UnifiedSearchService` in a test module), the abstraction is genuinely clean. If writing the fake forces you to fabricate a `ts_rank` score or replicate `tsquery` parsing, you have found the leak *now* — cheaply — instead of during the real migration under pressure.

Keep the fake as a permanent test fixture. If a future interface change breaks it in a way that requires Postgres-specific faking, that is the early warning that the boundary is eroding.

---

## 5. Priority if only some of this gets done

- **Non-negotiable** — 4.1 (no score leak in the return type) and 4.2 (structured query object). These prevent the two most common and most damaging leaks; both are compile-time enforced (4.1 with `strict` + the lint rule from 4.4).
- **High value, low cost** — 4.3 (facet counts in-contract). Cheap now, saves a two-site migration later.
- **Strong structural insurance** — 4.4 (module boundary + dependency-cruiser). Turns "we shouldn't" into "you can't."
- **Best proof it worked** — 4.5 (early second implementation). Empirically verifies the other four rather than assuming them.

---

## 6. What this contract deliberately does not specify

- **The engine's internal query translation.** How `SearchQuery.text` becomes a `tsquery` (or later an index query) is implementation-private and intentionally unspecified here.
- **The sync mechanism for a future dedicated index.** If retrieval later moves to Elasticsearch/OpenSearch, keeping that index in step with the Postgres source of truth (dual-write vs. change-data-capture vs. periodic reindex) is a real decision with real failure modes — but it is premature until the engine actually changes, and it sits behind this interface either way. Noted so it is not a surprise later; not resolved here.
- **Relevance weighting values.** The specific field weights (title over keyword over reference-list) are an implementation concern of whichever engine is active; the contract guarantees only that results arrive in relevance order, not how that order is computed.

---

## 7. Relationship to the other documents

- `search-design.md` — the reasoning this contract assumes. Read that for *why* faceted retrieval and *when* a dedicated index is justified.
- `project-structure.md` — where `UnifiedSearchService` physically sits (the `search/` module, §2.12). This document elaborates the interface that entry names.

The dependency is one-directional and sequential: the design doc's conclusions justify this contract; this contract governs the code. A routine interface change (adding a facet dimension, adjusting `SearchQuery`) touches only this document — the reasoning doc stays untouched. That separation is the test that this document is correctly its own artifact.
