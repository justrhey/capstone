# ── Build stage ──
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ── Serve stage ──
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# Proxy /api requests to the backend container
RUN { \
  echo 'server {'; \
  echo '    listen 3000;'; \
  echo '    root /usr/share/nginx/html;'; \
  echo '    index index.html;'; \
  echo; \
  echo '    location / {'; \
  echo '        try_files $uri $uri/ /index.html;'; \
  echo '    }'; \
  echo; \
  echo '    location /api/ {'; \
  echo '        proxy_pass http://backend:8080;'; \
  echo '        proxy_set_header Host $host;'; \
  echo '        proxy_set_header X-Real-IP $remote_addr;'; \
  echo '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;'; \
  echo '    }'; \
  echo '}'; \
  } > /etc/nginx/conf.d/default.conf

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
