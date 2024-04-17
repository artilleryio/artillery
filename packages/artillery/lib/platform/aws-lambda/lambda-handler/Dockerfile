FROM mcr.microsoft.com/playwright:v1.42.1-focal as build-image

# https://steele.blue/playwright-on-lambda/
# https://blog.carlosnunez.me/post/scraping-chromium-lambda-nodeless-zerostress/

ENV DEBIAN_FRONTEND=noninteractive

# Install aws-lambda-ric build dependencies
RUN apt-get update && apt-get install -y \
    g++ \
    make \
    cmake \
    unzip \
    libcurl4-openssl-dev \
    autoconf \
    libtool \
    awscli

# Define custom function directory
ARG FUNCTION_DIR="/function"
# Create function dir
RUN mkdir -p ${FUNCTION_DIR}
WORKDIR ${FUNCTION_DIR}

COPY packages packages
COPY packages/artillery/lib/platform/aws-lambda/lambda-handler/ .
COPY package.json package.json

# Install dependencies
RUN npm install -w artillery --ignore-scripts --omit=dev
RUN npm install aws-lambda-ric
# TODO: add artillery-plugin-sqs-reporter as a depedency instead of installing it here
RUN npm install artillery-plugin-sqs-reporter 

RUN npm cache clean --force \
    && rm -rf /root/.cache \
    && ln -s /function/node_modules/.bin/artillery /usr/local/bin/artillery \
    && rm -rf /ms-playwright/firefox* \
    && rm -rf /ms-playwright/webkit* \
    && echo "ok"

RUN chmod +x ./entrypoint.sh
# ADD aws-lambda-rie /usr/local/bin/aws-lambda-rie
ENTRYPOINT [ "./entrypoint.sh", "index.handler" ]