import { expect, test } from "vitest";
import { HttpResponse, http } from "msw";
import { getClient, MessageStreamError, type Message } from "../src/";
import { server } from "./setup";

const encoder = new TextEncoder();

const message = (topic: string, payload: unknown): Message => ({
    time: "2026-08-28T00:00:00.000Z",
    uuid: "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
    topic,
    payload,
    annotations: null,
    durability: null,
    distribution: null,
});

const event = (msg: Message) => `data: ${JSON.stringify(msg)}\n\n`;

/**
 * Streams `chunks` and then either closes, or holds the connection open the
 * way the scheduler does, until the client disconnects.
 */
function eventStream(chunks: string[], { close = true } = {}) {
    return new HttpResponse(
        new ReadableStream({
            start(controller) {
                for (const chunk of chunks) {
                    controller.enqueue(encoder.encode(chunk));
                }

                if (close) {
                    controller.close();
                }
            },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
    );
}

test("streams messages off the bus until the server closes", async () => {
    const first = message("orders.created", { id: 1 });
    const second = message("orders.created", { id: 2 });

    server.use(
        http.get("http://env-scheduler/v1/message/bus", () =>
            eventStream([": keepalive\n\n", event(first), event(second)]),
        ),
    );

    const client = getClient({ accessToken: "accessToken" });
    const received: Message[] = [];

    for await (const msg of client.streamMessages()) {
        received.push(msg);
    }

    expect(received).toEqual([first, second]);
});

test("sends the access key and the channel and topic query params", async () => {
    let request: Request | undefined;

    server.use(
        http.get("http://env-scheduler/v1/message/bus", (info) => {
            request = info.request;
            return eventStream([]);
        }),
    );

    const client = getClient({ accessToken: "accessToken" });

    for await (const _ of client.streamMessages({
        channel: "jobs",
        topics: ["orders.created", "orders.shipped"],
    })) {
        // The handler closes the stream immediately.
    }

    const url = new URL(request!.url);

    expect(request!.headers.get("X-CYCLE-ACCESS-KEY")).toBe("accessToken");
    expect(request!.headers.get("Accept")).toBe("text/event-stream");
    expect(url.searchParams.get("channel")).toBe("jobs");
    // Non-exploded form style - one comma separated value.
    expect(url.searchParams.getAll("topics")).toEqual([
        "orders.created,orders.shipped",
    ]);
});

test("omits query params that were not set", async () => {
    let request: Request | undefined;

    server.use(
        http.get("http://env-scheduler/v1/message/bus", (info) => {
            request = info.request;
            return eventStream([]);
        }),
    );

    const client = getClient({ accessToken: "accessToken" });

    for await (const _ of client.streamMessages({ topics: [] })) {
        // The handler closes the stream immediately.
    }

    expect(new URL(request!.url).search).toBe("");
});

test("respects a base URL override with a trailing slash", async () => {
    server.use(
        http.get("https://my-scheduler.test.com/v1/message/bus", () =>
            eventStream([event(message("test", null))]),
        ),
    );

    const client = getClient({
        accessToken: "accessToken",
        baseUrl: "https://my-scheduler.test.com/",
    });
    const received: Message[] = [];

    for await (const msg of client.streamMessages()) {
        received.push(msg);
    }

    expect(received).toHaveLength(1);
});

test("throws a MessageStreamError carrying the scheduler error", async () => {
    server.use(
        http.get("http://env-scheduler/v1/message/bus", () =>
            HttpResponse.json(
                {
                    data: null,
                    error: {
                        status: 403,
                        code: "403.permissions",
                        title: "Invalid access key",
                    },
                },
                { status: 403 },
            ),
        ),
    );

    const client = getClient({ accessToken: "wrong" });
    const stream = client.streamMessages();

    const error = await stream[Symbol.asyncIterator]()
        .next()
        .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(MessageStreamError);
    expect((error as MessageStreamError).status).toBe(403);
    expect((error as MessageStreamError).error?.code).toBe("403.permissions");
    expect((error as MessageStreamError).message).toContain(
        "Invalid access key",
    );
});

test("throws when an event is not a JSON encoded Message", async () => {
    server.use(
        http.get("http://env-scheduler/v1/message/bus", () =>
            eventStream(["data: not json\n\n"]),
        ),
    );

    const client = getClient({ accessToken: "accessToken" });

    await expect(async () => {
        for await (const _ of client.streamMessages()) {
            // Unreachable - the first event fails to parse.
        }
    }).rejects.toThrow(MessageStreamError);
});

test("close() ends iteration on a stream the server holds open", async () => {
    server.use(
        http.get("http://env-scheduler/v1/message/bus", () =>
            eventStream([event(message("orders.created", { id: 1 }))], {
                close: false,
            }),
        ),
    );

    const client = getClient({ accessToken: "accessToken" });
    const stream = client.streamMessages();
    const received: Message[] = [];

    for await (const msg of stream) {
        received.push(msg);
        stream.close();
    }

    expect(received).toHaveLength(1);
});

test("breaking out of iteration closes the connection", async () => {
    server.use(
        http.get("http://env-scheduler/v1/message/bus", () =>
            eventStream([event(message("orders.created", { id: 1 }))], {
                close: false,
            }),
        ),
    );

    const client = getClient({ accessToken: "accessToken" });
    const received: Message[] = [];

    for await (const msg of client.streamMessages()) {
        received.push(msg);
        break;
    }

    expect(received).toHaveLength(1);
});

test("aborting the caller's signal ends iteration", async () => {
    server.use(
        http.get("http://env-scheduler/v1/message/bus", () =>
            eventStream([event(message("orders.created", { id: 1 }))], {
                close: false,
            }),
        ),
    );

    const client = getClient({ accessToken: "accessToken" });
    const controller = new AbortController();
    const received: Message[] = [];

    for await (const msg of client.streamMessages({
        signal: controller.signal,
    })) {
        received.push(msg);
        controller.abort();
    }

    expect(received).toHaveLength(1);
});

test("an already aborted signal yields nothing", async () => {
    server.use(
        http.get("http://env-scheduler/v1/message/bus", () =>
            eventStream([event(message("orders.created", { id: 1 }))]),
        ),
    );

    const client = getClient({ accessToken: "accessToken" });
    const received: Message[] = [];

    for await (const msg of client.streamMessages({
        signal: AbortSignal.abort(),
    })) {
        received.push(msg);
    }

    expect(received).toHaveLength(0);
});

test("pushes a message with the openapi-fetch client", async () => {
    const pushed = message("orders.created", { id: 1 });

    server.use(
        http.post(
            "http://env-scheduler/v1/message/bus",
            async ({ request }) => {
                expect(await request.json()).toEqual({
                    message: { topic: "orders.created", payload: { id: 1 } },
                    durability: { ttl: 60 },
                });

                return HttpResponse.json(
                    { data: { message: pushed, sent: 2 } },
                    { status: 201 },
                );
            },
        ),
    );

    const client = getClient({ accessToken: "accessToken" });

    const resp = await client.POST("/v1/message/bus", {
        body: {
            message: { topic: "orders.created", payload: { id: 1 } },
            durability: { ttl: 60 },
        },
    });

    expect(resp.response.status).toBe(201);
    expect(resp.data?.data.sent).toBe(2);
    expect(resp.data?.data.message).toEqual(pushed);
});
