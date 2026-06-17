package com.maildock.service;

import com.maildock.model.Account;
import com.maildock.repository.AccountRepository;
import com.maildock.security.CryptoUtil;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * 账号批量导入职责：解析文本行、按用户作用域查重或覆盖、必要时触发测活。
 */
public final class AccountImporter {

    private final AccountRepository accountRepo;
    private final CryptoUtil crypto;
    private final AccountConnectionTester connectionTester;

    public AccountImporter(AccountRepository accountRepo,
                           CryptoUtil crypto,
                           AccountConnectionTester connectionTester) {
        this.accountRepo = accountRepo;
        this.crypto = crypto;
        this.connectionTester = connectionTester;
    }

    public AccountService.ImportResult importFromText(long userId, String text, boolean test, boolean overwrite) {
        return importFromText(text, test, overwrite, new AccountScope() {
            @Override
            public Optional<Account> findByEmail(String email) {
                return accountRepo.findByEmail(userId, email);
            }

            @Override
            public void updateAuthCode(long accountId, String encryptedAuthCode) {
                accountRepo.updateAuthCode(userId, accountId, encryptedAuthCode);
            }

            @Override
            public Account insert(String email, String encryptedAuthCode) {
                return accountRepo.insert(userId, email, encryptedAuthCode);
            }

            @Override
            public void testConnection(long accountId) {
                connectionTester.testConnection(userId, accountId);
            }
        });
    }

    private AccountService.ImportResult importFromText(String text, boolean test, boolean overwrite, AccountScope scope) {
        List<AccountService.ImportItem> items = new ArrayList<>();
        int total = 0;
        int success = 0;
        int failed = 0;
        int skipped = 0;

        String source = text == null ? "" : text;
        for (String rawLine : source.split("\n")) {
            String line = rawLine.strip();
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }
            total++;

            String[] parts = line.split("\\s+", 2);
            if (parts.length < 2 || parts[0].isBlank() || parts[1].isBlank()) {
                failed++;
                items.add(new AccountService.ImportItem(
                        parts.length > 0 ? parts[0] : line,
                        "failed",
                        "格式错误：应为 账号 授权码"));
                continue;
            }

            String email = parts[0].strip();
            String authCode = parts[1].strip();
            try {
                Optional<Account> existing = scope.findByEmail(email);
                if (existing.isPresent()) {
                    if (!overwrite) {
                        skipped++;
                        items.add(new AccountService.ImportItem(email, "skipped", "邮箱已存在，已跳过"));
                        continue;
                    }
                    scope.updateAuthCode(existing.get().id(), crypto.encrypt(authCode));
                    if (test) {
                        scope.testConnection(existing.get().id());
                    }
                    success++;
                    items.add(new AccountService.ImportItem(email, "success", "已覆盖授权码"));
                } else {
                    Account created = scope.insert(email, crypto.encrypt(authCode));
                    if (test) {
                        scope.testConnection(created.id());
                    }
                    success++;
                    items.add(new AccountService.ImportItem(email, "success", "导入成功"));
                }
            } catch (Exception e) {
                failed++;
                items.add(new AccountService.ImportItem(email, "failed", rootMessage(e)));
            }
        }

        return new AccountService.ImportResult(total, success, failed, skipped, items);
    }

    private interface AccountScope {
        Optional<Account> findByEmail(String email);

        void updateAuthCode(long accountId, String encryptedAuthCode);

        Account insert(String email, String encryptedAuthCode);

        void testConnection(long accountId);
    }

    private String rootMessage(Throwable e) {
        Throwable cur = e;
        while (cur.getCause() != null && cur.getCause() != cur) {
            cur = cur.getCause();
        }
        String msg = cur.getMessage();
        return msg != null ? msg : cur.getClass().getSimpleName();
    }
}
