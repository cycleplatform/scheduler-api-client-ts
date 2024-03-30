import { getClient } from "../../../src";

const accessToken = process.env.ACCESS_TOKEN;
if (!accessToken) {
    throw new Error("no ACCESS_TOKEN provided");
}

const baseUrl = process.env.BASE_URL || "http://env-scheduler";

const client = getClient({ accessToken, baseUrl });

const claimToken = "mattoni";

async function claim(containerId: string) {
    console.log(`claiming instance of container ${containerId}`);
    const resp = await client.POST("/v1/functions/{containerId}/claim", {
        params: {
            path: {
                containerId,
            },
        },
        body: {
            token: claimToken,
        },
    });

    if (resp.error) {
        console.log(
            `[claim: ${claimToken}]: failed to claim instance`,
            resp.error
        );
        throw resp.error;
    }

    const instanceId = resp.data.data?.instance_id || "";
    const token = resp.data.data?.token || "";

    console.log(
        `[claim: ${token}] claimed instance cntr:${containerId}/instance:${instanceId}`
    );

    return instanceId;
}

async function spawn(containerId: string, instanceId: string) {
    console.log(`[claim: ${claimToken}] spawning instance ${instanceId}`);

    const resp = await client.POST("/v1/functions/{containerId}/spawn", {
        params: {
            path: {
                containerId,
            },
        },
        body: {
            token: claimToken,
            instance_id: instanceId,
        },
    });

    if (resp.error) {
        console.log(
            `[claim: ${claimToken}]: failed to spawn instance`,
            resp.error
        );
        throw resp.error;
    }

    console.log(
        `[claim: ${claimToken}]: spawned instance cntr:${containerId}/instance:${resp.data.data?.instance_id}`
    );
}

async function release(containerId: string, instanceId: string) {
    console.log(`[claim: ${claimToken}] releasing instance ${instanceId}`);

    const resp = await client.POST("/v1/functions/{containerId}/release", {
        params: {
            path: {
                containerId,
            },
        },
        body: {
            token: claimToken,
            instance_id: instanceId,
        },
    });

    if (resp.error) {
        console.log(
            `[claim: ${claimToken}]: failed to release instance`,
            resp.error
        );
        throw resp.error;
    }

    console.log(
        `[claim: ${claimToken}]: released instance cntr:${containerId}/instance:${resp.data.data?.instance_id}`
    );
}

async function run() {
    const containerId = process.env.CONTAINER_ID;
    if (!containerId) {
        throw new Error("no CONTAINER_ID provided");
    }

    const instanceId = await claim(containerId);
    await spawn(containerId, instanceId);
    await release(containerId, instanceId);
}

run();
