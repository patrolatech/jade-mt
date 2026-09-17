# JADE-ENV-0.1 Methodology Template

This is a template for the environmental methodology, not an approved methodology.

## Status
DRAFT — pending researcher approval.

## Decision States

### PASS
No intersection between the property polygon and post-cutoff deforestation events.
- Condition: `eventsFound === 0` OR (all intersections have `intersectionAreaM2 === 0` AND all event dates <= cutoffDate)

### FAIL
Intersection exists between the property polygon and post-cutoff deforestation events.
- Condition: At least one event has `intersectionExists === true` AND `event.observedAt > cutoffDate`

### INCONCLUSIVE
Source unavailable, insufficient data, or geometry invalid.
- Condition: Source error, empty geometry, missing temporal data, or source returned no events with insufficient data to determine status

### ERROR
Operational failure (HTTP error, database error, WFS failure).
- Condition: Transport layer failure that prevents environmental analysis

## Temporal Rule

### DETER
- Field: `view_date` (xsd:date)
- Precision: Day
- Rule: `event.observedAt > cutoffDate` → post-cutoff → FAIL
- Missing `observedAt` → INCONCLUSIVE

### PRODES
- Field: `image_date` (xsd:date) preferred, `year` (xsd:int) fallback
- Precision: Day (via image_date), Year (via year)
- Rule: `event.observedAt > cutoffDate` → post-cutoff → FAIL
- If only `year` available: `year >= cutoffYear + 1` (since year is crop-year)
- Missing `observedAt` → INCONCLUSIVE

## Spatial Rule

- Any positive intersection area counts (no minimum threshold yet)
- Boundary contact with 0 area is NOT counted as intersection
- Multiple events analyzed independently (no deduplication yet)
- Each event's area calculated via `ST_Area(geometry::geography)` in m²

## Source Hierarchy
1. DETER (daily, higher temporal precision)
2. PRODES (annual, lower temporal precision)
3. No source → INCONCLUSIVE

## Failure-to-Result Policy
- Source unavailable → ERROR (not INCONCLUSIVE)
- Source returned no data → INCONCLUSIVE (not PASS)
- Geometry invalid → INCONCLUSIVE (not PASS)
- Missing temporal data → INCONCLUSIVE (not PASS)

## Research Notes
This methodology is a hypothesis to be validated. Do not interpret results as legal compliance decisions. PASS does not mean "EUDR compliant." Full legal compliance requires additional requirements outside this prototype.