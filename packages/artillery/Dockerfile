FROM node:22-bookworm
LABEL maintainer="team@artillery.io"

RUN apt-get update && apt-get install bash

WORKDIR /home/node/artillery

COPY package*.json ./
RUN npm --ignore-scripts --production install && npm install @playwright/test
RUN npx playwright install --with-deps chromium

COPY . ./
ENV PATH="/home/node/artillery/bin:${PATH}"
ENV NODE_PATH=/home/node/artillery/node_modules

ENTRYPOINT ["/home/node/artillery/bin/run"]
