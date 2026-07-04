# CGS cached sites context

## Inputs

Python provides a cached `cgs_list_sites` result from rv-backend local metadata cache.

## Rules

- Use the cached sites to choose or disambiguate CGS site targets.
- Treat this cache as already provided context for the current turn.
- For attached-book continuation tasks, cached sites form the fallback search pool after the attached source site.
- If a searched site returns 403, an empty result, no exact title/artist match, unsupported episode listing, or not enough later chapters, try another plausible cached site unless the user explicitly restricted the site.
- Keep site exploration scoped to the current attached book; a failed site for one book does not prove failure for another attached book.
- When ending with no usable continuation candidate, state which site targets were tried.

## Do not

- Do not call `cgs_list_sites` when this cached context is sufficient.
- Do not ask the user to provide the site list again.
- Do not stop after one or two failed cached sites while other plausible cached sites remain untried.

## Data

cached_sites=${cached_sites_json}
