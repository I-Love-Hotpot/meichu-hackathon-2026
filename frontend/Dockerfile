FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# ARG VITE_API_BASE_URL=https://api.mc.dstw.dev
# ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build
# RUN --mount=type=cache,target=/app/.next/cache npm run build

FROM nginx:alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]