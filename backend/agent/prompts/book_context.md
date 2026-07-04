# rv-agent context: attached book

## Inputs

Python provides one attached book context as JSON in `book_context`.

## Rules

- User references such as “这本”, “这部”, or “本书” refer to this attached book.
- Do not ask the user for title or artist data that already exists in `book_context`.
- If `artist` or series/title metadata is missing, infer search terms from the raw `book` filename.
- Use `artist` and `title` when calling `cgs_search_books`.
- If the user explicitly names a different book or URL, that explicit instruction overrides this attached context.
- If `kind` is `doujinshi`, treat the book as whole-book content: after choosing a candidate, submit the whole book without chapter-selection questions and without `episode_select` or `episode_selections`.
- If `kind` is `manga`, determine chapter scope before submitting. Use standard metric directives when the user provides latest/first/all, and ask only one minimal clarification when no chapter scope is available.
- If `local_library` exists and the user asks for continuation after already-downloaded chapters, use the local episode facts before listing remote episodes and mapping exact `episode_key` values.
- For continuation, treat this attached book's source site as the first search target, not the only target. If the source site is unavailable, has no exact title/artist match, cannot list episodes, or lacks the requested later chapters, try other plausible cached CGS sites before concluding no continuation is available.

## Do not

- Do not ask for attached-book identity again.
- Do not apply manga chapter-selection logic to `doujinshi`/whole-book entries.
- Do not guess continuation chapters when local episode facts are missing.
- Do not downgrade continuation requests to `episode_select=first/latest/all`.
- Do not stop after one failed, empty, or chapter-insufficient source site while other plausible cached sites remain untried.

## Data

book_context=${book_context_json}
