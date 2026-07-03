"""CGS MCP client (streamable-http) used by the agent loop.

``LiveCgsMcpClient`` is duck-typed on the endpoint shape (``base_url`` +
``token``) so this module does not need to import the CGS service-discovery
types that live in the route. The client factory hook stays on the route module
(``cgs.cgs_mcp_client_factory``) for test injection and is passed in here.
"""

from __future__ import annotations

from typing import Any, Protocol

import httpx

from agent.transport.mcp_tools import McpToolDescription
from agent.result_codec import McpResultCodec


class _McpEndpointLike(Protocol):
    base_url: str
    token: str


class LiveCgsMcpClient:
    def __init__(self, endpoint: _McpEndpointLike):
        self._endpoint = endpoint
        self._http_client: httpx.AsyncClient | None = None
        self._stream_context = None
        self._session_context = None
        self._session = None
        self._result_codec = McpResultCodec()

    async def __aenter__(self):
        from mcp import ClientSession
        from mcp.client.streamable_http import streamable_http_client

        headers = {'Authorization': f'Bearer {self._endpoint.token}'} if self._endpoint.token else {}
        self._http_client = httpx.AsyncClient(
            headers=headers,
            timeout=httpx.Timeout(30.0, read=300.0),
            follow_redirects=True,
        )
        await self._http_client.__aenter__()
        self._stream_context = streamable_http_client(f'{self._endpoint.base_url}/mcp', http_client=self._http_client)
        streams = await self._stream_context.__aenter__()
        read_stream, write_stream = streams[0], streams[1]
        self._session_context = ClientSession(read_stream, write_stream)
        self._session = await self._session_context.__aenter__()
        await self._session.initialize()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        try:
            if self._session_context is not None:
                await self._session_context.__aexit__(exc_type, exc, tb)
        finally:
            try:
                if self._stream_context is not None:
                    await self._stream_context.__aexit__(exc_type, exc, tb)
            finally:
                if self._http_client is not None:
                    await self._http_client.__aexit__(exc_type, exc, tb)

    async def list_tools(self) -> list[dict[str, Any]]:
        result = await self._session.list_tools()
        return [McpToolDescription(tool).normalized() for tool in result.tools]

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        return self._result_codec.to_jsonable(await self._session.call_tool(name, arguments))


def make_cgs_mcp_client(endpoint: _McpEndpointLike, factory: Any = None):
    if factory is not None:
        return factory(endpoint)
    return LiveCgsMcpClient(endpoint)
