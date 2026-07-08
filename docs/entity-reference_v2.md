# Entity Reference — University Library Portal

## Purpose

A single, self-standing catalogue of every entity in the system — its purpose, its key fields, and its relationships — written in prose so it can be read without parsing the SQL DDL in `project-structure.md`. This is the text-first equivalent of an entity-relationship reference, consistent with the project's no-diagram preference. The SQL schema remains the source of truth; this document is the human-readable index into it.

Entities are grouped by domain area. For each: what it represents, why it exists, the fields that carry meaning (not every column), and how it connects to the rest of the model.

A companion relationship map (the text-first "ERD" pass) follows in a separate section at the end, listing every relationship in one place as a verification view.

---

## 1. The Resource hierarchy

The spine of the system. An abstract `Resource` with five concrete subtypes, mapped via JOINED inheritance — a shared base table plus one extension table per subtype. The whole point of the hierarchy is that the subtypes diverge: each has a genuinely different access contract, and that divergence is what the model exists to express.

### Resource (abstract base)
The common identity and descriptive metadata shared by everything searchable and holdable in the system. Carries `title`, `description`, `department`, timestamps, and a `resource_type` discriminator. Every subtype below shares this base row via a matching primary key.
- **Relationships:** parent of all five subtypes (one-to-one with each, by shared id); referenced by `reservation` (a hold is placed on a resource generically, not on a subtype).

### PhysicalBook (subtype)
A physically held book — the one resource type with tangible copies to lend. Carries `isbn`, `author`, `publisher`, `publication_year`, `call_number`.
- **Access contract:** borrow/return/reserve against physical copies.
- **Relationships:** one PhysicalBook has many `resource_copy` rows (the actual lendable inventory).

### Thesis (subtype)
A submitted student thesis — the one resource type that members *contribute*, not just consume. Carries `degree_type` (BACHELOR/MASTER/PHD), `submission_status` (the workflow state), `embargo_until` (time-gated public access), `file_path` (the stored PDF, an S3 key), and `submitted_at`.
- **Access contract:** download / read-only, gated by embargo and submission status.
- **Relationships:** references `member` twice — once as the submitting student (`student_member_id`, required) and once as the supervisor (`supervisor_member_id`, optional). This dual relationship to the same entity is one reason search intent (author vs. supervisor) can't be inferred from a bare name.

### JournalArticle (subtype)
A licensed journal article — accessed, never owned. Carries `doi` (a resolvable identifier via doi.org, distinct from a mere label), citation-completeness fields (`volume`, `issue`, `page_range`), and two foreign keys: to `journal` (the series it belongs to) and to `journal_license` (the access right that governs it).
- **Access contract:** license-gated; no physical loan, no hold queue.
- **Relationships:** belongs to one `journal`; governed by one `journal_license`.

### ResearchReport (subtype)
A departmental research report. Carries `department_scope` and `report_year`.
- **Access contract:** department-scoped access.
- **Relationships:** subtype of Resource; no copies, no license.

### RareMaterial (subtype)
A rare or fragile item available only under supervision. Carries `reading_room_only` (defaults true) and `handling_notes`.
- **Access contract:** supervised in-person access only; never removed from the premises.
- **Relationships:** subtype of Resource; no copies, no loans.

---

## 2. Physical inventory

### ResourceCopy
A single physical copy of a PhysicalBook — the actual unit that gets lent. Separates the abstract work (the book) from the concrete inventory (this copy on this shelf). Carries `barcode_label` (a data field only — no scanner integration), `status` (AVAILABLE / ON_LOAN / RESERVED / LOST), and `shelf_location`.
- **Relationships:** belongs to one `physical_book`; referenced by `loan` (a loan is always of a specific copy, not of the abstract book).
- **Open decision:** whether this row's `status` and the `loan.status` that references it are kept consistent by service logic or by database triggers is not yet resolved (see section on open decisions).

---

## 3. People and access

### Member
Anyone with a relationship to the library — students, faculty, staff. Deliberately **not** a credential store: identity comes from an external SSO provider, and `sso_subject_id` holds the JWT subject claim, not a password. Carries `full_name`, `email`, `member_type` (UNDERGRAD/GRADUATE/FACULTY/STAFF), `faculty`, and `role` (STUDENT/FACULTY/LIBRARIAN/ADMIN).
- **Relationships:** referenced widely — as borrower (`loan`), as thesis student and thesis supervisor (`thesis`, twice), as reservation holder (`reservation`), as ILL requester (`ill_request`), and as the subject of `fine` rows. The `member_type` drives loan-period rules; the `role` drives authorization.

### Fine
A monetary charge against a member, almost always for an overdue loan. Carries `amount`, `reason`, `paid` (boolean), and timestamps.
- **Relationships:** belongs to one `member`; optionally references the `loan` that generated it (optional because a fine could in principle exist for a non-loan reason).

---

## 4. Circulation

### Loan
A specific physical copy checked out to a specific member. Carries `status` (ACTIVE / RETURNED / OVERDUE / LOST), `borrowed_at`, `due_at`, `returned_at`.
- **Relationships:** references one `resource_copy` (the specific unit) and one `member` (the borrower); referenced by `fine` when overdue.
- **Lifecycle note:** the ACTIVE→OVERDUE transition is driven by a scheduled job, not by a user action.

### Reservation
A member's place in the hold queue for a resource whose copies are currently unavailable. Carries `queue_position`, `status` (QUEUED / READY_FOR_PICKUP / EXPIRED / FULFILLED / CANCELLED), and timestamps including `expires_at` (the collection deadline once ready).
- **Relationships:** references one `resource` (generically — the hold is on the work, filled by whichever copy returns first) and one `member`.
- **Lifecycle note:** the READY→EXPIRED transition and cascade to the next in queue is scheduler-driven. This is also the entity at the center of the concurrent-reservation problem (two members racing for the last copy), whose locking strategy is an open decision.

