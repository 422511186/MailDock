package com.maildock.web;

import com.maildock.config.AppConfig;
import com.maildock.mail.ImapClient;
import com.maildock.repository.AccountRepository;
import com.maildock.repository.AttachmentRepository;
import com.maildock.repository.Database;
import com.maildock.repository.IdentityRepository;
import com.maildock.repository.MessageRepository;
import com.maildock.repository.UserRepository;
import com.maildock.security.CryptoUtil;
import com.maildock.security.SessionStore;
import com.maildock.service.AccountService;
import com.maildock.service.AuthService;
import com.maildock.service.MailQueryService;
import com.maildock.service.MailSyncService;
import io.vertx.core.AbstractVerticle;
import io.vertx.core.Promise;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.handler.StaticHandler;

import java.nio.file.Path;
import java.time.Duration;

/**
 * 应用主 Verticle：装配全部依赖、挂载 REST 路由与前端静态资源，并启动 HTTP 服务。
 *
 * <p>阻塞的依赖装配（打开 SQLite、初始化表结构）在 Verticle 部署线程上一次性完成。
 * 运行时的阻塞操作（IMAP、JDBC、磁盘 I/O）由 {@link ApiRouter} 通过 executeBlocking 隔离。
 *
 */
public final class WebVerticle extends AbstractVerticle {

    private final AppConfig config;
    private Database database;
    private int actualPort;

    public WebVerticle(AppConfig config) {
        this.config = config;
    }

    /** 返回 HTTP 服务实际绑定的端口（配置为 0 时由系统分配）。 */
    public int actualPort() {
        return actualPort;
    }

    @Override
    public void start(Promise<Void> startPromise) {
        // ===== 装配持久层 =====
        database = new Database("jdbc:sqlite:" + config.dbPath());
        database.initSchema();

        UserRepository userRepo = new UserRepository(database);
        IdentityRepository identityRepo = new IdentityRepository(database);
        AccountRepository accountRepo = new AccountRepository(database);
        MessageRepository messageRepo = new MessageRepository(database);
        AttachmentRepository attachmentRepo = new AttachmentRepository(database);

        // ===== 装配安全与业务层 =====
        CryptoUtil crypto = new CryptoUtil(config.secretKey());
        SessionStore sessionStore = new SessionStore();
        Path attachmentsDir = Path.of(config.attachmentsDir());

        // 生产环境的 IMAP 客户端工厂：按账号配置直连真实服务器
        AccountService.ImapClientFactory accountFactory = ImapClient::new;
        MailSyncService.ImapClientFactory syncFactory = ImapClient::new;

        AuthService authService = new AuthService(
                userRepo, identityRepo, sessionStore, Duration.ofHours(config.sessionTtlHours()));
        AccountService accountService = new AccountService(
                accountRepo, messageRepo, attachmentRepo, crypto, accountFactory, attachmentsDir);
        MailSyncService mailSyncService = new MailSyncService(
                accountRepo, messageRepo, attachmentRepo, crypto, syncFactory, attachmentsDir);
        MailQueryService mailQueryService = new MailQueryService(
                messageRepo, attachmentRepo, attachmentsDir);

        // 认证服务会在后续任务替换为邮箱用户初始化；此处先解除旧 admin 配置依赖。
        if (config.defaultEmail() != null && config.defaultPassword() != null) {
            authService.ensureDefaultEmailUser(config.defaultEmail(), config.defaultPassword());
        }

        // ===== 挂载路由与静态资源 =====
        Router router = new ApiRouter(
                vertx, authService, accountService, mailSyncService, mailQueryService).build();

        // 前端静态资源：打包后的 React 产物放在 classpath 的 webroot 下，由 StaticHandler 托管
        router.route("/*").handler(StaticHandler.create("webroot").setIndexPage("index.html"));

        // ===== 启动 HTTP 服务 =====
        vertx.createHttpServer()
                .requestHandler(router)
                .listen(config.httpPort())
                .onComplete(ar -> {
                    if (ar.failed()) {
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
        if (database != null) {
            database.close();
        }
    }
}
