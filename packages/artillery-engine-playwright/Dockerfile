FROM mcr.microsoft.com/playwright:v1.43.1
LABEL maintainer="team@artillery.io"

RUN npm install -g artillery \
        npm cache clean --force && \
        rm -rf /root/.cache && \
        rm -rf /ms-playwright/firefox* && \
        rm -rf /ms-playwright/webkit*

ENTRYPOINT ["/usr/bin/artillery"]
