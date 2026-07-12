# Data Provenance & Ingestion — University Library Portal

## Why this document is the foundation

Every other document in this project describes *how* the system is built. This one describes *what the system fundamentally is* — and it is the document the others quietly assume. Get this wrong and the entire model is misconceived; get it right and a dozen downstream decisions (why the license entity exists, why journal articles have no stored content, why the thesis workflow is the strongest part of the system) stop looking arbitrary and start looking necessary.

The single sentence this whole project rests on:

> The system is an **institutional repository for the university's own output**, plus a **license-and-metadata layer that routes users to externally-hosted licensed content.**

It is not a copy of the world's research papers. It never holds licensed publisher content. What it owns is what the institution genuinely owns — its theses, its holdings records, its licenses — and it knows how to point at everything else. This document works out exactly where every piece of data originates, who is the source of truth for it, and where the seams to the outside world attach.

---

## 1. The core distinction: own vs. route

Every resource type in the system falls on one side of a single dividing line, and this line is the organizing spine of the entire architecture.

**OWN** — the university is the source of truth. The data originates inside the institution, the system authors and stores it, and there is no external authority above it. If the system says it exists, it exists; if the system loses it, it's gone. Full lifecycle ownership: creation, storage, metadata, access control, retention.

**ROUTE** — the university is *not* the source of the content. Someone else (a publisher, an aggregator) holds the actual thing. The system holds only a *descriptive record* of it plus the *entitlement* to reach it, and its job is to resolve a user's request into an authenticated path to that external content. The system is an index and a gatekeeper, never a warehouse.

