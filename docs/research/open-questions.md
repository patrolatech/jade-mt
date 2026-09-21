# Open decisions

Scientific approval is recorded in [JADE-ENV-0.1](../methodology/JADE-ENV-0.1.md).
The API remains INCONCLUSIVE while that methodology is draft.

## Scientific

- Define the meaning of `view_date`, `image_date`, and PRODES `year` for each class.
- Define sufficient spatial and temporal coverage: biome, clouds, publication
  delays, revisions, and minimum observable area. Decide which additional layers
  are needed for Cerrado and Pantanal.
- Approve cutoff inclusivity, date intervals, and uncertainty precedence.
- Approve topology, processing CRS, area thresholds, and numerical tolerance.
- Decide whether geometry repair is needed. It is currently disabled.

## Implementation

- Preserve source event classes in the normalized event model before implementing
  class-dependent decisions. They currently survive only in raw payloads.
- Bound the complete validation workload. The WFS timeout does not cover the
  subsequent PostGIS loop; response bytes and concurrent runs are not capped.
- Define evidence retention and recovery of runs left `running` after a crash.
- Select geometry and manifest canonicalization before connecting evidence to
  Stellar. Contract TTL, restoration, and deployment remain separate work.
