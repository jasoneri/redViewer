# attachedBookList single-item subtask

## Trigger

This is one subtask inside a multi-book `attachedBookList` orchestration.

## Required action

Process only the attached book described by `subtask_context`.

If the original user request requires search, remote episode listing, continuation after downloaded chapters, or latest-chapter reasoning, call the required CGS MCP tools inside this subtask.

For continuation requests such as “本地之后/已下载之后/续下/后N话”, treat the attached book's source site as the first search target, not as the only target. If the source site is unavailable, returns no exact title/artist match, cannot list episodes, or does not contain enough chapters after the local latest episode, continue trying other plausible cached CGS sites for this same attached book before concluding that no continuation is available.

When multiple cached sites are available, do not stop after only one or two failed/empty sites unless the user explicitly restricted the site. A subtask may finish with “not found / not enough remote chapters” only after it has either found a matching candidate and proven the remote list has no required later chapters, or exhausted the reasonable cached site candidates and reported which sites were tried.

## Do not

- Do not process other attached books.
- Do not report the entire attachedBookList batch as completed from this subtask.
- Do not promise to fetch data later instead of calling tools now.
- Do not output only a plan when a tool action is required.
- Do not treat a 403, empty search result, no exact match, or insufficient remote chapters on one site as global failure while other cached sites remain untried.
- Do not reuse the first attached book's site-search conclusion for a later attached book; each book gets its own site exploration.

## Data

subtask_context=${subtask_context_json}

## Original user request

${user_prompt}
