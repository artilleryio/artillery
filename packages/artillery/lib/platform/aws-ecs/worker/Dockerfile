# ********************************
# NOTE: Version we use here needs to be kept consistent with that in
# artillery-engine-playwright.
# ********************************
FROM mcr.microsoft.com/playwright:v1.39.0
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
COPY ./packages/artillery/lib/platform/aws-ecs/worker/dd-agent-setup.sh /artillery/dd-agent-setup.sh

RUN chmod +x /artillery/loadgen-worker

# Datadog install setup

# Install yq to be able to alter the dd-agent config easily later
RUN wget https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -O /usr/bin/yq && \
    chmod +x /usr/bin/yq

# Datadog will not install without API key so we set a placeholder dummy key and replace it later
RUN DD_INSTALL_ONLY=true DD_SITE="datadoghq.com" DD_API_KEY="placeholder_key" bash -c "$(curl -L https://s3.amazonaws.com/dd-agent/scripts/install_script_agent7.sh)"

ENTRYPOINT ["/artillery/loadgen-worker"]