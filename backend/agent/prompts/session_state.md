# rv-agent context: session state

## Inputs

Python provides the current candidate and selection state.

## Rules

- Candidate ordinals and references from the user map to `candidates` in this state.
- Existing `selection` remains active unless the user explicitly chooses a different candidate or chapter set.
- If `projected_candidates` are present elsewhere in context, projected candidates remain the source of truth for candidate ordinals and automatic submit.

## Do not

- Do not call `cgs_search_books` again when the user refers to an existing candidate by ordinal or pronoun.
- Do not ask the user to repeat candidate information already present in this state.

## Data

session_state=${session_state_json}
