# rv-agent intent: candidate ordinal selection

## Trigger

The user refers to candidate `${n}` from the current candidate state. The resolved candidate key is `${key}`.

## Required action

Select this candidate directly and continue the task from the current state.

Use the current projected/session candidate list as the source of truth. If a projected candidate list exists, candidate ordinals and automatic submission must be based on that projected list, not on raw `cgs_search_books` results.

## Do not

- Do not call `cgs_search_books` again for this selection.
- Do not ask the user to choose the same candidate again.
- Do not ask whether to continue.
- Do not ignore MCP preference projection state when it is present.

## Success criteria

Proceed with candidate key `${key}` as the selected book, then apply any already-known chapter or whole-book rules.
