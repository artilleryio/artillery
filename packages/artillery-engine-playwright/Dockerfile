FROM mcr.microsoft.com/playwright:v1.39.0
LABEL maintainer="team@artillery.io"

RUN npm install -g artillery \
        npm cache clean --force && \
        rm -rf /root/.cache &&

ENTRYPOINT ["/usr/bin/artillery"]
