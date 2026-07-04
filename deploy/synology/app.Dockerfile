# 党建益友 后端镜像(在群晖上构建;node:22 与 postgres:16 均为多架构镜像,x86_64/ARM64 机型通用)
FROM node:22-bookworm-slim

# Prisma 引擎需要 openssl;tzdata 支持 Asia/Shanghai 时区
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 国内网络用 npmmirror 加速(海外网络可删除本行)
RUN npm config set registry https://registry.npmmirror.com

# 先装依赖,利用 Docker 层缓存(源码改动不触发重装)
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund

# 后端源码(2026-07-03 起开发/生产统一 postgresql,schema/迁移原生即 PG,无需再替换)
COPY backend/ ./

RUN npx prisma generate && npm run build

# 3D 展厅客户端(后端静态托管在 /exhibition/)
COPY exhibition-dist/ /app/exhibition-dist/

COPY entrypoint.sh /entrypoint.sh
# 去除 Windows 换行符,保证脚本可执行
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["/entrypoint.sh"]
