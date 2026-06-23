package com.maildock.storage;

import com.maildock.mail.FilenameSanitizer;
import com.maildock.mail.ParsedAttachment;
import com.maildock.model.Attachment;
import com.maildock.repository.AttachmentRepository;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 附件文件系统存储：负责统一生成用户隔离路径、落盘附件、解析库中相对路径，
 * 并提供静默清理入口，避免这些规则散落在多个 service 中。
 */
public final class AttachmentStorage {

    private final AttachmentRepository attachmentRepo;
    private final Path attachmentsDir;

    public AttachmentStorage(AttachmentRepository attachmentRepo, Path attachmentsDir) {
        this.attachmentRepo = attachmentRepo;
        this.attachmentsDir = attachmentsDir;
    }

    public Attachment store(long userId, long accountId, long messageId, ParsedAttachment att) throws Exception {
        String safeName = FilenameSanitizer.sanitize(att.filename());
        Path dir = attachmentsDir.resolve(String.valueOf(userId))
                .resolve(String.valueOf(accountId))
                .resolve(String.valueOf(messageId));
        Files.createDirectories(dir);

        Path target = dir.resolve(safeName);
        Files.write(target, att.content());
        try {
            String relativePath = attachmentsDir.getFileName()
                    + "/" + userId + "/" + accountId + "/" + messageId + "/" + safeName;
            return attachmentRepo.insert(messageId, safeName, att.contentType(), att.content().length, relativePath);
        } catch (Exception e) {
            // Clean up orphan file on DB failure
            try { Files.deleteIfExists(target); } catch (Exception ignored) {}
            throw e;
        }
    }

    public byte[] read(String storedPath) throws Exception {
        return Files.readAllBytes(resolve(storedPath));
    }

    public Path resolve(String storedPath) {
        if (storedPath == null || storedPath.isBlank()) {
            throw new IllegalArgumentException("storedPath 不能为空");
        }
        Path path = Path.of(storedPath);
        if (path.isAbsolute()) {
            throw new SecurityException("绝对路径不允许: " + storedPath);
        }
        Path normalized = path.normalize();
        Path resolved;
        Path parent = attachmentsDir.getParent();
        if (parent != null) {
            resolved = parent.resolve(normalized);
        } else {
            resolved = attachmentsDir.resolve(normalized);
        }
        // Security: verify resolved path is under attachmentsDir's parent (or attachmentsDir itself)
        Path anchor = parent != null ? parent : attachmentsDir;
        if (!resolved.normalize().startsWith(anchor.normalize())) {
            throw new SecurityException("路径穿越: " + storedPath);
        }
        return resolved;
    }

    public void deleteStoredFileQuietly(String storedPath) {
        try {
            Files.deleteIfExists(resolve(storedPath));
        } catch (Exception ignored) {
        }
    }

    public void deleteAccountDirectoryQuietly(long userId, long accountId) {
        deleteDirectoryQuietly(attachmentsDir.resolve(String.valueOf(userId)).resolve(String.valueOf(accountId)));
    }

    public void deleteDirectoryQuietly(Path dir) {
        try {
            if (!Files.exists(dir)) {
                return;
            }
            try (var stream = Files.walk(dir)) {
                stream.sorted((a, b) -> b.getNameCount() - a.getNameCount())
                        .forEach(path -> {
                            try {
                                Files.deleteIfExists(path);
                            } catch (Exception ignored) {
                            }
                        });
            }
        } catch (Exception ignored) {
        }
    }
}
