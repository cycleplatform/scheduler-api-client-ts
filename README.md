# Cycle Scheduler API Client - Typescript

_This is an auto-generated API client based on the [OpenAPI Spec for Cycle](https://github.com/cycleplatform/api-spec). Please do not open any PRs for the generated code under /src/generated. If you have any questions on what changes are made in the latest version, please refer to the spec above._

## Basics

This client utilizes [openapi-typescript](https://github.com/drwpow/openapi-typescript) to generate the type definitions for our client. The client itself is a pre-built [openapi-fetch](https://github.com/drwpow/openapi-typescript/tree/main/packages/openapi-fetch) client for convenience.

Every request should be typesafe, and only endpoints described in the spec will be valid in Typescript as the first parameter to `get`, `post`, `patch` etc.

## Usage

### Installation

```bash
npm i @cycleplatform/scheduler-api-client
```

### Getting an Access Key

Access keys can be configured on the scheduler service config in the Portal or through Cycle's main API.

### Making a Request

```ts
import { getClient } from "@cycleplatform/api-client-typescript";

const client = getClient({ accessToken: "<ACCESS TOKEN>" });

const resp = await client.POST("/v1/functions/{containerId}/claim", {
    params: {
        path: {
            containerId: "containerId",
        },
    },
});

console.log(resp.data);
```

### Overriding the Base URL

In some cases it may be necessary to override the default URL of `http://env-scheduler`. For example, you may be accessing the scheduler from outside of the Environment.

```ts
import { getClient } from "@cycleplatform/api-client-typescript";

const client = getClient({
    accessToken: "<ACCESS TOKEN>",
    baseUrl: "https://my-scheduler.test.com",
});

const resp = await client.POST("/v1/functions/{containerId}/claim", {
    params: {
        path: {
            containerId: "containerId",
        },
    },
});

console.log(resp.data);
```

### The Message Bus

The message bus is a pub/sub service built into the scheduler that can be used to
push messages to many listeners within an environment.

Pushing a message onto the bus is a normal request:

```ts
const resp = await client.POST("/v1/message/bus", {
    body: {
        message: {
            topic: "orders.created",
            payload: { id: "1234" },
        },
        durability: { ttl: 60 },
    },
});

console.log(`sent to ${resp.data?.data.sent} consumers`);
```

Consuming is a stream. The scheduler answers `GET /v1/message/bus` with a
[server-sent event](https://html.spec.whatwg.org/multipage/server-sent-events.html)
stream that is held open until the client disconnects. Use `client.streamMessages()` which subscribes and yields each `Message` as it is published:

```ts
const stream = client.streamMessages({
    channel: "jobs",
    topics: ["orders.created", "orders.shipped"],
});

for await (const message of stream) {
    console.log(message.topic, message.payload);
}
```

Iteration ends when the server closes the stream; to stop before that, `break` out of the loop, call `stream.close()`, or abort a signal passed in as `signal`. Each stream is single use - call `streamMessages` again to resubscribe.

If the stream cannot be opened, the first read throws a `MessageStreamError`
carrying the status and the scheduler's error:

```ts
import { MessageStreamError } from "@cycleplatform/scheduler-api-client";

try {
    for await (const message of client.streamMessages()) {
        console.log(message);
    }
} catch (err) {
    if (err instanceof MessageStreamError) {
        console.error(err.status, err.error?.code);
    }
}
```

#### Staying Subscribed

A stream ends whenever its connection does. A long lived consumer should
treat that as routine and resubscribe, backing off so that a scheduler restart
isn't met by every consumer reconnecting at once:

```ts
import {
    getClient,
    MessageStreamError,
} from "@cycleplatform/scheduler-api-client";

const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 30_000;

const client = getClient({ accessToken: "<ACCESS TOKEN>" });
const shutdown = new AbortController();

let attempt = 0;

while (!shutdown.signal.aborted) {
    try {
        const stream = client.streamMessages({
            topics: ["orders.created"],
            signal: shutdown.signal,
        });

        for await (const message of stream) {
            // The connection is working, so start the next backoff from zero.
            attempt = 0;
            console.log(message.topic, message.payload);
        }
    } catch (err) {
        // A rejected access key will not fix itself - don't retry it forever.
        if (err instanceof MessageStreamError && err.status === 403) {
            throw err;
        }

        console.error("message bus stream failed", err);
    }

    if (shutdown.signal.aborted) {
        break;
    }

    const backoff = Math.min(RETRY_BASE_MS * 2 ** attempt++, RETRY_MAX_MS);

    // Jitter keeps a fleet of consumers from reconnecting in lockstep.
    await sleep(backoff * (0.5 + Math.random() / 2), shutdown.signal);
}

function sleep(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve) => {
        const done = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            resolve();
        };

        const timer = setTimeout(done, ms);
        signal.addEventListener("abort", done, { once: true });
    });
}
```

Aborting `shutdown` ends both the current stream and the loop, and cuts any
pending backoff short. Note that `attempt` is only reset once a message actually
arrives - a stream that opens and immediately closes keeps backing off rather
than reconnecting in a tight loop.

Messages published while a consumer is between connections are only redelivered
if they were pushed with a `durability.ttl` that hasn't expired yet.

## Development

### Cloning submodules

`git submodule update --recursive --remote`

### Building

To build a local copy of this client, run `npm run build:lib` to create a `./dist` folder with the necessary files.

### Testing

`npm run test:ts && npm run test`
