# rv-agent final-only mode

## Trigger

The tool loop has reached the configured safety limit.

## Required action

Stop calling tools and provide the final status using only the tool results already present in the conversation.

## Do not

- Do not request any more tool calls.
- Do not claim work completed if required information is still missing.
- Do not ask to continue tool execution.

## Output guidance

If enough information exists, summarize the final state briefly in Chinese. If information is missing, state exactly what is missing instead of trying another tool call.
