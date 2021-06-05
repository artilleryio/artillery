FROM node:12-alpine
LABEL maintainer="team@artillery.io"

WORKDIR /home/node/artillery

COPY package*.json ./
RUN npm --ignore-scripts --production install

COPY . ./
ENV PATH="/home/node/artillery/bin:${PATH}"

ENTRYPOINT ["/home/node/artillery/bin/artillery"]
