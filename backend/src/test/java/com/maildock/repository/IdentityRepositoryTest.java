package com.maildock.repository;

import com.maildock.model.User;
import com.maildock.model.UserIdentity;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class IdentityRepositoryTest {

    private Database db;
    private UserRepository userRepo;
    private IdentityRepository identityRepo;
    private Path dbFile;

    @BeforeEach
    void setUp() throws Exception {
        dbFile = Files.createTempFile("maildock-identity-test", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();
        userRepo = new UserRepository(db);
        identityRepo = new IdentityRepository(db);
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void insertAndFindByProviderUid() {
        User user = userRepo.insert("alice@example.com", "Alice", null);
        UserIdentity identity = identityRepo.insert(user.id(), "email_password", "alice@example.com", "hash-1");

        UserIdentity found = identityRepo.findByProviderUid("email_password", "alice@example.com").orElseThrow();

        assertEquals(identity.id(), found.id());
        assertEquals(user.id(), found.userId());
        assertEquals("hash-1", found.secretHash());
    }

    @Test
    void providerAndUidAreUniqueTogether() {
        User user = userRepo.insert("alice@example.com", "Alice", null);
        identityRepo.insert(user.id(), "linuxdo", "42", null);

        assertThrows(RuntimeException.class, () -> identityRepo.insert(user.id(), "linuxdo", "42", null));
    }

    @Test
    void updateSecretHash() {
        User user = userRepo.insert("alice@example.com", "Alice", null);
        UserIdentity identity = identityRepo.insert(user.id(), "email_password", "alice@example.com", "old");

        identityRepo.updateSecretHash(identity.id(), "new");

        assertEquals("new", identityRepo.findById(identity.id()).orElseThrow().secretHash());
    }

    @Test
    void findByUserAndProviderReturnsMatchingIdentity() {
        User user = userRepo.insert("alice@example.com", "Alice", null);
        identityRepo.insert(user.id(), "email_password", "alice@example.com", "hash-1");

        UserIdentity found = identityRepo.findByUserAndProvider(user.id(), "email_password").orElseThrow();

        assertEquals("email_password", found.provider());
        assertEquals("hash-1", found.secretHash());
    }

    @Test
    void findByUserAndProviderReturnsEmptyWhenNoSuchProvider() {
        User user = userRepo.insert("bob@example.com", "Bob", null);
        identityRepo.insert(user.id(), "linuxdo", "42", null);

        assertTrue(identityRepo.findByUserAndProvider(user.id(), "email_password").isEmpty());
    }
}
