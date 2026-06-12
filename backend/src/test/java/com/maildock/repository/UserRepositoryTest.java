package com.maildock.repository;

import com.maildock.model.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class UserRepositoryTest {

    private Database db;
    private UserRepository userRepo;
    private Path dbFile;

    @BeforeEach
    void setUp() throws Exception {
        dbFile = Files.createTempFile("maildock-user-test", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();
        userRepo = new UserRepository(db);
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void insertAndFindById() {
        User user = userRepo.insert("alice@example.com", "Alice", "https://avatar.example/a.png");

        User found = userRepo.findById(user.id()).orElseThrow();

        assertEquals("alice@example.com", found.primaryEmail());
        assertEquals("Alice", found.displayName());
        assertEquals("https://avatar.example/a.png", found.avatarUrl());
        assertTrue(found.createdAt() > 0);
        assertTrue(found.updatedAt() > 0);
    }

    @Test
    void updateProfileAndLastLogin() {
        User user = userRepo.insert("alice@example.com", "Alice", null);

        userRepo.updateProfile(user.id(), "new@example.com", "New Name", "avatar");
        userRepo.updateLastLogin(user.id(), 1700000000000L);

        User found = userRepo.findById(user.id()).orElseThrow();
        assertEquals("new@example.com", found.primaryEmail());
        assertEquals("New Name", found.displayName());
        assertEquals("avatar", found.avatarUrl());
        assertEquals(1700000000000L, found.lastLoginAt());
    }
}
