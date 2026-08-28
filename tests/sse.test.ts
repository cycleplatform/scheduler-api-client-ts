import { expect, test } from "vitest";
import { parseEventStream, type ServerSentEvent } from "../src/sse";

const encoder = new TextEncoder();

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
        },
    });
}

async function collect(...chunks: string[]): Promise<ServerSentEvent[]> {
    const events: ServerSentEvent[] = [];

    for await (const event of parseEventStream(streamOf(...chunks))) {
        events.push(event);
    }

    return events;
}

test("parses events split across chunk boundaries", async () => {
    const events = await collect('data: {"a"', ':1}\n\ndata: {"a":2}', "\n\n");

    expect(events).toEqual([
        { event: "message", data: '{"a":1}' },
        { event: "message", data: '{"a":2}' },
    ]);
});

test("parses all newline styles, including a CRLF split across chunks", async () => {
    const events = await collect(
        "data: one\r",
        "\n\r\ndata: two\r\rdata: three\n\n",
    );

    expect(events.map((e) => e.data)).toEqual(["one", "two", "three"]);
});

test("joins multiple data lines with newlines", async () => {
    const events = await collect("data: one\ndata: two\ndata:\n\n");

    expect(events).toEqual([{ event: "message", data: "one\ntwo\n" }]);
});

test("reads event, id, and retry fields", async () => {
    const events = await collect(
        "event: bus\nid: 42\nretry: 3000\ndata: hello\n\n",
    );

    expect(events).toEqual([
        { event: "bus", data: "hello", id: "42", retry: 3000 },
    ]);
});

test("carries the last event ID forward to later events", async () => {
    const events = await collect(
        "id: 1\ndata: one\n\ndata: two\n\nid: 2\ndata: three\n\n",
    );

    expect(events.map((e) => [e.id, e.data])).toEqual([
        ["1", "one"],
        ["1", "two"],
        ["2", "three"],
    ]);
});

test("ignores comments, unknown fields, and invalid retry values", async () => {
    const events = await collect(
        ": keepalive\n\n",
        "\n",
        "unknown: value\nretry: soon\ndata: hello\n\n",
    );

    expect(events).toEqual([{ event: "message", data: "hello" }]);
});

test("handles fields with no value and no space after the colon", async () => {
    const events = await collect("data:hello\n\ndata\n\ndata: \n\n");

    // `data` with no value and `data: ` both produce an empty payload, which
    // is still a dispatched event.
    expect(events.map((e) => e.data)).toEqual(["hello", "", ""]);
});

test("drops an unterminated trailing event", async () => {
    const events = await collect("data: complete\n\ndata: truncated\n");

    expect(events.map((e) => e.data)).toEqual(["complete"]);
});
