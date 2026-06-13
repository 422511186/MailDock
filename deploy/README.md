# 部署指南

## 架构概览

所有服务通过 Docker 网络互联，Cloudflare Tunnel 作为统一入口对外暴露服务。

```
                        用户请求
                           │
                           ▼
                  Cloudflare 全球网络
                  （HTTPS 终结、DDoS 防护）
                           │
                           ▼ 隧道
┌─────────────────────────────────────────────────────┐
│  宿主机                                              │
│                                                      │
│  cloudflare-shared 网络（internal，无外网出口）        │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐     │
│  │ cloudflared│  │  maildock  │  │   admin    │     │
│  │            │──│            │  │            │     │
│  └─────┬──────┘  └────────────┘  └────────────┘     │
│        │                                             │
│  outbound 网络（bridge，有外网出口）                   │
│        │                                             │
│        ▼                                             │
│   连接 Cloudflare / IMAP 服务器                       │
│                                                      │
│  internal 网络（internal，无外网出口）                  │
│  ┌────────────┐  ┌────────────┐                      │
│  │     db     │  │   redis    │                      │
│  └────────────┘  └────────────┘                      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## 网络说明

| 网络名 | 类型 | 用途 | 外网访问 |
|--------|------|------|---------|
| `cloudflare-shared` | internal | 容器间互通，cloudflared 转发流量用 | ❌ |
| `cloudflare-outbound` | bridge | 需要访问外网的容器使用 | ✅ |
| `internal` | internal | 数据库、缓存等内部服务 | ❌ |

## 启动顺序

```bash
# 1. 先启动 Cloudflare Tunnel（创建共享网络）
cd deploy/cloudflare-tunnel
cp .env.example .env   # 填入 TUNNEL_TOKEN
docker compose up -d

# 2. 再启动业务服务（加入共享网络）
cd deploy/maildock
docker compose up -d
```

## 如何接入新的服务

任何新的 Docker Compose 服务只需 2 步即可对外暴露：

### 第 1 步：在 docker-compose.yml 中加入共享网络

```yaml
# your-service/docker-compose.yml
version: "3.8"
services:
  your-service:
    image: your-image:latest
    container_name: your-service   # 必须指定，Cloudflare 后台用这个名字
    networks:
      - cloudflare-shared          # 加入共享网络
      # - outbound                 # 如果需要访问外网，取消注释

networks:
  cloudflare-shared:
    external: true                 # 声明网络已存在，直接加入
  # outbound:
  #   external: true               # 如果需要访问外网，取消注释
```

### 第 2 步：在 Cloudflare 启用转发规则

在 [Cloudflare 后台](https://one.dash.cloudflare.com) → Networks → Tunnels → 你的隧道 → Public Hostname：

```
Hostname:  your-service.yourdomain.com
Service:   http://your-service:8080
                ↑ 容器名:容器端口
```

保存后即时生效，无需重启任何容器。

## 常见问题

### 容器之间用什么地址互相访问？

用 `container_name` 当主机名。例如 `container_name: maildock`，其他容器访问 `http://maildock:8080`。

### 不加入 outbound 网络会怎样？

容器只能和 `cloudflare-shared` 内的其他容器通信，不能访问外网。这对不需要外网的服务（如 admin 面板）是更安全的配置。

### 宿主机上的服务会被 Docker 容器访问到吗？

如果宿主机服务监听 `0.0.0.0`，容器可以通过 Docker 网关 IP 访问到。如果只监听 `127.0.0.1`，则无法访问。建议敏感的宿主机服务只绑定 `127.0.0.1`。
