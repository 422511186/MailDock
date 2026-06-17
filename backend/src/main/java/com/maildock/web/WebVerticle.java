package com.maildock.web;

import com.maildock.bootstrap.AppRuntime;
import com.maildock.bootstrap.AppRuntimeFactory;
import com.maildock.bootstrap.AppWiring;
import com.maildock.config.AppConfig;
import io.vertx.core.AbstractVerticle;
import io.vertx.core.Promise;

/**
 * 应用主 Verticle：只负责基于 AppRuntime 启动/停止 HTTP 服务。
 * 依赖装配下沉到 bootstrap 层，避免此处继续膨胀成全局装配中心。
 */
public final class WebVerticle extends AbstractVerticle {

    private final AppConfig config;
    private final AppRuntimeFactory runtimeFactory;
    private AppRuntime runtime;
    private int actualPort;

    public WebVerticle(AppConfig config) {
        this(config, new AppWiring());
    }

    public WebVerticle(AppConfig config, AppRuntimeFactory runtimeFactory) {
        this.config = config;
        this.runtimeFactory = runtimeFactory;
    }

    public int actualPort() {
        return actualPort;
    }

    @Override
    public void start(Promise<Void> startPromise) {
        runtime = runtimeFactory.create(vertx, config);
        vertx.createHttpServer()
                .requestHandler(runtime.router())
                .listen(config.httpPort())
                .onComplete(ar -> {
                    if (ar.failed()) {
                        runtime.close();
                        runtime = null;
                        startPromise.fail(ar.cause());
                        return;
                    }
                    actualPort = ar.result().actualPort();
                    System.out.println("MailDock 已启动，监听端口: " + actualPort);
                    startPromise.complete();
                });
    }

    @Override
    public void stop() {
        if (runtime != null) {
            runtime.close();
            runtime = null;
        }
    }
}
