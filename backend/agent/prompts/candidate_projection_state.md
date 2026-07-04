# CGS candidate projection state

## Rules

The following state is the accumulated candidate pool after active MCP preference projection.

- Future ordinal references must resolve against `projected_candidates`.
- Automatic selection and submit decisions must use `projected_candidates`.
- Clarification should reference `projected_candidates` when asking the user to choose.

## Do not

- Do not fall back to raw `cgs_search_books` results after this projection state exists.
- Do not submit a candidate outside `projected_candidates` unless the user explicitly overrides preferences.

## Data

projection=${projection_json}