A third, in-between case exists for physical books — **IMPORT** — where the content is physical (held on a shelf, genuinely the university's) but the *metadata* is typically pulled from shared cataloguing networks rather than authored locally. Owned holdings, imported descriptions.

The rest of this document walks each resource type through which side it sits on, why, where its data comes from, and what that means for the model.

---

## 2. OWN — Theses and research reports (the institutional repository)

This is the heart of the system and the part where it is genuinely authoritative rather than derivative.

### 2.1 What "institutional repository" means

A university produces original scholarly output — masters and doctoral theses, departmental research reports, working papers. For this material, the university *is* the publisher. There is no Elsevier upstream, no external DOI registry that owns the record, no license to negotiate. The institution is the origin.

This is exactly the class of system real universities run as their **institutional repository** (IR) — often on platforms like DSpace, EPrints, or Fedora, or as part of a discovery suite. It is where a university's own intellectual output is deposited, preserved, described, and made discoverable, subject to the institution's own access rules.

The project *is* this, built from first principles for the university-specific access contracts.

### 2.2 Where the data comes from: direct submission

Theses and reports enter the system through the submission workflow already modeled — and this is real, not simulated, because the university is the source:

- A student authors metadata directly (title, abstract, keywords, supervisor, department, degree type).
- The file (the thesis PDF, supplementary data) is uploaded and stored in the university's own object storage (S3, per the deployment blueprint) — the system holds the actual bytes, because it is the custodian of record.
- A supervisor reviews and approves; library staff catalogue; the item is published to the repository.
- Embargo, if requested, gates public visibility for a defined period.

Every step of this originates and terminates inside the system. Nothing is harvested from outside because there is no outside authority. This is why the thesis submission workflow is the strongest, most defensible domain in the whole project — it is the one place the system owns the complete truth.

### 2.3 What the system stores for owned content

Everything. For theses and reports the system is the complete record:

- Full descriptive metadata (authored in-system)
- The actual content files (stored in-system)
- The access-control state (embargo, submission status) — enforced in-system
- The audit trail of the item's lifecycle

### 2.4 The outbound seam: being harvested by others

There is one external-facing direction even for owned content, and it's worth modeling as a seam even if not built: other institutions' discovery services will want to *harvest* this university's repository metadata, so the university's output shows up in worldwide academic search. The standard protocol for this is **OAI-PMH** (Open Archives Initiative Protocol for Metadata Harvesting) — a repository exposes an OAI-PMH endpoint, and external aggregators periodically pull its metadata records.

For this project: the *inbound* use of OAI-PMH (harvesting others) is discussed in section 3; the *outbound* use (exposing this repository's own theses to be harvested) is a natural extension seam — a `RepositoryOaiEndpoint` that publishes owned metadata in OAI-PMH's Dublin Core format. Not required for the core system, but naming it demonstrates understanding that an IR is a *participant* in a global metadata ecosystem, not an island.

---

## 3. ROUTE — Journal articles (the license-and-metadata layer)

This is the conceptually hardest part and the one most prone to being misunderstood, so it gets the most detail. This is where the "we are not a copy of the world's papers" truth lives.

### 3.1 The fundamental fact: the university does not host this content

Licensed journal articles are hosted by **publishers** — Elsevier (ScienceDirect), Springer Nature, Wiley, IEEE, Taylor & Francis, and aggregators like JSTOR. The university has *no copy* of these PDFs and no right to make one. What the university has is a **license**: a contractual entitlement for its members to access the publisher's copy under agreed terms (which titles, which date ranges, how many concurrent users, which faculties).

Therefore the system's `journal_article` rows are **not content**. They are *descriptive metadata records* — a title, authors, DOI, journal, abstract, citation details — that point at externally hosted content, paired with the *license* that governs whether a given user may follow that pointer.

This is the entire reason the `journal_license`, `license_faculty_scope`, and link-resolver design exist. They are not incidental features; they are the mechanism by which "route, don't host" is realized.

### 3.2 Where the metadata comes from — the real ecosystem

Universities do not hand-enter journal article metadata. Millions of articles are involved; manual entry is inconceivable. Instead there is a mature ecosystem of metadata sources, and understanding it is essential to understanding what the system's journal layer models.

**Discovery-layer aggregators (the dominant real-world answer).**
Services such as **Ex Libris Primo/Alma** (with its Central Discovery Index), **OCLC WorldCat Discovery**, and **EBSCO Discovery Service** maintain enormous pre-aggregated indexes — hundreds of millions of article-level metadata records harvested and normalized across publishers. A university *subscribes* to one of these central knowledge bases and searches *it*. The university's portal is, in this model, a front-end over a metadata index someone else assembled and keeps current. The institution never built that giant index; it licenses access to it.

**Crossref (DOI resolution).**
**Crossref** is the registration agency for scholarly DOIs. Given a DOI, Crossref's public REST API returns structured metadata (title, authors, journal, publication date, references). This is how a system can resolve a single article on demand: hand Crossref a DOI, receive a citation-complete record. Crossref is the authoritative per-article metadata source when you have an identifier.

**OpenURL / link resolvers (the routing standard).**
**OpenURL** is the standard that encodes "this specific citation, requested by this user, at this institution" into a resolvable URL. The university's **link resolver** (SFX, 360 Link, Alma's resolver) receives an OpenURL, checks the institution's holdings/licenses, and constructs the authenticated path to the appropriate copy — which is precisely why, as observed from a real university portal, the URL stays on the university domain before handing off to the publisher. The `LinkResolverService` in this project is a modeled stand-in for exactly this.

**Publisher feeds / KBART.**
Publishers and aggregators exchange holdings lists in standardized formats (e.g. **KBART** — Knowledge Bases And Related Tools) describing which titles and date ranges a subscription covers. This is how a knowledge base knows *what* a given institution is entitled to.

**Institutional resolver + proxy (authentication).**
Access to the publisher's copy is authenticated — typically via **EZproxy** or SAML-based federated access (Shibboleth/OpenAthens). The user is confirmed to be an entitled member of the institution before the publisher grants access. This is the runtime companion to the license model: the license says *whether* they may access; the proxy/federation enforces it at the moment of access.

### 3.3 What the system stores for routed content

Deliberately minimal, and never the content:

- **Metadata records** — enough to make the article discoverable and citable (title, authors, DOI, journal, volume/issue/pages, abstract). Sourced, in reality, from an aggregator subscription or resolved via Crossref — not authored in-house.
- **License records** — the genuinely institution-specific data: which content the institution is entitled to, scoped to which faculties, capped at how many concurrent users, valid for what window. *This* is what the university actually owns in the journal layer.
- **Access/usage logs** — records of who accessed what, for license-renewal analytics. (Not the content, just the fact of access.)

The content itself — the PDF the user ultimately reads — never touches the system's storage. The system routes to it and logs that it did.

### 3.4 The ingestion seam — designed, not built

Here is the senior move, and it mirrors the `UnifiedSearchService` and SSO-relying-party patterns already established in the project: **the system does not integrate live with Crossref/OAI-PMH/an aggregator — it defines the seam where such integration would attach, and simulates behind it.**

Concretely, a `MetadataIngestionService` interface:

```typescript
interface MetadataIngestionService {
  resolveByDoi(doi: string): Promise<IngestedRecord>;          // real target: Crossref REST API
  harvest(request: HarvestRequest): Promise<IngestedRecord[]>; // real target: OAI-PMH / aggregator feed
}
```

Behind this interface, for the project:

- A **seeded/simulated implementation** populates `journal_article` metadata as if it had been harvested from an aggregator or resolved via Crossref — enough realistic data to demonstrate the license-gated routing architecture end to end.
- The interface is shaped so a **real implementation** (a Crossref client, an OAI-PMH harvester, a KBART importer) could replace the simulation without the rest of the system changing — exactly the swap-behind-an-interface discipline used for the search engine.

The demonstration is not "I integrated Crossref." It is "I understood precisely where Crossref, OAI-PMH, and KBART attach, modeled that seam correctly, and simulated behind it — so the architecture is honest about its boundaries and ready for real feeds." That is a stronger signal than a brittle live integration, because it shows command of the ecosystem's structure rather than familiarity with one API.

**Deferred-contract note.** The `MetadataIngestionService` interface above is deliberately a sketch, not a hardened contract. When it is actually built, it inherits the same enforcement discipline worked out for `UnifiedSearchService` (see `search-interface-contract.md`) — structured inputs, no engine-specific leakage in return types, a module boundary the implementation can't cross, and a simulated implementation proving the abstraction holds. It is left as a sketch for now on purpose: unlike the search interface, no callers depend on it yet, and the specific leaks worth guarding against can't be identified before the ingestion layer's shape is real. Hardening it now would be guessing at leaks prematurely. This note records that the discipline is known and deferred, not overlooked — the enforcement pass happens when ingestion is built, not before.

### 3.5 Why this is modeled rather than really integrated

Three honest reasons, worth stating explicitly:

1. **Access to real aggregator indexes and many publisher feeds requires institutional subscriptions** — they are not openly available to an individual building a portfolio project. Simulating is not a shortcut around a technical problem; it's the only available path to the *data*, and the architecture is what's being demonstrated regardless.
2. **The architecture is the point.** Whether the metadata arrives from a live Crossref call or a seed script, the license-gating, scope-checking, and resolver-routing logic — the genuinely hard, genuinely institution-specific part — is identical. Simulating the feed loses nothing architecturally.
3. **A live integration would be the *least* transferable part.** Crossref's specific API shape is incidental; the *seam* is what matters, and the seam is fully expressible without the live call.

---

## 4. IMPORT — Physical books (owned holdings, imported metadata)

The in-between case, brief because it's the most conventional.

### 4.1 Owned content, borrowed descriptions

Physical books are genuinely the university's — they sit on its shelves, its copies, its circulation. In that sense they are OWN. But their *descriptive metadata* is, in the real world, rarely authored from scratch: it's imported from shared cataloguing networks.

### 4.2 Where the metadata comes from

**MARC records via shared cataloguing (OCLC).**
Libraries share bibliographic records in the **MARC** format through networks like **OCLC WorldCat**. When a library acquires a book, it typically pulls an existing MARC record for that title rather than re-describing it — copy cataloguing. So the *holdings* (which copies this library has, their status, shelf location) are the university's own data, while the *bibliographic description* (title, author, ISBN, subjects) is imported.

### 4.3 What the system stores

- **Holdings records** — owned: which copies exist, their status, condition, location. This is the university's truth (the `resource_copy` model).
- **Bibliographic metadata** — imported: title, author, ISBN, publication details. In reality from MARC/OCLC; in this project, seeded.

The ingestion seam here is a **MARC/OCLC import** path, conceptually parallel to the journal metadata seam — another concrete place the same `MetadataIngestionService`-style boundary could attach.

---

## 5. ILL — the explicit non-holding

Inter-library loan deserves a note here precisely because it is the resource type the system holds *nothing* about in advance. An ILL request is about material the university neither owns nor licenses nor has metadata for — the user describes it in free text, and the request is a workflow to source it from *another* institution. It is the clearest illustration of the system's boundaries: the one request type that references no `resource` at all, because the whole point is that the thing is outside every layer the system otherwise manages. It confirms the model by being the deliberate exception.

---

## 6. The provenance map — every resource type at a glance

| Resource type | Side | Content held? | Metadata origin (real world) | In this project |
|---|---|---|---|---|
| Thesis | OWN | Yes (S3) | Authored in-system via submission | Real workflow, real storage |
| Research report | OWN | Yes (S3) | Authored in-system | Real workflow |
| Journal article | ROUTE | **Never** | Aggregator subscription / Crossref / OpenURL | Metadata seeded; license + resolver modeled |
| Physical book | IMPORT | Yes (physical) | MARC records via OCLC | Holdings real; bibliographic metadata seeded |
| Rare material | OWN | Yes (physical) | Authored in-system | Real, supervised-access model |
| ILL request | NEITHER | No | User-described free text | Real workflow, no catalogue record |

---

## 7. What the system is — and is not — restated precisely

**It is:**
- An institutional repository that owns, stores, and governs the university's own scholarly output (theses, reports, rare materials).
- A license-and-metadata layer that holds descriptive records and entitlements for externally-hosted licensed content, and routes authenticated users to it.
- A holdings system for physical books whose descriptions are imported from shared cataloguing.
- A request workflow for material outside all of the above.

**It is not:**
- A copy of the world's research papers.
- A store of licensed publisher content.
- A hand-populated database of article metadata.
- An authority over anything it merely routes to.

**The seams to the outside world**, each modeled and simulated rather than live-integrated, and each attaching at a clearly identified point:
- **Crossref** — per-DOI article metadata resolution.
- **OAI-PMH** — inbound harvesting of others' repositories; outbound exposure of this one's.
- **Aggregator knowledge base** (Primo/Alma, WorldCat, EDS) — the pre-built cross-publisher metadata index a real institution subscribes to.
- **KBART / publisher feeds** — what-is-entitled holdings lists.
- **OpenURL + link resolver + EZproxy/federation** — the runtime routing-and-authentication path to publisher content.
- **MARC / OCLC** — physical-book bibliographic import.

Every one of these is a place a real feed would attach, expressed in the model, simulated behind an interface — the same discipline applied to search and to identity, applied here to the system's most fundamental boundary: what it is the source of truth for, and what it only points at.

---

## 8. Relationship to the other documents

- **README** — states the one-sentence identity; this document is its full elaboration.
- **Entity reference** — the `journal_article` / `journal_license` / `resource_copy` entities described there are understood correctly *only* in light of the own-vs-route distinction established here.
- **Search design** — the reason search spans "structurally dissimilar records" is partly that some records are owned and richly detailed while others are routed metadata stubs; this document explains why that heterogeneity exists at the source.
- **Stack / deployment** — S3 stores owned content (theses); it deliberately does not store routed content (journal PDFs). This document is why.

This is the foundation the rest assumes. When a downstream decision seems to ask "should the system hold this or point at it?", the answer is here.
