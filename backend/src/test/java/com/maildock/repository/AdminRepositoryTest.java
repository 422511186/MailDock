package com.maildock.repository;

import com.maildock.model.Admin;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class AdminRepositoryTest {

    private Database db;
    private AdminRepository repo;
    private Path dbFile;

    @BeforeEach
    void setUp() throws Exception {
        // 每个测试使用独立的临时 SQLite 文件库
        dbFile = Files.createTempFile("maildock-admin-test", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();
        repo = new AdminRepository(db);
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void insertThenFindByUsername() {
        // 插入管理员后应能按用户名查回
        Admin created = repo.insert("admin", "hashed-pwd");

        assertTrue(created.id() > 0);
        assertEquals("admin", created.username());
        assertEquals("hashed-pwd", created.passwordHash());

        Optional<Admin> found = repo.findByUsername("admin");
        assertTrue(found.isPresent());
        assertEquals("hashed-pwd", found.get().passwordHash());
    }

    @Test
    void findByUsernameReturnsEmptyWhenAbsent() {
        // 不存在的用户名返回空
        assertTrue(repo.findByUsername("nobody").isEmpty());
    }

    @Test
    void countReturnsNumberOfAdmins() {
        // count 返回管理员数量，用于判断是否需要初始化默认管理员
        assertEquals(0, repo.count());
        repo.insert("admin", "h1");
        assertEquals(1, repo.count());
    }

    @Test
    void duplicateUsernameThrows() {
        // 用户名唯一约束：重复插入应抛异常
        repo.insert("admin", "h1");
        assertThrows(RuntimeException.class, () -> repo.insert("admin", "h2"));
    }
}
