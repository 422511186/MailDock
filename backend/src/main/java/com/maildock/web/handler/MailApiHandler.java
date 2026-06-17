package com.maildock.web.handler;

import com.maildock.model.Attachment;
import com.maildock.model.Message;
import com.maildock.service.MailQueryService;
import com.maildock.service.MailSyncService;
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

public final class MailApiHandler {

    private final Vertx vertx;
    private final MailSyncService mailSyncService;
    private final MailQueryService mailQueryService;

    public MailApiHandler(Vertx vertx, MailSyncService mailSyncService, MailQueryService mailQueryService) {
        this.vertx = vertx;
        this.mailSyncService = mailSyncService;
        this.mailQueryService = mailQueryService;
    }

    public void registerRoutes(Router router, String apiPrefix) {
        router.post(apiPrefix + "/accounts/:id/refresh").handler(this::handleRefresh);
        router.get(apiPrefix + "/accounts/:id/messages").handler(this::handleListMessages);
        router.get(apiPrefix + "/messages/:id").handler(this::handleMessageDetail);
        router.get(apiPrefix + "/messages/:id/attachments/:attId").handler(this::handleDownloadAttachment);
        router.patch(apiPrefix + "/messages/:id/read").handler(this::handleMarkRead);
    }

    private void handleRefresh(RoutingContext ctx) {
        long accountId = pathLong(ctx, "id");
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> mailSyncService.refresh(userId, accountId), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        failFromThrowable(ctx, ar.cause());
                        return;
                    }
                    json(ctx, 200, new JsonObject()
                            .put("newCount", ar.result())
                            .put("syncedAt", System.currentTimeMillis()));
                });
    }

    private void handleListMessages(RoutingContext ctx) {
        long accountId = pathLong(ctx, "id");
        long userId = currentUserId(ctx);
        int page = parseIntOr(ctx.request().getParam("page"), 1);
        int size = parseIntOr(ctx.request().getParam("size"), 20);
        vertx.executeBlocking(() -> mailQueryService.list(userId, accountId, page, size), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    MailQueryService.PagedMessages paged = ar.result();
                    JsonArray items = new JsonArray();
                    for (Message message : paged.items()) {
                        items.add(messageSummaryJson(message));
                    }
                    json(ctx, 200, new JsonObject().put("total", paged.total()).put("items", items));
                });
    }

    private void handleMessageDetail(RoutingContext ctx) {
        long messageId = pathLong(ctx, "id");
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> mailQueryService.getDetail(userId, messageId), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    if (ar.result().isEmpty()) {
                        fail(ctx, 404, "邮件不存在");
                        return;
                    }
                    json(ctx, 200, messageDetailJson(ar.result().get()));
                });
    }

    private void handleDownloadAttachment(RoutingContext ctx) {
        long messageId = pathLong(ctx, "id");
        long attachmentId = parseIntOr(ctx.pathParam("attId"), -1);
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> mailQueryService.loadAttachment(userId, messageId, attachmentId), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        failFromThrowable(ctx, ar.cause());
                        return;
                    }
                    ctx.response()
                            .setStatusCode(200)
                            .putHeader("Content-Type", "application/octet-stream")
                            .end(io.vertx.core.buffer.Buffer.buffer(ar.result()));
                });
    }

    private void handleMarkRead(RoutingContext ctx) {
        long messageId = pathLong(ctx, "id");
        boolean read = RequestBodies.jsonObject(ctx).getBoolean("read", true);
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> {
            mailQueryService.markRead(userId, messageId, read);
            return null;
        }, false).onComplete(ar -> {
            if (ar.failed()) {
                failFromThrowable(ctx, ar.cause());
                return;
            }
            json(ctx, 200, new JsonObject().put("id", messageId).put("read", read));
        });
    }

    private JsonObject messageSummaryJson(Message m) {
        return new JsonObject()
                .put("id", m.id())
                .put("accountId", m.accountId())
                .put("uid", m.uid())
                .put("subject", m.subject())
                .put("fromAddr", m.fromAddr())
                .put("toAddr", m.toAddr())
                .put("sentAt", m.sentAt())
                .put("receivedAt", m.receivedAt())
                .put("hasAttach", m.hasAttach())
                .put("isRead", m.isRead());
    }

    private JsonObject messageDetailJson(MailQueryService.MessageDetail detail) {
        Message m = detail.message();
        JsonArray atts = new JsonArray();
        for (Attachment a : detail.attachments()) {
            atts.add(new JsonObject()
                    .put("id", a.id())
                    .put("filename", a.filename())
                    .put("contentType", a.contentType())
                    .put("size", a.size()));
        }
        return new JsonObject()
                .put("id", m.id())
                .put("accountId", m.accountId())
                .put("uid", m.uid())
                .put("messageId", m.messageId())
                .put("subject", m.subject())
                .put("fromAddr", m.fromAddr())
                .put("toAddr", m.toAddr())
                .put("ccAddr", m.ccAddr())
                .put("sentAt", m.sentAt())
                .put("receivedAt", m.receivedAt())
                .put("bodyText", m.bodyText())
                .put("bodyHtml", m.bodyHtml())
                .put("hasAttach", m.hasAttach())
                .put("isRead", m.isRead())
                .put("attachments", atts);
    }

}
