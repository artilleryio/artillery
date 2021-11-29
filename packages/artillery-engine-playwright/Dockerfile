FROM mcr.microsoft.com/playwright:v1.16.3
LABEL maintainer="team@artillery.io"

RUN npm install -g artillery artillery-engine-playwright && \
        npm cache clean --force && \
        rm -rf /root/.cache && \
        rm -rf /ms-playwright/firefox-1297/* && \
        rm -rf /ms-playwright/webkit-1564/*

ENTRYPOINT ["/usr/bin/artillery"]
