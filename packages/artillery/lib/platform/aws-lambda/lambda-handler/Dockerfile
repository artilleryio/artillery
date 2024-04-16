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
    libtool 

# Define custom function directory
ARG FUNCTION_DIR="/function"
# Create function dir and install node packages
RUN mkdir -p ${FUNCTION_DIR}

WORKDIR ${FUNCTION_DIR}

# COPY ./index.js .
# COPY ./dependencies.js .
# COPY ./package.json .

COPY package.json package.json
COPY packages packages
COPY packages/artillery/lib/platform/aws-lambda/lambda-handler/index.js index.js
# COPY packages/artillery/lib/platform/aws-lambda/lambda-handler/dependencies.js dependencies.js
COPY packages/artillery/lib/platform/aws-lambda/lambda-handler/entrypoint.sh entrypoint.sh

RUN npm install -w artillery --ignore-scripts --omit=dev
RUN npm install aws-lambda-ric
RUN npm install artillery-plugin-sqs-reporter
# RUN npm run build
# RUN npm install -w artillery --ignore-scripts --omit=dev

RUN npm cache clean --force \
    && rm -rf /root/.cache \
    && ln -s /function/node_modules/.bin/artillery /usr/local/bin/artillery \
    && rm -rf /ms-playwright/firefox* \
    && rm -rf /ms-playwright/webkit* \
    && echo "ok"

# COPY ./entrypoint.sh /entry_script.sh
RUN chmod +x ./entrypoint.sh
ADD aws-lambda-rie /usr/local/bin/aws-lambda-rie
ENTRYPOINT [ "./entrypoint.sh", "index.handler" ]

# ENTRYPOINT ["/usr/local/bin/npx", "aws-lambda-ric"]
# CMD ["index.handler"]