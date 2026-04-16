# =============================================================================
# Stage 1: Builder
#
# Compiles native Node.js addons (aws-lambda-ric) and installs CLIs.
# Everything useful is copied to the runtime stage; the rest is discarded.
# This keeps ~500MB of build toolchain (g++, cmake, headers) out of the
# final image.
# =============================================================================
FROM node:24.14.1-bookworm-slim AS builder

# Build tools required to compile aws-lambda-ric (native C++ addon via
# node-gyp). This set adds ~500MB but none of it reaches the final image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ \
    make \
    cmake \
    unzip \
    libcurl4-openssl-dev \
    autoconf \
    libtool \
    curl \
    python3 \
    python3-venv \
    ca-certificates \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# --- AWS CLI v2 (standalone installer) ---
# The old Dockerfile installed v1 via pip, which pulls in botocore (~300MB
# of JSON service definitions for every AWS service). The v2 standalone
# installer is ~200MB — about 40% smaller — and bundles its own Python
# so it doesn't need python3 in the runtime image.
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" \
        -o /tmp/awscliv2.zip \
    && unzip -q /tmp/awscliv2.zip -d /tmp \
    && /tmp/aws/install \
    && rm -rf /tmp/awscliv2.zip /tmp/aws

# --- Azure Storage SDK (replaces the full azure-cli) ---
# The old Dockerfile installed azure-cli==2.76.0 (~800MB-1GB) but only used
# 6 subcommands: login, blob upload/download/download-batch/delete-batch,
# and queue send. We replace it with 3 targeted Python SDK packages (~6MB):
#   azure-storage-blob   - blob operations
#   azure-storage-queue  - queue message operations
#   azure-identity       - service principal authentication
# A small wrapper script (azure-storage-helper) provides the same CLI
# interface that loadgen-worker expects.
RUN python3 -m venv /opt/azure-sdk \
    && /opt/azure-sdk/bin/pip install --no-cache-dir \
        azure-storage-blob \
        azure-storage-queue \
        azure-identity

# --- Artillery application + npm dependencies ---
ARG FUNCTION_DIR="/artillery"
RUN mkdir -p ${FUNCTION_DIR}
WORKDIR ${FUNCTION_DIR}

COPY packages packages
# Lambda handler JS files are placed at the /artillery/ root for
# aws-lambda-ric to find them at runtime.
COPY packages/artillery/lib/platform/aws-lambda/lambda-handler/ .
# Root package.json is needed for the workspace npm install (-w flag).
# It gets deleted after install — only the lambda handler files remain.
COPY package.json package.json

# Install workspace deps. --ignore-scripts skips postinstall hooks
# (faster, avoids side effects). --omit=dev drops test/build-only deps.
RUN npm install -w artillery --ignore-scripts --omit=dev

# aws-lambda-ric is installed separately WITHOUT --ignore-scripts because
# it must run its postinstall step to compile the native C++ addon via
# node-gyp. This is the whole reason the build toolchain exists.
RUN npm install aws-lambda-ric

RUN npm cache clean --force && rm ./package.json


# =============================================================================
# Stage 2: Runtime
#
# Uses the same slim base as the standalone Artillery Docker image
# (packages/artillery/Dockerfile). Key size savings vs the old approach:
#
# OLD: mcr.microsoft.com/playwright:v1.58.1 base image (~2GB)
#   - Ships all 3 browsers (Chromium + Firefox + WebKit) + system deps for
#     all of them. Even after `rm -rf /ms-playwright/firefox* webkit*`, the
#     system libraries for Firefox and WebKit stay behind.
#
# NEW: node:24.14.1-bookworm-slim (~210MB) + chromium-only playwright install
#   - Installs ONLY Chromium and its specific system deps (X11, NSS, fonts,
#     ALSA, mesa). No Firefox/WebKit libraries. Saves ~800-900MB.
# =============================================================================
FROM node:24.14.1-bookworm-slim

ARG TARGETARCH
ENV DEBIAN_FRONTEND=noninteractive

ARG FUNCTION_DIR="/artillery"
RUN mkdir -p ${FUNCTION_DIR}
WORKDIR ${FUNCTION_DIR}

# Copy node_modules first, separately from the rest of the application code.
# This lets Docker cache the expensive playwright browser install step below
# — it only re-runs when dependencies change, not when source code changes.
COPY --from=builder ${FUNCTION_DIR}/node_modules ${FUNCTION_DIR}/node_modules

