package com.maildock.bootstrap;

import io.vertx.ext.web.Router;

/**
 * 应用运行时：封装 HTTP 所需的 Router 与可关闭资源，
 * 让 WebVerticle 只负责启动与停止服务器，不再承担依赖装配。
 */
public record AppRuntime(Router router, Runnable closeHook) {

    public void close() {
        if (closeHook != null) {
            closeHook.run();
        }
    }
}
