FROM node:slim

ENV ACCESS_TOKEN=
ENV CONTAINER_ID=
ENV BASE_URL=

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app

COPY --chown=node:node package*.json .
COPY --chown=node:node tsconfig.json .

RUN npm i

COPY --chown=node:node ./src ./src

WORKDIR /home/node/app/tests/container
COPY --chown=node:node ./tests/container/package*.json .
COPY --chown=node:node ./tests/container/tsconfig.json .

RUN npm i

COPY --chown=node:node ./tests/container/src ./src

CMD [ "npm",  "start" ]