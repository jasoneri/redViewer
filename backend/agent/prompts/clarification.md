# rv-agent intent: minimal clarification

## Trigger

The current task chain is missing required slot information: `${missing}`.

## Required action

Ask exactly one minimal clarification question that obtains the missing slot.

## Do not

- Do not repeat or reconfirm information that is already known.
- Do not ask multiple questions in one response.
- Do not ask “是否继续” or any equivalent continuation confirmation.
- Do not turn a missing-slot clarification into a new search when the existing state can answer it.

## Success criteria

After the missing slot is provided, execute the next required CGS MCP action directly instead of asking for another confirmation.
