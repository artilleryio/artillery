# ********************************
# NOTE: Version we use here needs to be kept consistent with that in
# artillery-engine-playwright.
# ********************************
FROM mcr.microsoft.com/playwright:v1.43.1
LABEL maintainer="team@artillery.io"

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
        apt-get install -y bash jq pwgen python2-minimal make g++ curl git zip tree awscli

ARG WORKER_VERSION
ENV WORKER_VERSION=$WORKER_VERSION

WORKDIR /artillery
COPY LICENSE.txt LICENSE.txt
COPY package.json package.json
COPY packages packages

RUN cd /artillery && \
        npm install -w artillery --ignore-scripts --omit=dev && \
        npm cache clean --force && \
        rm -rf /root/.cache && \
        ln -s /artillery/node_modules/.bin/artillery /usr/local/bin/artillery && \
        rm -rf /ms-playwright/firefox* && \
        rm -rf /ms-playwright/webkit* && \
        echo "ok"
 
COPY ./packages/artillery/lib/platform/aws-ecs/worker/loadgen-worker /artillery/loadgen-worker
COPY ./packages/artillery/lib/platform/aws-ecs/worker/helpers.sh /artillery/helpers.sh

RUN chmod +x /artillery/loadgen-worker

ENTRYPOINT ["/artillery/packages/artillery/bin/run"]