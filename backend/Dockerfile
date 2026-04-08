FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY data ./data

EXPOSE 8081

CMD ["node", "./src/server.mjs"]
