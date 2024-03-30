// TODO - need to force sticky DNS to hit the same scheduler repeatedly.
// Waiting on https://github.com/drwpow/openapi-typescript/issues/1563
import {
    Request as UndiciRequest,
    fetch as undiciFetch,
    Agent as undiciAgent,
} from "undici";
import * as dns from "dns";

export const nodeStickyDnsFetch = (
    input: string | URL | Request,
    init?: RequestInit
) => {
    let url: string;

    if (typeof input === "string") {
        url = input;
    } else if (input instanceof Request) {
        url = input.url;
    } else {
        url = input.toString();
    }

    const test = new UndiciRequest(url, {
        dispatcher: new undiciAgent({
            ...init,
            connect: {
                lookup: staticLookup,
            },
        }),
    });
    return undiciFetch(test);
};

const staticLookup = () => async (hostname: string, _: null, cb: Function) => {
    const ips = await dns.resolve.__promisify__(hostname);

    if (ips.length === 0) {
        throw new Error(`Unable to resolve ${hostname}`);
    }

    cb(null, ips[0], 4);
};
