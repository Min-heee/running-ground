FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./
RUN npm ci --omit=dev
COPY release-environment.cjs ./
COPY src ./src
COPY data ./data
# One-off operational scripts (retro corrections etc.) — runnable via `compose exec api node ./scripts/...`
COPY scripts ./scripts

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.BACKEND_PORT || '8081') + '/api/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "./src/server.mjs"]
