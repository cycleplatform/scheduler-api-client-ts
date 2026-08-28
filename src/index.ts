import createClient, { type Client, type Middleware } from "openapi-fetch";
import type { paths } from "./generated/types";
import {
    streamMessages,
    type MessageStream,
    type StreamMessagesOptions,
} from "./messages";

export type SchedulerClient = Client<paths> & {
    /**
     * Subscribes to the environment message bus, yielding messages as they are
     * published. See {@link streamMessages}.
     */
    streamMessages: (options?: StreamMessagesOptions) => MessageStream;
};

export function getClient({
    accessToken,
    baseUrl = "http://env-scheduler",
    fetch: customFetch,
}: {
    baseUrl?: string;
    accessToken: string;
    fetch?: typeof fetch;
}): SchedulerClient {
    const client = createClient<paths>({
        baseUrl,
        fetch: customFetch || fetch,
    });

    const authMiddleware: Middleware = {
        async onRequest({ request }) {
            request.headers.set("X-CYCLE-ACCESS-KEY", accessToken);
            return request;
        },
    };

    client.use(authMiddleware);

    // The message bus GET is a server-sent event stream
    return Object.assign(client, {
        streamMessages: (options?: StreamMessagesOptions) =>
            streamMessages(
                { baseUrl, accessToken, fetch: customFetch },
                options,
            ),
    });
}

export {
    MessageStreamError,
    streamMessages,
    type Message,
    type MessageStream,
    type MessageStreamConfig,
    type StreamMessagesOptions,
    type Topic,
} from "./messages";

export { parseEventStream, type ServerSentEvent } from "./sse";

export type { components, operations, paths } from "./generated/types";
