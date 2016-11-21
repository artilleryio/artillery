FROM node:6.9.1-alpine
RUN npm install -g artillery

VOLUME /artillery
WORKDIR /artillery
