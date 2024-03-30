import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./generated/types";

export function getClient({
    accessToken,
    baseUrl = "http://env-scheduler",
    fetch: customFetch,
}: {
    baseUrl?: string;
    accessToken: string;
    fetch?: typeof fetch;
}) {
    const client = createClient<paths>({
        baseUrl,
        fetch: customFetch || fetch,
    });

    const authMiddleware: Middleware = {
        async onRequest(req) {
            req.headers.set("X-CYCLE-ACCESS-KEY", accessToken);
            return req;
        },
    };

    client.use(authMiddleware);
    return client;
}
