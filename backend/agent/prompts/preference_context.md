# rv-agent context: MCP preferences

## Inputs

Python provides active MCP preferences from the redViewer mobile preference panel.

## Rules

- Treat `match_preferences` as positive gates: candidates should satisfy every active in-scope match condition before preview or automatic selection.
- Treat `exclude_preferences` as negative gates: candidates matching any active in-scope exclude condition must be excluded.
- Respect every preference `scope`.
- `scope.book_kind=doujinshi` applies only to whole-book/doujinshi candidate pools.
- `scope.book_kind=manga` applies only to manga/episode-card tasks.
- Site, language, and metadata scopes must apply only when their scoped fields match.
- User instructions in the current turn override stored preferences only when explicit.
- Evaluate preferences over the accumulated candidate pool, not over a single search page.

## Do not

- Do not use doujinshi preferences for manga continuation or chapter selection.
- Do not use manga preferences for doujinshi whole-book download pools.
- Do not clear existing accumulated candidates just because a later search page is empty.
- Do not present raw unfiltered candidates as preference-satisfied candidates when preference matching is uncertain.

## Data

preference_context=${preference_context_json}
