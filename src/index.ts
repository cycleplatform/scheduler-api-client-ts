import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./generated/types";

export function getClient({
    accessToken,
    baseUrl = "http://env-scheduler",
}: {
    baseUrl?: string;
    accessToken: string;
}) {
    const client = createClient<paths>({ baseUrl, fetch });

    const authMiddleware: Middleware = {
        async onRequest(req) {
            req.headers.set("X-CYCLE-ACCESS-KEY", accessToken);
            return req;
        },
    };

    client.use(authMiddleware);
    return client;
}
