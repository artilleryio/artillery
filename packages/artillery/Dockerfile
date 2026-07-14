FROM node:24.14.1-bookworm-slim
LABEL maintainer="team@artillery.io"

WORKDIR /home/node/artillery
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright

COPY package*.json ./
RUN npm --ignore-scripts --production install
RUN npx playwright install --with-deps chromium

COPY . ./

# Transpile TypeScript sources to dist/ (package main, bin and oclif
# command paths all point at built output). Transpile only (--noCheck):
# type checking runs in CI. The temporary compiler install is removed
# again so it doesn't bloat the image.
RUN npm install --no-save --ignore-scripts typescript@5.9.3 \
    && npx tsc -p tsconfig.build.json --noCheck \
    && rm -rf node_modules/typescript node_modules/.bin/tsc node_modules/.bin/tsserver

ENV PATH="/home/node/artillery/bin:${PATH}"
ENV NODE_PATH="/home/node/artillery/node_modules"
ENTRYPOINT ["/home/node/artillery/bin/run"]
