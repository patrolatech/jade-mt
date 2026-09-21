# JADE-ENV-0.1 — Technical Decision Proposal

Status: **DRAFT — pending researcher approval**. Code and passing tests do not
establish approval. The default execution returns INCONCLUSIVE with
METHODOLOGY_PENDING_APPROVAL and the available measurements and evidence. No HTTP
parameter or environment variable can declare approval.

## Temporal input

`cutoffDate` is a UTC calendar day, included in the earlier period: an occurrence
on that date belongs to "before or on the cutoff." Daily dates are validated
against the calendar, including leap years. Monthly precision spans the first
through the last day of the month; an occurrence year spans January 1 through
December 31. An interval crossing the cutoff is uncertain. Missing dates, invalid
values, and unknown semantics are never converted into exact dates. Parsing,
period boundaries, and comparisons use `date-fns` with UTC context.

DETER `view_date` and PRODES `image_date` represent observations, rather than the
exact start of an occurrence. The `xsd:date` schema defines the format, not its
environmental meaning. An observation after the cutoff may detect an earlier
occurrence. In this proposal, an observation before or on the cutoff bounds the
occurrence to the earlier period; a later observation remains uncertain. The
researcher must review this inference for the selected event classes.

PRODES `year` remains a reporting year (`temporalBasis: prodes-year`), without
conversion to January 1, December 31, or a calendar year of occurrence. It is a
fallback only when `image_date` is missing. Relating this reporting cycle to an
occurrence requires a scientific decision; the experimental rule treats it as
uncertain. Normal source queries use no temporal filter: older, undated, and
coarse observations remain available for analysis. WFS temporal filters were
researched separately.

## Executable decision table

`evaluateDecisionProposal` can produce conclusive results only when source
coverage is sufficient and occurrence semantics are established. Live sources
currently report `coverage=unknown`; HTTP success and `numberMatched` do not
establish environmental coverage.

| Case / condition, in precedence order                                                   | Proposal                                     | Current default API                     |
| --------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------- |
| HTTP/WFS failure, timeout, incomplete page, invalid payload, exceeded limit             | Operational ERROR; no environmental decision | HTTP 503 / SOURCE_UNAVAILABLE           |
| Database or internal failure                                                            | Operational ERROR                            | HTTP 500 / INTERNAL_ERROR               |
| Invalid input                                                                           | Request error                                | HTTP 400; 413 for body >1 MiB           |
| Incomplete geometry analysis or topologically invalid event                             | INCONCLUSIVE                                 | HTTP 200 + issue with event ID          |
| Missing methodology approval                                                            | INCONCLUSIVE                                 | HTTP 200 + METHODOLOGY_PENDING_APPROVAL |
| D1 — insufficient or unknown coverage                                                   | INCONCLUSIVE                                 | HTTP 200 + INSUFFICIENT_COVERAGE        |
| Missing date, ambiguous interval, or uncertain semantics for a positive intersection    | INCONCLUSIVE                                 | HTTP 200 + UNCERTAIN_EVENT_DATE         |
| A — no positive-area intersection, sufficient coverage                                  | PASS                                         | INCONCLUSIVE while DRAFT                |
| B — all positive intersections established before or on the cutoff                      | PASS                                         | INCONCLUSIVE while DRAFT                |
| C — at least one occurrence established after the cutoff, with no remaining uncertainty | FAIL                                         | INCONCLUSIVE while DRAFT                |

Insufficient data and uncertainty take precedence, including in mixed event sets.
This precedence requires researcher approval. Boundary contact with zero area does
not count as affected area. Measurements are associated by feature ID, regardless
of array order. Missing measurements prevent PASS/FAIL. ERROR uses the HTTP failure
channel; a successful 200 response never disguises an operational failure. All
four statuses remain in the shared schema.

## Coverage and sources

PRODES Amazon and DETER Amazon are queried by default, with explicit source
selection through configuration. The prototype does not claim full coverage of
Mato Grosso, Cerrado/Pantanal, cloudy periods, or unpublished intervals. Areas
from the two sources are not summed as a deduplicated union, and a failing source
is not silently replaced by the other. Raw pages, parameters, retrieval times,
and hashes are preserved. Non-transactional pagination remains a limitation.

## Tests and approval

Cases A–D and annual/monthly/daily tests exercise the proposal with synthetic
sources whose coverage is sufficient, through explicit injection of
`evaluateDecisionProposal`. They do not establish environmental validity or
scientific approval. API tests verify DRAFT behavior and the distinction between
insufficient data and operational failure. After approval, activation requires a
reviewed code change referencing the approval and updating production tests.

## Researcher approval record

| Decision                                                      | Available proposal / evidence                                  | Status         |
| ------------------------------------------------------------- | -------------------------------------------------------------- | -------------- |
| Semantics of view_date, image_date, year, and event classes   | WFS profiles and temporal interpretation above                 | Pending        |
| Coverage needed for PASS and source selection by biome/period | Profiles, limitations, and coverage=unknown                    | Pending        |
| Inclusive cutoff, intervals, and status precedence            | Decision table and proposal tests                              | Pending        |
| Topology/CRS, boundaries, and threshold                       | PostGIS experiments and geometry-crs-policy.md                 | Pending        |
| Automatic repair                                              | Keep disabled; ST_MakeValid changes the type in the experiment | Not authorized |
| Responsible researcher, date, and approval reference          | Record with the accepted scope                                 | Not provided   |

The activity plan requires these decisions with the researcher. This proposal is
ready for review; it does not replace approval, and PASS is not a legal compliance
conclusion.
