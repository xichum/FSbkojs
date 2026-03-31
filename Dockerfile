FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    openssl \
    curl \
    procps \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN npm init -y && \
    npm install express axios dotenv

COPY index.js /app/index.js

RUN mkdir -p /app/.cache && \
    chmod 777 /app/.cache

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["node", "index.js"]
