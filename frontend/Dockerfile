# --- build the static site ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# "same-origin": the API is reverse-proxied under /api by nginx below
ARG VITE_API_URL=same-origin
ARG VITE_YOUTUBE_API_KEY=
ENV VITE_API_URL=$VITE_API_URL VITE_YOUTUBE_API_KEY=$VITE_YOUTUBE_API_KEY
RUN npx vite build

# --- serve ---
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
