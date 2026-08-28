/**
 * A single event parsed out of a `text/event-stream` response.
 */
export type ServerSentEvent = {
    /** The event type. `message` when the server does not send an `event` field. */
    event: string;
    /** The event payload. Multiple `data` lines are joined with newlines. */
    data: string;
    /** The last event ID the server sent, which persists across events. */
    id?: string;
    /** The reconnection time in milliseconds, if the server sent one. */
    retry?: number;
};

/**
 * Parses a `text/event-stream` body into events, following the
 * [server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
 * spec. Comment lines (`: keepalive`) and events with no data are dropped.
 */
export async function* parseEventStream(
    body: ReadableStream<Uint8Array>,
    options: { signal?: AbortSignal } = {},
): AsyncGenerator<ServerSentEvent, void, void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();

    const cancel = () => {
        reader.cancel().catch(() => {});
    };

    if (options.signal?.aborted) {
        cancel();
    } else {
        options.signal?.addEventListener("abort", cancel, { once: true });
    }

    let buffer = "";
    const state = newParserState();

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            const { lines, rest } = takeLines(buffer);
            buffer = rest;

            for (const line of lines) {
                // A blank line dispatches whatever has been collected so far.
                if (line === "") {
                    const dispatched = dispatch(state);

                    state.event = "";
                    state.data = "";
                    state.retry = undefined;

                    if (dispatched) {
                        yield dispatched;
                    }
                    continue;
                }

                applyLine(state, line);
            }
        }
    } finally {
        options.signal?.removeEventListener("abort", cancel);
        reader.releaseLock();
    }
}

type ParserState = {
    event: string;
    data: string;
    /** Persists across events, as the spec requires. */
    lastEventId?: string;
    retry?: number;
};

function newParserState(): ParserState {
    return { event: "", data: "" };
}

/**
 * Splits off every complete line in the buffer, leaving any partial line (and
 * a trailing CR, which may turn out to be the first half of a CRLF) behind.
 */
function takeLines(buffer: string): { lines: string[]; rest: string } {
    const lines: string[] = [];
    let start = 0;
    let i = 0;

    while (i < buffer.length) {
        const char = buffer[i];

        if (char === "\n") {
            lines.push(buffer.slice(start, i));
            i += 1;
            start = i;
            continue;
        }

        if (char === "\r") {
            // Hold a trailing CR until the next chunk tells us whether an LF
            // follows it.
            if (i === buffer.length - 1) {
                break;
            }

            lines.push(buffer.slice(start, i));
            i += buffer[i + 1] === "\n" ? 2 : 1;
            start = i;
            continue;
        }

        i += 1;
    }

    return { lines, rest: buffer.slice(start) };
}

function applyLine(state: ParserState, line: string) {
    // Lines starting with a colon are comments, commonly used as keepalives.
    if (line.startsWith(":")) {
        return;
    }

    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);

    if (value.startsWith(" ")) {
        value = value.slice(1);
    }

    switch (field) {
        case "event":
            state.event = value;
            break;
        case "data":
            state.data += `${value}\n`;
            break;
        case "id":
            // The spec requires ignoring IDs containing a NULL character.
            if (!value.includes("\0")) {
                state.lastEventId = value;
            }
            break;
        case "retry":
            if (/^\d+$/.test(value)) {
                state.retry = Number(value);
            }
            break;
        default:
            // Unknown fields are ignored.
            break;
    }
}

function dispatch(state: ParserState): ServerSentEvent | undefined {
    if (state.data === "") {
        return undefined;
    }

    return {
        event: state.event === "" ? "message" : state.event,
        // The trailing newline added by the last `data` line is not part of
        // the payload.
        data: state.data.replace(/\n$/, ""),
        ...(state.lastEventId !== undefined ? { id: state.lastEventId } : {}),
        ...(state.retry !== undefined ? { retry: state.retry } : {}),
    };
}
