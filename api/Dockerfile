FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY mock-data ./mock-data
COPY scripts ./scripts
COPY src ./src

EXPOSE 8000

CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
