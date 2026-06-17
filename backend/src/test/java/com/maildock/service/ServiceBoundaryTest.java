package com.maildock.service;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ServiceBoundaryTest {

    private static final Map<Class<?>, Set<String>> USER_SCOPED_OPERATIONS = Map.of(
            AccountService.class, Set.of(
                    "createAccount", "listAccounts", "queryAccounts", "findById",
                    "testConnection", "testBatch", "deleteAccount", "deleteBatch", "importFromText"),
            AccountConnectionTester.class, Set.of("testConnection", "testBatch"),
            AccountDeletionService.class, Set.of("deleteAccount", "deleteBatch"),
            AccountImporter.class, Set.of("importFromText"),
            MailSyncService.class, Set.of("refresh"),
            MailQueryService.class, Set.of("list", "getDetail", "markRead", "loadAttachment"));

    @Test
    void publicUserDataOperationsRequireCurrentUserIdAsFirstParameter() {
        USER_SCOPED_OPERATIONS.forEach((type, methodNames) -> {
            for (Method method : type.getDeclaredMethods()) {
                if (!Modifier.isPublic(method.getModifiers()) || !methodNames.contains(method.getName())) {
                    continue;
                }

                assertTrue(method.getParameterCount() > 0,
                        () -> type.getSimpleName() + "." + method.getName() + " must accept current user id");
                assertEquals(long.class, method.getParameterTypes()[0],
                        () -> type.getSimpleName() + "." + method.getName() + " must take userId first");
            }
        });
    }
}
