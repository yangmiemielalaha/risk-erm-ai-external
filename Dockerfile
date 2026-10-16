FROM harbor.gtjaqh.io/library/node:22 AS build

WORKDIR /opt/app

ARG VITE_BASE_PATH=/risk-erm-ai/
ENV VITE_BASE_PATH=${VITE_BASE_PATH}

COPY package.json package-lock.json ./
RUN npm ci --registry http://nexus.gtjaqh.net/repository/npm-group/

COPY . .
RUN npm run build && npm prune --omit=dev

FROM harbor.gtjaqh.io/library/node:22 AS publish

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

WORKDIR /opt/app

COPY --from=build /opt/app/package.json /opt/app/package-lock.json ./
COPY --from=build /opt/app/node_modules ./node_modules
COPY --from=build /opt/app/dist ./dist
COPY --from=build /opt/app/server ./server

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server/index.js"]
