# CGS exact episode mapping failed

## Trigger

The agent cannot confidently map the user's precise episode request to concrete `episode_key` values after inspecting the `cgs_list_book_episodes` result.

## Required action

Ask the user to choose from candidate episode names returned by `cgs_list_book_episodes`.

Preserve original `Episode.name` text when listing options.

For attached-book continuation requests, use this clarification only after site exploration is genuinely exhausted or the remaining ambiguity is about episode names on an otherwise matching candidate. If the current site has no exact book match, cannot list episodes, or simply lacks enough chapters after the local latest episode, try other plausible cached CGS sites first unless the user explicitly restricted the site.

## Do not

- Do not continue trying to submit.
- Do not invent episode names or keys.
- Do not fall back to `episode_select`.
- Do not ask broad questions unrelated to episode selection.
- Do not use one site's missing or insufficient episode list as proof that every other cached site lacks the continuation chapters.
