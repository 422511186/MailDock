package com.maildock.bootstrap;

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
import com.maildock.service.LinuxDoOAuthService;
import com.maildock.service.MailQueryService;
import com.maildock.service.MailSyncService;
import com.maildock.service.VertxOAuthClient;
import com.maildock.web.ApiRouter;
import io.vertx.core.Vertx;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.handler.StaticHandler;

import java.nio.file.Path;
import java.time.Duration;

/**
 * 默认应用装配入口：负责实例化 Repository / Service / Router，并返回可运行的 AppRuntime。
 */
public final class AppWiring implements AppRuntimeFactory {

    @Override
    public AppRuntime create(Vertx vertx, AppConfig config) {
        Database database = new Database("jdbc:sqlite:" + config.dbPath());
        try {
            database.initSchema();
            database.backfillFtsIfNeeded();

            UserRepository userRepo = new UserRepository(database);
            IdentityRepository identityRepo = new IdentityRepository(database);
            AccountRepository accountRepo = new AccountRepository(database);
            MessageRepository messageRepo = new MessageRepository(database);
            AttachmentRepository attachmentRepo = new AttachmentRepository(database);

            CryptoUtil crypto = new CryptoUtil(config.secretKey());
            SessionStore sessionStore = new SessionStore();
            Path attachmentsDir = Path.of(config.attachmentsDir());

            AccountService.ImapClientFactory accountFactory = ImapClient::new;
            MailSyncService.ImapClientFactory syncFactory = ImapClient::new;

            AuthService authService = new AuthService(
                    userRepo, identityRepo, sessionStore, Duration.ofHours(config.sessionTtlHours()));
            LinuxDoOAuthService linuxDoOAuthService = new LinuxDoOAuthService(
                    config, authService, new VertxOAuthClient(vertx, config));
            AccountService accountService = new AccountService(
                    accountRepo, messageRepo, attachmentRepo, crypto, accountFactory, attachmentsDir);
            MailSyncService mailSyncService = new MailSyncService(
                    accountRepo, messageRepo, attachmentRepo, crypto, syncFactory, attachmentsDir);
            MailQueryService mailQueryService = new MailQueryService(
                    messageRepo, attachmentRepo, attachmentsDir);

            if (config.defaultEmail() != null && config.defaultPassword() != null) {
                authService.ensureDefaultEmailUser(config.defaultEmail(), config.defaultPassword());
            }

            Router router = new ApiRouter(
                    vertx,
                    authService,
                    linuxDoOAuthService,
                    accountService,
                    mailSyncService,
                    mailQueryService,
                    config.sessionCookieSecure(),
                    Duration.ofHours(config.sessionTtlHours()),
                    config.frontendUrl(),
                    config.corsOrigins()).build();

            StaticHandler staticHandler = StaticHandler.create("webroot")
                    .setIndexPage("index.html")
                    .setAlwaysAsyncFS(true)
                    .setDefaultContentEncoding("UTF-8");
            router.route("/*").handler(staticHandler);
            router.route("/*").handler(ctx -> ctx.response()
                    .putHeader("Content-Type", "text/html; charset=utf-8")
                    .sendFile("webroot/index.html"));

            return new AppRuntime(router, database::close);
        } catch (Exception e) {
            try { database.close(); } catch (Exception ignored) {}
            throw e;
        }
    }
}
