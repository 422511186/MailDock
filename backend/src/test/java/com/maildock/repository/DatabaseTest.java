package com.maildock.repository;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class DatabaseTest {

    private Path tmpRoot;

    @AfterEach
    void tearDown() throws Exception {
        if (tmpRoot != null) {
            // 递归清理临时目录
            try (var walk = Files.walk(tmpRoot)) {
                walk.sorted(java.util.Comparator.reverseOrder())
                        .forEach(p -> {
                            try {
                                Files.deleteIfExists(p);
                            } catch (Exception ignore) {
                                // 清理失败忽略
                            }
                        });
            }
        }
    }

    @Test
    void createsParentDirectoryWhenAbsent() throws Exception {
        // 父目录不存在时，构造 Database 应自动创建多级父目录并成功打开连接
        tmpRoot = Files.createTempDirectory("maildock-db-test");
        Path dbFile = tmpRoot.resolve("nested/data/maildock.db");
        assertFalse(Files.exists(dbFile.getParent()), "父目录初始应不存在");

        Database db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();

        assertTrue(Files.exists(dbFile.getParent()), "应自动创建父目录");
        assertTrue(Files.exists(dbFile), "数据库文件应被创建");
        db.close();
    }

    @Test
    void inMemoryUrlStillWorks() {
        // 纯内存 / 无文件路径的 URL 不应因目录创建逻辑报错
        Database db = new Database("jdbc:sqlite::memory:");
        db.initSchema();
        assertNotNull(db.connection());
        db.close();
    }
}
