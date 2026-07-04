"""Compatibility entrypoint for the rv-agent turn runner.

Production ownership lives in ``AgentTurnRunner`` and its per-turn owners.
This module keeps the historical ``run_turn`` import path while constructing
the LLM collector and delegating the stream.
"""

from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator, Callable

import httpx

from agent.contract import CgsMcpChatRequest
from agent.llm_turn import LlmStream, LlmTurnCollector
from agent.prompt_templates import render_prompt
from agent.transport.chat_completions import openai_chat_stream
from agent.progress_snapshot import CgsProgressReader
from agent.turn_runner import AgentTurnRunner

_LOOP_ITERATION_LIMIT = 16

ClientFactory = Callable[[Any], Any]

async def run_turn(
    req: CgsMcpChatRequest,
    *,
    endpoint: Any,
    make_client: ClientFactory,
    llm_transport: httpx.AsyncBaseTransport | None,
    llm_stream: LlmStream = openai_chat_stream,
    progress_reader: CgsProgressReader | None = None,
    loop_iteration_limit: int = _LOOP_ITERATION_LIMIT,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Run one agent turn and yield ``(event, payload)`` tuples."""
    llm_turn_collector = LlmTurnCollector(
        req=req,
        llm_transport=llm_transport,
        stream=llm_stream,
        sleep=asyncio.sleep,
    )
    runner = AgentTurnRunner(
        req=req,
        endpoint=endpoint,
        make_client=make_client,
        llm_turn_collector=llm_turn_collector,
        progress_reader=progress_reader,
        loop_iteration_limit=loop_iteration_limit,
        final_only_message=render_prompt('final_only.md'),
    )
    async for event in runner.run():
        yield event
