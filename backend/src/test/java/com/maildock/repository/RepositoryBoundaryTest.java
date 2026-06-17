package com.maildock.repository;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RepositoryBoundaryTest {

    private static final Set<String> ACCOUNT_USER_SCOPED_OPERATIONS = Set.of(
            "insert", "findById", "findByEmail", "listAll", "query",
            "delete", "updateAuthCode", "updateSyncState", "updateTestStatus");

    @Test
    void accountRepositoryUserDataOperationsRequireUserIdAsFirstParameter() {
        for (Method method : AccountRepository.class.getDeclaredMethods()) {
            if (!Modifier.isPublic(method.getModifiers())
                    || !ACCOUNT_USER_SCOPED_OPERATIONS.contains(method.getName())) {
                continue;
            }

            assertTrue(method.getParameterCount() > 0,
                    () -> "AccountRepository." + method.getName() + " must accept user id");
            assertEquals(long.class, method.getParameterTypes()[0],
                    () -> "AccountRepository." + method.getName() + " must take userId first");
        }
    }
}
