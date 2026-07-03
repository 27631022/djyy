#!/bin/sh
set -e

echo "[djyy] 应用数据库迁移(等待数据库就绪,自动重试)..."
until npx prisma migrate deploy; do
  echo "[djyy] 数据库未就绪,3 秒后重试..."
  sleep 3
done

if [ "$SEED_ON_FIRST_RUN" = "1" ]; then
  USERS=$(node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count().then(function(n){console.log(n);return p.\$disconnect()}).catch(function(){console.log('ERR')})")
  if [ "$USERS" = "0" ]; then
    echo "[djyy] 空库,写入演示种子数据(admin 等账号)..."
    npm run db:seed
  else
    echo "[djyy] 库中已有 $USERS 个用户,跳过种子"
  fi
fi

echo "[djyy] 启动应用 :$PORT ..."
exec node dist/src/main.js
