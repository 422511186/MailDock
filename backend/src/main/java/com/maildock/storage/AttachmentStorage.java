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
        // 解析为绝对路径，确保路径穿越防护在相对路径配置下也有效
        this.attachmentsDir = attachmentsDir.toAbsolutePath().normalize();
    }

    /** 返回附件根目录的绝对路径，用于清理操作。 */
    public Path getAttachmentsDir() {
        return attachmentsDir;
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
            // relativePath 不再包含 attachmentsDir 文件名，直接用 userId/accountId/messageId/safeName
            String relativePath = userId + "/" + accountId + "/" + messageId + "/" + safeName;
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
        String normalized = path.normalize().toString();
        // 兼容旧格式：如果 storedPath 以 attachmentsDir 文件名开头（如 "attachments/..."），去掉前缀
        String dirName = attachmentsDir.getFileName().toString();
        if (normalized.startsWith(dirName + "/")) {
            normalized = normalized.substring(dirName.length() + 1);
        }
        // attachmentsDir 已在构造时解析为绝对路径，直接作为基准
        Path resolved = attachmentsDir.resolve(normalized);
        // Security: verify resolved path is still under attachmentsDir
        if (!resolved.normalize().startsWith(attachmentsDir)) {
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
