FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json ./
COPY worker.js ./
COPY server.js ./
COPY d1-sqlite.js ./
COPY README.md ./

RUN mkdir -p /app/data

ENV PORT=3000
ENV DB_PATH=/app/data/exa-pool.sqlite

EXPOSE 3000

CMD ["node", "--experimental-sqlite", "server.js"]

