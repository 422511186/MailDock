package com.maildock.service;

import com.maildock.mail.ImapClient;
import com.maildock.model.Account;
import com.maildock.repository.AccountRepository;
import com.maildock.security.CryptoUtil;

import java.util.ArrayList;
import java.util.List;

/**
 * 账号连通性测活职责：负责解密授权码、构造 IMAP 客户端、执行单个或批量测活，
 * 并把测活状态回写到账号表。
 */
public final class AccountConnectionTester {

    @FunctionalInterface
    public interface AccountProbe {
        ProbeResult probe(Account account) throws Exception;
    }

    public record ProbeResult(boolean ok, String message, long latencyMs) {
    }

    private final AccountRepository accountRepo;
    private final AccountProbe probe;

    public AccountConnectionTester(AccountRepository accountRepo,
                                   CryptoUtil crypto,
                                   AccountService.ImapClientFactory clientFactory) {
        this(accountRepo, account -> probeImap(account, crypto, clientFactory));
    }

    public AccountConnectionTester(AccountRepository accountRepo, AccountProbe probe) {
        this.accountRepo = accountRepo;
        this.probe = probe;
    }

    public boolean testConnection(long userId, long accountId) {
        Account account = accountRepo.findById(userId, accountId)
                .orElseThrow(() -> new RuntimeException("账号不存在: " + accountId));
        return updateStatus(userId, account).ok();
    }

    public List<AccountService.TestResult> testBatch(long userId, List<Long> ids) {
        List<Account> targets;
        if (ids == null) {
            targets = accountRepo.listAll(userId);
        } else {
            targets = new ArrayList<>();
            for (Long id : ids) {
                accountRepo.findById(userId, id).ifPresent(targets::add);
            }
        }
        return testAccounts(userId, targets);
    }

    private List<AccountService.TestResult> testAccounts(long userId, List<Account> targets) {
        List<AccountService.TestResult> results = new ArrayList<>();
        for (Account account : targets) {
            ProbeResult probeResult = updateStatus(userId, account);
            results.add(new AccountService.TestResult(
                    account.id(),
                    account.email(),
                    probeResult.ok(),
                    probeResult.message(),
                    probeResult.latencyMs()));
        }
        return results;
    }

    private ProbeResult updateStatus(long userId, Account account) {
        ProbeResult result;
        try {
            result = probe.probe(account);
        } catch (Exception e) {
            result = new ProbeResult(false, rootMessage(e), 0L);
        }
        long now = System.currentTimeMillis();
        accountRepo.updateTestStatus(userId, account.id(), now, result.ok(), result.message());
        return result;
    }

    private static ProbeResult probeImap(Account account,
                                         CryptoUtil crypto,
                                         AccountService.ImapClientFactory clientFactory) {
        long start = System.currentTimeMillis();
        String authCode = crypto.decrypt(account.authCodeEnc());
        boolean useSsl = account.imapPort() == 993;
        ImapClient client = clientFactory.create(
                account.imapHost(), account.imapPort(), useSsl, account.email(), authCode);
        client.testConnection();
        return new ProbeResult(true, "连接成功", System.currentTimeMillis() - start);
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
