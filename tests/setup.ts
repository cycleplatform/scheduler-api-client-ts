import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";
import { HttpResponse, http } from "msw";

export const restHandlers = [
    http.post(
        "http://env-scheduler/v1/functions/containerId/claim",
        ({ request }) => {
            if (request.headers.get("X-CYCLE-ACCESS-KEY") !== "accessToken") {
                throw new HttpResponse(null, { status: 403 });
            }

            return HttpResponse.json({
                data: {
                    instance_id: "651586fca6078e98982dbd90",
                    environment: {
                        id: "651586fca6078e98982dbd90",
                        network_subnet: "string",
                        subnet: "string",
                        ipv6: {
                            ip: "fd00::21:0:0:0",
                            cidr: "fd00::21:0:0:0/96",
                        },
                        legacy: {
                            host: 0,
                            subnet: 0,
                            ipv4: {
                                ip: "fd00::21:0:0:0",
                                cidr: "fd00::21:0:0:0/96",
                            },
                        },
                        mac_addr: "string",
                        vxlan_tag: 0,
                    },
                    token: "string",
                },
            });
        }
    ),
];

const server = setupServer(...restHandlers);

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

//  Close server after all tests
afterAll(() => server.close());

// Reset handlers after each test `important for test isolation`
afterEach(() => server.resetHandlers());
