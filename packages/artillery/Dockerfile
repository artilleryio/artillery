FROM node:24.14.1-bookworm-slim
LABEL maintainer="team@artillery.io"

WORKDIR /home/node/artillery
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright

COPY package*.json ./
RUN npm --ignore-scripts --production install
RUN npx playwright install --with-deps chromium

COPY . ./
ENV PATH="/home/node/artillery/bin:${PATH}"
ENTRYPOINT ["/home/node/artillery/bin/run"]
