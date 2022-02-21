FROM node:14-alpine
LABEL maintainer="team@artillery.io"

WORKDIR /home/node/artillery

COPY package*.json ./
RUN npm --ignore-scripts --production install

RUN npm install artillery-plugin-publish-metrics \
  artillery-plugin-metrics-by-endpoint \
  artillery-plugin-expect

COPY . ./
ENV PATH="/home/node/artillery/bin:${PATH}"

ENTRYPOINT ["/home/node/artillery/bin/run"]