# ********************************
# NOTE: Playwright version here must be kept consistent with the
# version in artillery-engine-playwright's package.json.
# ********************************
#
# --with-deps installs Chromium's required system libraries via apt:
# X11 (libx11, libxcomposite, libxdamage...), NSS/NSPR (TLS/certs),
# fonts/fontconfig/freetype, ALSA (audio), mesa/EGL (graphics).
RUN npx playwright@1.59.1 install --with-deps chromium

# --- Runtime system packages ---
# These are required by the Fargate worker shell scripts (loadgen-worker):
#   jq       - JSON parsing for metadata, SQS messages
#   pwgen    - generate deduplication IDs for SQS messages
#   curl     - ECS metadata endpoint, general HTTP
#   git      - user test repos may need it
#   zip      - leader packs node_modules.zip for follower workers
#   unzip    - followers unpack node_modules.zip from leader
#   tree     - debug logging of test directory structure
#   procps   - pgrep, used to find Artillery CLI PID
#   python3  - required by azure-storage-helper (its venv references system python3)
#   bash     - worker scripts are bash (base slim image only has dash)
# --no-install-recommends avoids pulling in suggested packages we don't need.
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    jq \
    pwgen \
    curl \
    git \
    zip \
    unzip \
    tree \
    procps \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# The worker script (loadgen-worker) checks for `yarn` in its DEPENDENCIES
# array. Node 24 ships corepack but `yarn` isn't on $PATH until enabled.
RUN corepack enable

# --- AWS CLI v2 (copied from builder, ~200MB) ---
# The standalone v2 installer bundles its own Python runtime, so no system
# python3 dependency. Only the install directory needs copying.
# /usr/local/bin/aws must be a symlink (not a copied binary) because aws
# is a PyInstaller bundle that locates libpython relative to the real
# binary path. COPY resolves symlinks, so we recreate it manually.
COPY --from=builder /usr/local/aws-cli /usr/local/aws-cli
RUN ln -s /usr/local/aws-cli/v2/current/bin/aws /usr/local/bin/aws

# --- Azure Storage SDK + helper script (copied from builder) ---
# The venv is self-contained except for the python3 interpreter symlink.
# python3 was installed above in the runtime packages step.
# Total size: ~6MB (vs ~800MB for the full azure-cli).
COPY --from=builder /opt/azure-sdk /opt/azure-sdk
# The helper script uses #!/opt/azure-sdk/bin/python3 as its shebang,
# so it automatically picks up the venv's installed packages.
COPY ./packages/artillery/lib/platform/aws-ecs/worker/azure-storage-helper /usr/local/bin/azure-storage-helper
RUN chmod +x /usr/local/bin/azure-storage-helper

# --- curl: IPv4 preference + arm64 SSL workaround ---
# Forces IPv4 to avoid DNS/connectivity issues in some container networks.
# The arm64 'insecure' flag works around a curl SSL_ERROR_SYSCALL bug:
# https://github.com/curl/curl/issues/14154
RUN <<EOT
echo 'ipv4' >> ~/.curlrc
if [ "$TARGETARCH" = "arm64" ]; then
echo 'insecure' >> ~/.curlrc
fi
EOT

ARG WORKER_VERSION
ENV WORKER_VERSION=$WORKER_VERSION

# --- Application code ---
# Copy packages and lambda handler files from the builder stage.
# node_modules was already copied above for caching reasons.
COPY --from=builder ${FUNCTION_DIR}/packages ${FUNCTION_DIR}/packages
COPY --from=builder ${FUNCTION_DIR}/a9-handler-dependencies.js ${FUNCTION_DIR}/
COPY --from=builder ${FUNCTION_DIR}/a9-handler-helpers.js ${FUNCTION_DIR}/
COPY --from=builder ${FUNCTION_DIR}/a9-handler-index.js ${FUNCTION_DIR}/

# Fargate worker scripts — copied from the build context (not builder stage)
# because they may change independently of npm dependencies.
COPY ./packages/artillery/lib/platform/aws-ecs/worker/loadgen-worker /artillery/loadgen-worker
COPY ./packages/artillery/lib/platform/aws-ecs/worker/helpers.sh /artillery/helpers.sh

RUN ln -s /artillery/node_modules/.bin/artillery /usr/local/bin/artillery \
    && chmod +x /artillery/loadgen-worker

ENTRYPOINT ["/artillery/packages/artillery/bin/run"]
