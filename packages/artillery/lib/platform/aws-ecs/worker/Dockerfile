# ********************************
# NOTE: Version we use here needs to be kept consistent with that in
# artillery-engine-playwright.
# ********************************
FROM mcr.microsoft.com/playwright:v1.55.0

ARG TARGETARCH

ENV DEBIAN_FRONTEND=noninteractive

# Install aws-lambda-ric build dependencies
RUN apt-get update && apt-get install -y \
    g++ \
    make \
    cmake \
    unzip \
    libcurl4-openssl-dev \
    autoconf \
    libtool \
    python3-pip && pip3 install awscli --break-system-packages && pip3 install azure-cli==2.76.0 --break-system-packages

RUN <<EOT
echo 'ipv4' >> ~/.curlrc
if [ "$TARGETARCH" = "arm64" ]; then
# Temporal fix for SSL_ERROR_SYSCALL error on arm64
# see: https://github.com/curl/curl/issues/14154
echo 'insecure' >> ~/.curlrc
fi
EOT

ARG WORKER_VERSION
ENV WORKER_VERSION=$WORKER_VERSION

# Additional dependencies for Fargate
RUN apt-get install -y bash jq pwgen curl git zip tree

# Define custom function directory
ARG FUNCTION_DIR="/artillery"
RUN mkdir -p ${FUNCTION_DIR}
WORKDIR ${FUNCTION_DIR}

COPY packages packages
COPY packages/artillery/lib/platform/aws-lambda/lambda-handler/ .
COPY package.json package.json

## Copy Fargate worker files
COPY ./packages/artillery/lib/platform/aws-ecs/worker/loadgen-worker /artillery/loadgen-worker
COPY ./packages/artillery/lib/platform/aws-ecs/worker/helpers.sh /artillery/helpers.sh
COPY ./packages/artillery/lib/platform/aws-ecs/worker/check-license.mjs /artillery/check-license.mjs
# Install dependencies
RUN npm install -w artillery --ignore-scripts --omit=dev
RUN npm install aws-lambda-ric

RUN npm cache clean --force \
    && rm ./package.json \
    && rm -rf /root/.cache \
    && ln -s /artillery/node_modules/.bin/artillery /usr/local/bin/artillery \
    && rm -rf /ms-playwright/firefox* \
    && rm -rf /ms-playwright/webkit* \
    && echo "ok"

RUN chmod +x /artillery/loadgen-worker

ENTRYPOINT ["/artillery/packages/artillery/bin/run"]
