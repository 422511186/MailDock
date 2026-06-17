package com.maildock.web;

import com.maildock.bootstrap.AppRuntime;
import com.maildock.config.AppConfig;
import io.vertx.core.Vertx;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.client.WebClient;
import io.vertx.junit5.VertxExtension;
import io.vertx.junit5.VertxTestContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(VertxExtension.class)
class WebVerticleWiringTest {

    private static final String KEY = "0123456789abcdef0123456789abcdef";

    private Vertx vertx;
    private WebClient client;

    @BeforeEach
    void setUp() {
        vertx = Vertx.vertx();
        client = WebClient.create(vertx);
    }

    @AfterEach
    void tearDown() throws Exception {
        if (vertx != null) {
            vertx.close().toCompletionStage().toCompletableFuture().get(10, TimeUnit.SECONDS);
        }
    }

    @Test
    void startUsesInjectedRuntimeAndStopClosesIt(VertxTestContext ctx) throws Exception {
        AtomicBoolean closed = new AtomicBoolean(false);
        AppConfig config = AppConfig.from(Map.of(
                "MAILDOCK_SECRET_KEY", KEY,
                "MAILDOCK_HTTP_PORT", "0"));

        WebVerticle verticle = new WebVerticle(config, (runtimeVertx, runtimeConfig) -> {
            Router router = Router.router(runtimeVertx);
            router.get("/probe").handler(route -> route.response().setStatusCode(204).end());
            return new AppRuntime(router, () -> closed.set(true));
        });

        vertx.deployVerticle(verticle).onComplete(ctx.succeeding(deploymentId -> {
            client.get(verticle.actualPort(), "localhost", "/probe")
                    .send()
                    .compose(response -> {
                        ctx.verify(() -> assertEquals(204, response.statusCode()));
                        return vertx.undeploy(deploymentId);
                    })
                    .onComplete(ctx.succeeding(v -> ctx.verify(() -> {
                        assertTrue(closed.get(), "undeploy 时应关闭 runtime 资源");
                        ctx.completeNow();
                    })));
        }));

        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }
}
