# =============================================================================
# Stage 1: Builder
#
# Compiles native Node.js addons (aws-lambda-ric) and installs CLIs.
# Everything useful is copied to the runtime stage; the rest is discarded.
# This keeps ~500MB of build toolchain (g++, cmake, headers) out of the
# final image.
# =============================================================================
FROM dhi.io/node:24-debian13-sfw-dev@sha256:df8622ac78486f140b81a64ba50d3e8ab6bed6d3455af89dd8ab8c32bfa066b3 AS builder

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
# Base: Docker Hardened Images (DHI) Node 24 on Debian 13 (Trixie),
# -sfw-dev variant (ships Socket Firewall tooling alongside dev tools).
# Pinned by multi-arch index digest so amd64 + arm64 builds both resolve
# from the same immutable index. Bump the digest intentionally when DHI
# ships CVE rebuilds.
#
# Dual-use invariant: this image is consumed by
#   (a) the Fargate worker — ENTRYPOINT overridden by the ECS task
#       definition to /artillery/loadgen-worker (bash script);
#   (b) the Artillery GitHub Action — runs the Dockerfile ENTRYPOINT
#       /artillery/packages/artillery/bin/run directly.
# GitHub Actions requires the container to run as root to access
# GITHUB_WORKSPACE. DO NOT add a USER instruction and DO NOT switch to
# a DHI variant that defaults to a nonroot user (e.g. -sfw-ent-dev,
# -prod, distroless) without re-validating the GHA path.
# =============================================================================
FROM dhi.io/node:24-debian13-sfw-dev@sha256:df8622ac78486f140b81a64ba50d3e8ab6bed6d3455af89dd8ab8c32bfa066b3

ARG TARGETARCH
ENV DEBIAN_FRONTEND=noninteractive

ARG FUNCTION_DIR="/artillery"
RUN mkdir -p ${FUNCTION_DIR}
WORKDIR ${FUNCTION_DIR}

# aws-lambda-ric >=4.0.0 resolves the handler module via
# path.resolve(process.env.LAMBDA_TASK_ROOT, '', '<handler>') + .js/.mjs.
# LAMBDA_TASK_ROOT is a *reserved* env var per AWS docs — user-set values
# (Dockerfile ENV or function Environment) get overridden by Lambda at
# runtime back to its convention (/var/task). So instead of fighting the
# env var, make /var/task a symlink to our actual install dir. Lambda
# then resolves handlers at /var/task/a9-handler-*.js, Node follows the
# symlink so __dirname is /artillery, and relative requires + bare
# node_modules lookups resolve against /artillery/ as intended.
RUN rm -rf /var/task && ln -s ${FUNCTION_DIR} /var/task

# Copy node_modules first, separately from the rest of the application code.
# This lets Docker cache the expensive playwright browser install step below
# — it only re-runs when dependencies change, not when source code changes.
COPY --from=builder ${FUNCTION_DIR}/node_modules ${FUNCTION_DIR}/node_modules

# --- Runtime system packages ---
# Worker shell script (loadgen-worker) tools:
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
#
# Chromium runtime libs (list mirrors Playwright 1.59.1's own Debian 13
# profile from playwright-core/src/server/registry/nativeDeps.ts). We
# install them explicitly instead of using `playwright install --with-deps`
# because --with-deps also tries to pull xvfb + x11-common + xfonts-*,
# whose dpkg postinst scripts fail on the DHI Debian 13 hardened base
# (hardened base lacks some system scaffolding those packages assume).
# xvfb and friends are only needed for non-headless test modes, which we
# don't use — so dropping them is both safe and smaller. Several libs
# carry the `t64` suffix on Trixie due to the 64-bit time_t transition.
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
    libasound2t64 \
    libatk-bridge2.0-0t64 \
    libatk1.0-0t64 \
    libatspi2.0-0t64 \
    libcairo2 \
    libcups2t64 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0t64 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

# Playwright version is sourced from node_modules (pinned in
# artillery-engine-playwright's package.json). Keep these in sync.
# No --with-deps: we installed the chromium libs explicitly above.
RUN npx playwright install chromium

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
