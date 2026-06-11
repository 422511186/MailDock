package com.maildock;

import com.maildock.config.AppConfig;
import com.maildock.web.WebVerticle;
import io.vertx.core.AbstractVerticle;
import io.vertx.core.Promise;

/**
 * 应用启动入口。读取环境变量构建 {@link AppConfig}，再部署 {@link WebVerticle}。
 *
 * <p>本类仅做引导接线：配置解析、依赖装配与 HTTP 服务分别由 {@link AppConfig} 与
 * {@link WebVerticle} 负责，二者均有独立测试覆盖，故此处不含业务逻辑。
 *
 * <p>通过 {@code java -jar} 启动时，Vert.x Launcher 会部署本 Verticle。
 */
public final class MainVerticle extends AbstractVerticle {

    @Override
    public void start(Promise<Void> startPromise) {
        AppConfig config;
        try {
            config = AppConfig.from(System.getenv());
        } catch (RuntimeException e) {
            // 配置错误（如缺少密钥）属于致命启动错误，直接失败并给出明确原因
            startPromise.fail(e);
            return;
        }

        vertx.deployVerticle(new WebVerticle(config))
                .onSuccess(id -> startPromise.complete())
                .onFailure(startPromise::fail);
    }
}
