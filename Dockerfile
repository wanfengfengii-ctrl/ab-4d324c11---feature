# syntax=docker/dockerfile:1

# ---- 依赖层：完整安装（含 devDependencies，供测试与构建使用） ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- 验收层：运行求解器测试套件 + 对 Web 服务的 HTTP 冒烟检查 ----
FROM deps AS verify
COPY . .
ENV WEB_URL=http://web:80
CMD ["npm", "run", "verify"]

# ---- 构建层：类型检查并产出静态文件 ----
FROM deps AS build
COPY . .
RUN npm run build

# ---- 运行层：nginx 托管静态站点（默认目标） ----
FROM nginx:1.27-alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1
CMD ["nginx", "-g", "daemon off;"]
