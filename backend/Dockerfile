FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY api-docs ./api-docs
COPY resources ./resources
COPY scripts ./scripts
COPY src ./src

EXPOSE 3001

CMD ["npm", "start"]
