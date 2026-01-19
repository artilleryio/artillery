FROM node:22-bookworm-slim
LABEL maintainer="team@artillery.io"

WORKDIR /home/node/artillery

COPY package*.json ./
RUN npm --ignore-scripts --production install
RUN npx playwright install --with-deps chromium

COPY . ./
ENV PATH="/home/node/artillery/bin:${PATH}"

ENTRYPOINT ["/home/node/artillery/bin/run"]
