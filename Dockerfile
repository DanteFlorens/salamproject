# Node 24 + pg client (Postgres снаружи / в compose)
FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js pack.mjs ./
COPY public ./public
COPY src ./src
COPY db ./db

RUN npm run build

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5173
ENV DATABASE_URL=postgresql://salam:salam@db:5432/salam

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.mjs index.html ./
COPY db ./db
COPY public ./public
COPY --from=build /app/dist ./dist
COPY --from=build /app/Salam-Residences.html ./Salam-Residences.html

RUN mkdir -p /app/data

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
