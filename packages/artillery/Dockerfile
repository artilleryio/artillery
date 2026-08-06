FROM node:24.14.1-bookworm-slim
LABEL maintainer="team@artillery.io"

# Installs the published artillery package from the npm registry. Built-in
# plugins/engines ship inside the package (dist/builtin-packages), so the
# image exercises the same artifact and resolution paths as an end-user
# install. ARTILLERY_VERSION is passed by the docker-publish-artillery
# workflow, which runs after the npm publish step.
ARG ARTILLERY_VERSION=latest

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright

RUN npm install -g "artillery@${ARTILLERY_VERSION}" --ignore-scripts

WORKDIR /usr/local/lib/node_modules/artillery
RUN npx playwright install --with-deps chromium

# Make Artillery's dependencies available to scripts mounted anywhere in the
# container.
RUN ln -s /usr/local/lib/node_modules/artillery/node_modules /node_modules
ENV NODE_PATH="/usr/local/lib/node_modules/artillery/node_modules"

ENTRYPOINT ["artillery"]
