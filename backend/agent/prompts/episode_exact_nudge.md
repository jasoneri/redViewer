# CGS exact episode selection nudge

## Trigger

The model already called `cgs_list_book_episodes`, but attempted to submit with `episode_select` instead of `episode_selections`.

This means the user request requires precise episode mapping rather than standard `latest`, `first`, or `all` selection.

## Required action

Use the returned `episode_key` values from `cgs_list_book_episodes` and submit with `episode_selections`.

## Do not

- Do not use `episode_select` after a precise episode list lookup.
- Do not downgrade precise ranges, lists, chapter names, exclusions, or continuation requests to `latest/first/all`.
- Do not guess an `episode_key` when mapping is uncertain.

## Exception

If the exact mapping cannot be determined, list nearby candidate episode names from the returned `Episode.name` values and ask the user to choose.
