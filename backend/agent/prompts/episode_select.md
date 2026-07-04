# rv-agent intent: standard episode selector

## Trigger

The user has already provided a standard chapter metric: `${metric_human}`.

This directive applies only to standard `latest`, `first`, or `all` metrics. It does not apply to continuation requests such as “已下载之后/续下”, nor to precise chapter ranges, chapter-name matching, exclusions, or any request that already required `cgs_list_book_episodes`.

## Required action

Call `cgs_submit_books` directly with:

```json
"episode_select": ${episode_select_json}
```

## Do not

- Do not ask the user to confirm chapter selection.
- Do not ask whether to continue.
- Do not reinterpret this metric as a precise `episode_key` mapping task.
- Do not downgrade a precise or continuation request into this directive.

## Success criteria

Proceed to submission using the current selected/candidate book and the provided `episode_select` value.