---

## 5. Journals and licensing

### Journal
A publication series (e.g. a named journal), distinct from any single article within it. Carries `name`, `issn` (identifies the series, as opposed to an article's DOI), and `publisher`.
- **Relationships:** parent of many `journal_article` rows.
- **Open decision:** `issn` is currently nullable with no uniqueness constraint; whether to enforce uniqueness (and how to handle articles whose journal has no ISSN yet) is unresolved.

### JournalLicense
The access right the institution holds for journal content — the entity that encodes "we license this, we don't own it." Carries `publisher`, `concurrent_user_limit`, and a validity window (`starts_at`, `expires_at`).
- **Relationships:** governs many `journal_article` rows; scoped to faculties through `license_faculty_scope`.

### LicenseFacultyScope
A join table expressing which faculties a given license covers — the mechanism behind "Engineering's license doesn't cover Medicine." Composite primary key of (`license_id`, `faculty`).
- **Relationships:** many-to-one to `journal_license`; each row names one covered faculty.

---

## 6. Inter-library loan

### IllRequest
A member's request for material the library does not hold, to be sourced from another institution. Self-contained by design — it captures bibliographic details as free fields (`title`, `author`, `doi_or_isbn`, `justification`) rather than referencing a `resource`, because the item isn't in the catalogue. Carries `status` (SUBMITTED → UNDER_REVIEW → REQUESTED_EXTERNALLY → FULFILLED → DELIVERED → RETURN_DUE → RETURNED, with CANCELLED possible) and timestamps.
- **Relationships:** references one `member` (the requester). Notably references no `resource` — this is the one request type about something outside the system's own holdings.

---

## 7. Cross-cutting infrastructure

### AuditLogEntry
An append-only record of state transitions across the domain (loans, theses, ILL, reservations). Carries `entity_type`, `entity_id`, `action`, `actor_member_id`, and before/after values.
- **Relationships:** references `member` as the actor; otherwise points at other entities loosely by type+id rather than hard foreign keys, since it spans all of them.
- **Secondary role:** the natural home for search-query logging (the design-for-later autocomplete capability), so query capture can accumulate without building prediction logic.

### NotificationLog
A record of notifications sent to members (reservation ready, overdue, embargo lifted). Carries `type`, `sent_at`, and a `payload`.
- **Relationships:** references one `member` (the recipient).

---

## 8. Text-first relationship map (the "ERD" pass)

Every relationship in one place, as a verification view. Read as "A — relationship — B". This is the lens for catching gaps; anything that looks wrong here is a modeling issue to resolve.

**Resource hierarchy**
- Resource — is specialized by (1:1 each) — PhysicalBook, Thesis, JournalArticle, ResearchReport, RareMaterial

**Inventory and circulation**
- PhysicalBook — has many — ResourceCopy
- ResourceCopy — is lent via many — Loan
- Loan — is borrowed by — Member
- Loan — may generate — Fine
- Resource — is held via many — Reservation
- Reservation — is placed by — Member

**People**
- Member — may owe many — Fine
- Member — submits many — Thesis (as student)
- Member — supervises many — Thesis (as supervisor)
- Member — requests many — IllRequest

**Journals and licensing**
- Journal — has many — JournalArticle
- JournalLicense — governs many — JournalArticle
- JournalLicense — is scoped by many — LicenseFacultyScope

**Cross-cutting**
- Member — acts in many — AuditLogEntry (as actor)
- Member — receives many — NotificationLog

**Notable absences (deliberate, not gaps)**
- IllRequest references no Resource — the requested item is outside the catalogue.
- ResearchReport and RareMaterial have no copies or loans — access is scoped/supervised, not lent.
- JournalArticle has no loan or reservation — access is license-gated, not circulation-based.

---

## 9. Open modeling decisions (unresolved, will edit entities above once settled)

These are the decisions that will actually feed changes back into this reference — surfaced, not yet resolved:

1. **ResourceCopy.status ↔ Loan.status synchronization** — kept consistent by service logic or by database triggers? Affects whether copy-status is derived or stored-and-synced.
2. **Concurrent-reservation locking** — optimistic vs. pessimistic locking when two members race for the last available copy. Touches Reservation and Loan creation paths.
3. **Journal.issn uniqueness** — whether to enforce a uniqueness constraint on ISSN, and how to treat a journal that has no ISSN yet. Currently nullable and non-unique.

Each of these, once decided, changes a specific entity's fields or constraints above — which is the real feedback loop into this document, distinct from the relationship-map pass (which surfaces gaps but doesn't itself resolve them).

---

## 10. Deferred enforcement notes (settled design, enforce at implementation)

These are distinct from section 9: the design is already decided and correct, but currently enforced by prose rather than by schema shape. Nothing is wrong; the note exists so the "make it structurally enforced" step is already identified when implementation begins, rather than rediscovered.

1. **No content-storage field on routed resources (schema-enforce at build).** Per the own-vs-route distinction (see `data-provenance-and-ingestion.md`), the system stores content files only for *owned* resources (Thesis, ResearchReport, owned physical materials) and *never* for *routed* content (JournalArticle points at externally-hosted publisher content). Currently this is a documented constraint. At implementation, it should be made structurally impossible to violate: `journal_article` should have no `file_path`/S3-key column at all, so there is physically nowhere to attach stored content by mistake. This turns "don't store routed content" from a discipline question into a schema impossibility. Not actionable until the schema is written in code; noted here so it isn't left as prose-only once it matters.
