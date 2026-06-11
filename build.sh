#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "==> 构建前端..."
cd frontend
npm run build
cd ..

echo "==> 复制到 webroot..."
rm -rf backend/src/main/resources/webroot
mkdir -p backend/src/main/resources/webroot
cp -R frontend/dist/. backend/src/main/resources/webroot/

echo "==> 打包后端..."
cd backend
mvn -q -DskipTests package
cd ..

echo "==> 完成"
ls -lh backend/target/maildock-backend-fat.jar
