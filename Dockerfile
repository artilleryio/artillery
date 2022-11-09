FROM node:16-alpine
LABEL maintainer="team@artillery.io"

WORKDIR /home/node/artillery

COPY package*.json ./
RUN npm --ignore-scripts --production install

COPY . ./
RUN npm link

# keep for backwards compatibility
ENV PATH="/home/node/artillery/bin:${PATH}"

ENTRYPOINT ["/usr/local/bin/artillery"]
