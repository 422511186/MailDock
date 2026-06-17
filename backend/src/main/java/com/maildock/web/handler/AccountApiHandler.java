package com.maildock.web.handler;

import com.maildock.model.Account;
import com.maildock.repository.AccountRepository;
import com.maildock.service.AccountService;
import com.maildock.web.support.RequestBodies;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;

import static com.maildock.web.support.JsonResponses.fail;
import static com.maildock.web.support.JsonResponses.failFromThrowable;
import static com.maildock.web.support.JsonResponses.json;
import static com.maildock.web.support.RouteValues.currentUserId;
import static com.maildock.web.support.RouteValues.parseIntOr;
import static com.maildock.web.support.RouteValues.pathLong;

public final class AccountApiHandler {

    private final Vertx vertx;
    private final AccountService accountService;

    public AccountApiHandler(Vertx vertx, AccountService accountService) {
        this.vertx = vertx;
        this.accountService = accountService;
    }

    public void registerRoutes(Router router, String apiPrefix) {
        router.get(apiPrefix + "/accounts").handler(this::handleListAccounts);
        router.post(apiPrefix + "/accounts").handler(this::handleCreateAccount);
        router.post(apiPrefix + "/accounts/import").handler(this::handleImportAccounts);
        router.post(apiPrefix + "/accounts/test-batch").handler(this::handleTestBatch);
        router.post(apiPrefix + "/accounts/delete-batch").handler(this::handleDeleteBatch);
        router.post(apiPrefix + "/accounts/:id/test").handler(this::handleTestConnection);
        router.delete(apiPrefix + "/accounts/:id").handler(this::handleDeleteAccount);
    }

    private void handleListAccounts(RoutingContext ctx) {
        long userId = currentUserId(ctx);
        String email = ctx.request().getParam("email");
        String status = ctx.request().getParam("status");
        String sortBy = ctx.request().getParam("sortBy");
        String sortOrder = ctx.request().getParam("sortOrder");
        int page = parseIntOr(ctx.request().getParam("page"), 1);
        int size = parseIntOr(ctx.request().getParam("size"), 20);
        vertx.executeBlocking(() -> accountService.queryAccounts(userId, email, status, sortBy, sortOrder, page, size), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    AccountRepository.PagedAccounts paged = ar.result();
                    JsonArray items = new JsonArray();
                    for (Account account : paged.items()) {
                        items.add(accountToJson(account));
                    }
                    json(ctx, 200, new JsonObject().put("total", paged.total()).put("items", items));
                });
    }

    private void handleCreateAccount(RoutingContext ctx) {
        JsonObject body = RequestBodies.jsonObject(ctx);
        String email = body != null ? body.getString("email") : null;
        String authCode = body != null ? body.getString("authCode") : null;
        if (email == null || email.isBlank() || authCode == null || authCode.isBlank()) {
            fail(ctx, 400, "邮箱和授权码不能为空");
            return;
        }
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> accountService.createAccount(userId, email, authCode), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    json(ctx, 201, accountToJson(ar.result()));
                });
    }

    private void handleImportAccounts(RoutingContext ctx) {
        String text = ctx.body().asString();
        if (text == null) {
            text = "";
        }
        boolean test = "true".equalsIgnoreCase(ctx.request().getParam("test"));
        boolean overwrite = "true".equalsIgnoreCase(ctx.request().getParam("overwrite"));
        long userId = currentUserId(ctx);
        String content = text;
        vertx.executeBlocking(() -> accountService.importFromText(userId, content, test, overwrite), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    AccountService.ImportResult result = ar.result();
                    JsonArray results = new JsonArray();
                    for (AccountService.ImportItem item : result.results()) {
                        results.add(new JsonObject()
                                .put("email", item.email())
                                .put("status", item.status())
                                .put("message", item.message()));
                    }
                    json(ctx, 200, new JsonObject()
                            .put("total", result.total())
                            .put("success", result.success())
                            .put("failed", result.failed())
                            .put("skipped", result.skipped())
                            .put("results", results));
                });
    }

    private void handleTestConnection(RoutingContext ctx) {
        long id = pathLong(ctx, "id");
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> accountService.testConnection(userId, id), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        failFromThrowable(ctx, ar.cause());
                        return;
                    }
                    boolean ok = ar.result();
                    json(ctx, 200, new JsonObject()
                            .put("ok", ok)
                            .put("message", ok ? "连接成功" : "连接失败"));
                });
    }

    private void handleTestBatch(RoutingContext ctx) {
        JsonObject body = RequestBodies.jsonObject(ctx);
        JsonArray idsArr = body.getJsonArray("ids");
        java.util.List<Long> ids = null;
        if (idsArr != null) {
            ids = new java.util.ArrayList<>();
            for (int i = 0; i < idsArr.size(); i++) {
                ids.add(idsArr.getLong(i));
            }
        }
        long userId = currentUserId(ctx);
        java.util.List<Long> finalIds = ids;
        vertx.executeBlocking(() -> accountService.testBatch(userId, finalIds), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    JsonArray results = new JsonArray();
                    for (AccountService.TestResult result : ar.result()) {
                        results.add(new JsonObject()
                                .put("id", result.id())
                                .put("email", result.email())
                                .put("ok", result.ok())
                                .put("message", result.message())
                                .put("latencyMs", result.latencyMs()));
                    }
                    json(ctx, 200, new JsonObject().put("results", results));
                });
    }

    private void handleDeleteAccount(RoutingContext ctx) {
        long id = pathLong(ctx, "id");
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> {
            accountService.deleteAccount(userId, id);
            return null;
        }, false).onComplete(ar -> {
            if (ar.failed()) {
                failFromThrowable(ctx, ar.cause());
                return;
            }
            ctx.response().setStatusCode(204).end();
        });
    }

    private void handleDeleteBatch(RoutingContext ctx) {
        JsonObject body = RequestBodies.jsonObject(ctx);
        JsonArray idsArr = body.getJsonArray("ids");
        if (idsArr == null || idsArr.isEmpty()) {
            fail(ctx, 400, "ids 不能为空");
            return;
        }
        java.util.List<Long> ids = new java.util.ArrayList<>();
        for (int i = 0; i < idsArr.size(); i++) {
            ids.add(idsArr.getLong(i));
        }
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> accountService.deleteBatch(userId, ids), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    json(ctx, 200, new JsonObject().put("deleted", ar.result()));
                });
    }

    private JsonObject accountToJson(Account a) {
        return new JsonObject()
                .put("id", a.id())
                .put("email", a.email())
                .put("imapHost", a.imapHost())
                .put("imapPort", a.imapPort())
                .put("lastUid", a.lastUid())
                .put("lastSyncAt", a.lastSyncAt())
                .put("lastTestAt", a.lastTestAt())
                .put("lastTestOk", a.lastTestOk())
                .put("lastTestMsg", a.lastTestMsg())
                .put("messageCount", a.messageCount());
    }

}
