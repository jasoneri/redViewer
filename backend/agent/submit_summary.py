"""Submit-result enrichment owned by the candidate/work-state boundary."""

from __future__ import annotations

from typing import Any

from agent.result_badges import ResultBadgeCollector


class SubmitSummaryEnricher:
    def __init__(
        self,
        *,
        arguments: dict[str, Any],
        summary: dict[str, Any],
        candidates: list[dict[str, Any]] | None,
        episode_lookup: dict[str, str] | None,
    ) -> None:
        self._arguments = arguments
        self._summary = summary
        self._candidates = candidates
        self._episode_lookup = episode_lookup

    def enrich(self) -> dict[str, Any]:
        enriched = dict(self._summary)
        badge_collector = ResultBadgeCollector()
        args_copy: dict[str, Any] = dict(self._arguments)
        job = self._summary.get('job')
        if isinstance(job, dict):
            enriched_job = dict(job)
        else:
            enriched_job = None

        episode_selections = self._arguments.get('episode_selections')
        if isinstance(episode_selections, list):
            enriched_rows: list[dict[str, Any]] = []
            for selection in episode_selections:
                if not isinstance(selection, dict):
                    continue
                row = dict(selection)
                book_title = badge_collector.book_title_from_candidates(row.get('book_key'), self._candidates)
                if book_title:
                    row['book_title'] = book_title
                    badge_collector.add('book', book_title)
                episode_titles: list[str] = []
                for episode_key in row.get('episode_keys') or []:
                    title = badge_collector.sanitize_text((self._episode_lookup or {}).get(str(episode_key or '').strip()))
                    if title:
                        episode_titles.append(title)
                        badge_collector.add('ep', title)
                if episode_titles:
                    row['episode_titles'] = episode_titles
                enriched_rows.append(row)
            if enriched_rows:
                args_copy['episode_selections'] = enriched_rows

        book_keys = self._arguments.get('book_keys')
        if isinstance(book_keys, list):
            book_titles = [badge_collector.book_title_from_candidates(book_key, self._candidates) for book_key in book_keys]
            book_titles = [title for title in book_titles if title]
            for title in book_titles:
                badge_collector.add('book', title)
            if book_titles:
                args_copy['book_titles'] = book_titles

        for source in (args_copy, enriched_job, enriched):
            badge_collector.add_payload(source)

        badges = badge_collector.rows(limit=8)
        if badges:
            enriched['badges'] = badges
        if args_copy != self._arguments:
            enriched['arguments'] = args_copy
        if enriched_job is not None:
            if badges:
                enriched_job['badges'] = badges
            enriched['job'] = enriched_job
        return enriched
