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

const client = getClient({ accessToken: "<ACCESS TOKEN>", baseUrl: "https://my-scheduler.test.com });

const resp = await client.POST("/v1/functions/{containerId}/claim", {
  params: {
    path: {
      containerId: "containerId",
    },
  },
});

console.log(resp.data);
```

## Development

### Cloning submodules

`git submodule update --recursive --remote`

### Building

To build a local copy of this client, run `npm run build:lib` to create a `./dist` folder with the necessary files.

### Testing

`npm run test:ts && npm run test`
