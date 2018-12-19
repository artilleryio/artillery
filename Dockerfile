FROM node:10-alpine
LABEL maintainer="team@artillery.io"

WORKDIR /home/node/artillery

COPY bin bin
COPY core core
COPY lib lib
COPY LICENSE.txt LICENSE.txt
COPY README.md README.md
COPY console-reporter.js console-reporter.js
COPY util.js util.js
COPY package.json package.json

RUN npm --ignore-scripts --production install

ENTRYPOINT ["/home/node/artillery/bin/artillery"]
