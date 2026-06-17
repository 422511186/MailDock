package com.maildock.bootstrap;

import com.maildock.config.AppConfig;
import io.vertx.core.Vertx;

@FunctionalInterface
public interface AppRuntimeFactory {
    AppRuntime create(Vertx vertx, AppConfig config);
}
