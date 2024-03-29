import { expect, test } from "vitest";
import { getClient } from "../src/";

test("test making basic request", async () => {
  const client = getClient({ accessToken: "accessToken" });

  const resp = await client.POST("/v1/functions/{containerId}/claim", {
    params: {
      path: {
        containerId: "containerId",
      },
    },
  });

  expect(resp.response.status).toBe(200);
  expect(resp.data?.data?.instance_id).toBe("651586fca6078e98982dbd90");
});
