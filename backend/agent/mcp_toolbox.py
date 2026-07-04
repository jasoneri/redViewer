"""Single upstream MCP facade for CGS agent turns."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from agent.candidate_context import CandidateContext
from agent.llm_turn import LlmTurnCollector, LlmTurnResult
from agent.progress_monitor import CgsProgressMonitor
from agent.progress_snapshot import CgsProgressReader
from agent.prompt_context import PromptMessageBuffer
from agent.result_codec import McpResultCodec
from agent.session_state import TurnSessionState
from agent.tool_catalog import McpToolCatalog, McpToolCatalogLoader
from agent.tool_executor import ToolCallExecutor, ToolExecutionOutcome


class McpToolbox:
    """Facade for catalog, visibility, dispatch, and tool-step conversion."""

    _client: Any
    _catalog: McpToolCatalog
    _turn_session: TurnSessionState
    _executor: ToolCallExecutor
    _result_codec: McpResultCodec

    def __init__(
        self,
        *,
        client: Any,
        catalog: McpToolCatalog,
        turn_session: TurnSessionState,
        executor: ToolCallExecutor,
        result_codec: McpResultCodec,
    ) -> None:
        self._client = client
        self._catalog = catalog
        self._turn_session = turn_session
        self._executor = executor
        self._result_codec = result_codec

    def require_required_tools(self) -> None:
        self._catalog.require_required_tools()

    def cached_sites_context_message(self) -> dict[str, Any] | None:
        return self._catalog.cached_sites_context_message()

    async def collect_llm_turn(
        self,
        llm_turn_collector: LlmTurnCollector,
        messages: PromptMessageBuffer,
    ) -> LlmTurnResult:
        return await llm_turn_collector.collect_prompt(messages, self._catalog.llm_tools)

    def progress_monitor(self, progress_reader: CgsProgressReader | None = None) -> CgsProgressMonitor:
        return CgsProgressMonitor(
            client=self._client,
            tool_names=self._catalog.tool_names,
            progress_reader=progress_reader,
        )

    async def reset_work_state(self) -> tuple[str, dict[str, Any]]:
        result = await self._client.call_tool('cgs_reset_work_state', {})
        if self._result_codec.is_error(result):
            raise HTTPException(
                502,
                {
                    'code': 'mcp_reset_failed',
                    'message': self._result_codec.truncate(self._result_codec.text_from_result(result)),
                },
            )
        self._turn_session.clear_after_successful_reset()
        return 'tool_step', {
            'name': 'cgs_reset_work_state',
            'arguments': {},
            'result': self._result_codec.tool_summary('cgs_reset_work_state', result),
        }

    async def execute_tool_call(
        self,
        call: dict[str, Any],
        messages: PromptMessageBuffer,
    ) -> ToolExecutionOutcome:
        return await self._executor.execute(call, messages)


class McpToolboxLoader:
    def __init__(
        self,
        *,
        client: Any,
        endpoint_base_url: str,
        turn_session: TurnSessionState,
        candidate_context: CandidateContext,
    ) -> None:
        self._client = client
        self._endpoint_base_url = endpoint_base_url
        self._turn_session = turn_session
        self._candidate_context = candidate_context

    async def load(self) -> McpToolbox:
        catalog = await McpToolCatalogLoader(self._client, self._endpoint_base_url).load()
        result_codec = McpResultCodec()
        executor = ToolCallExecutor(
            client=self._client,
            candidate_context=self._candidate_context,
            llm_tool_names=catalog.llm_tool_names,
            result_codec=result_codec,
        )
        return McpToolbox(
            client=self._client,
            catalog=catalog,
            turn_session=self._turn_session,
            executor=executor,
            result_codec=result_codec,
        )
