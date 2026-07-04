# rv-agent context: attached book list

## Inputs

Python provides `attached_book_list`, preserving the order shown in redViewer mobile.

## Rules

- User references such as “每本”, “全部附加书”, “这些书”, or “attached books” refer to this list unless the user explicitly names another book or URL.
- Process each listed book independently, using the entry-specific `kind`, metadata, source, and local-library summary.
- For `doujinshi` entries, select a candidate and submit the whole book without manga chapter questions.
- For `manga` entries, use standard chapter metrics when provided; ask one minimal clarification only when chapter scope is missing.
- For continuation requests such as “已下载之后/续下/已下载的后N话”, use the matching entry's `local_library` facts before remote episode mapping.
- For each continuation entry, try the entry's source site first, then continue through other plausible cached CGS sites when the source site is blocked, empty, mismatched, episode-list unsupported, or lacks the requested later chapters.

## Do not

- Do not ask for book names or authors already present in the attached list.
- Do not collapse the list into a single book.
- Do not mark the whole list complete from a single subtask.
- Do not mix preferences or local-library facts across different attached books.
- Do not stop site exploration for one attached book because another attached book succeeded or failed on a site.
- Do not report an attached book as unavailable after only one or two failed/empty sites while other plausible cached sites remain untried.

## Data

attached_book_list=${attached_book_list_json}
