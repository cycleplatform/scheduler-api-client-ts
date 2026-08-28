import type { components, operations, paths } from "./generated/types";
import { parseEventStream } from "./sse";

export type Message = components["schemas"]["Message"];
export type Topic = components["schemas"]["Topic"];

type PathForGet<Operation> = {
    [Path in keyof paths]: paths[Path] extends { get: Operation }
        ? Path
        : never;
}[keyof paths];

const MESSAGE_BUS_PATH: PathForGet<operations["getMessages"]> =
    "/v1/message/bus";

export type StreamMessagesOptions = {
    /**
     * The channel to consume messages from. If not set, messages are consumed
     * from the default channel.
     */
    channel?: string;
    /**
     * The topics to consume. If not set, messages from all topics are
     * consumed.
     */
    topics?: Topic[];
    /** Aborting this signal closes the stream and ends iteration. */
    signal?: AbortSignal;
};

/**
 * A live subscription to the environment message bus. Iterate it to receive
 * messages as they are published.
 *
 * The stream is single use - once iteration ends, the connection is closed and
 * a new stream is needed to resubscribe.
 */
export type MessageStream = AsyncIterable<Message> & {
    /** Closes the connection and ends iteration. */
    close: () => void;
};

/** Credentials and transport used to open a message bus stream. */
export type MessageStreamConfig = {
    baseUrl?: string;
    accessToken: string;
    fetch?: typeof fetch;
};

/**
 * Thrown when the message bus stream cannot be opened, or when the server
 * sends something that is not a Message.
 */
export class MessageStreamError extends Error {
    /** The HTTP status, when the stream failed to open. */
    readonly status?: number;
    /** The error returned by the scheduler, if it sent an error envelope. */
    readonly error?: components["schemas"]["Error"];

    constructor(
        message: string,
        details?: {
            status?: number;
            error?: components["schemas"]["Error"];
            cause?: unknown;
        },
    ) {
        super(message, { cause: details?.cause });
        this.name = "MessageStreamError";
        this.status = details?.status;
        this.error = details?.error;
    }
}

/**
 * Subscribes to the environment message bus.
 *
 * ```ts
 * const stream = streamMessages(
 *     { baseUrl: "http://env-scheduler", accessToken: "<ACCESS TOKEN>" },
 *     { topics: ["orders.created"] }
 * );
 *
 * for await (const message of stream) {
 *     console.log(message.topic, message.payload);
 * }
 * ```
 */
export function streamMessages(
    config: MessageStreamConfig,
    options: StreamMessagesOptions = {},
): MessageStream {
    const controller = new AbortController();

    linkSignal(controller, options.signal);

    const doFetch = config.fetch || fetch;
    const connection = doFetch(
        buildUrl(config.baseUrl || "http://env-scheduler", options),
        {
            method: "GET",
            headers: {
                "X-CYCLE-ACCESS-KEY": config.accessToken,
                Accept: "text/event-stream",
                "Cache-Control": "no-cache",
            },
            signal: controller.signal,
        },
    );

    // The connection is opened before anyone iterates the stream - keep a
    // failure from surfacing as an unhandled rejection. `iterate` still sees
    // the rejection when it awaits the same promise.
    connection.catch(() => {});

    const messages = iterate(connection, controller);

    return {
        [Symbol.asyncIterator]: () => messages,
        close: () => {
            controller.abort();
            messages.return().catch(() => {});
        },
    };
}

async function* iterate(
    connection: Promise<Response>,
    controller: AbortController,
): AsyncGenerator<Message, void, void> {
    let response: Response;

    try {
        response = await connection;
    } catch (cause) {
        if (controller.signal.aborted) {
            return;
        }

        throw new MessageStreamError("Failed to open the message bus stream", {
            cause,
        });
    }

    if (!response.ok) {
        throw await toStreamError(response);
    }

    if (!response.body) {
        throw new MessageStreamError(
            "The message bus stream response has no body",
        );
    }

    try {
        const events = parseEventStream(response.body, {
            signal: controller.signal,
        });

        for await (const event of events) {
            yield toMessage(event.data);
        }
    } catch (cause) {
        if (controller.signal.aborted) {
            return;
        }

        throw cause;
    } finally {
        controller.abort();
    }
}

function buildUrl(baseUrl: string, options: StreamMessagesOptions): string {
    const url = new URL(`${baseUrl.replace(/\/+$/, "")}${MESSAGE_BUS_PATH}`);

    if (options.channel !== undefined) {
        url.searchParams.set("channel", options.channel);
    }

    if (options.topics && options.topics.length > 0) {
        url.searchParams.set("topics", options.topics.join(","));
    }

    return url.toString();
}

function linkSignal(controller: AbortController, signal?: AbortSignal) {
    if (!signal) {
        return;
    }

    if (signal.aborted) {
        controller.abort(signal.reason);
        return;
    }

    signal.addEventListener("abort", () => controller.abort(signal.reason), {
        once: true,
    });
}

function toMessage(data: string): Message {
    try {
        return JSON.parse(data) as Message;
    } catch (cause) {
        throw new MessageStreamError(
            "Received an event that is not a JSON encoded Message",
            { cause },
        );
    }
}

async function toStreamError(response: Response): Promise<MessageStreamError> {
    const envelope = await readErrorEnvelope(response);
    const detail = envelope?.error.title || envelope?.error.detail;

    return new MessageStreamError(
        `Failed to open the message bus stream: ${response.status}${
            detail ? ` - ${detail}` : ""
        }`,
        { status: response.status, error: envelope?.error },
    );
}

async function readErrorEnvelope(
    response: Response,
): Promise<components["schemas"]["ErrorEnvelope"] | undefined> {
    try {
        const body = await response.json();

        if (isErrorEnvelope(body)) {
            return body;
        }

        return undefined;
    } catch {
        return undefined;
    }
}

function isErrorEnvelope(
    body: unknown,
): body is components["schemas"]["ErrorEnvelope"] {
    return (
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "object" &&
        (body as { error: unknown }).error !== null
    );
}
