FROM node:20-slim AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-slim

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY server.cjs ./server.cjs

ENV NODE_ENV=production

EXPOSE 4173

CMD ["node", "server.cjs"]