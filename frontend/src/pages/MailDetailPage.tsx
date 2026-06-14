import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Paperclip, Download, ChevronLeft } from 'lucide-react';
import type { ApiClient, MessageDetail } from '../api/client';

interface MailDetailPageProps {
  /** API 客户端。 */
  api: ApiClient;
}

/** 将毫秒时间戳格式化为本地时间字符串。 */
function formatTime(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}

/** 将字节数格式化为易读大小。 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 邮件详情页：展示头部信息与正文（HTML 优先），列出附件，打开时自动标记已读。 */
export function MailDetailPage({ api }: MailDetailPageProps) {
  const { accountId, messageId } = useParams<{ accountId: string; messageId: string }>();
  const navigate = useNavigate();
  const [message, setMessage] = useState<MessageDetail | null>(null);
  const [error, setError] = useState('');

  const messageIdNum = messageId ? parseInt(messageId, 10) : 0;
  // 记录已自动标记已读的邮件 ID，避免重复调用
  const markedRef = useRef<number | null>(null);

  /** 拉取邮件详情，未读则自动标记已读。 */
  const load = useCallback(async () => {
    setError('');
    try {
      const detail = await api.getMessage(messageIdNum);
      setMessage(detail);
      // 未读邮件打开后标记为已读（每封仅触发一次）
      if (!detail.isRead && markedRef.current !== detail.id) {
        markedRef.current = detail.id;
        await api.markRead(detail.id, true);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api, messageIdNum]);

  // 进入页面或切换邮件时加载并滚动到顶部
  useEffect(() => {
    window.scrollTo(0, 0);
    void load();
  }, [load]);

  return (
    <div className="app-main">
      {/* 桌面端返回按钮 */}
      <div className="mb-4 hidden sm:mb-6 sm:block">
        <button
          type="button"
          onClick={() => navigate(`/accounts/${accountId}/messages`)}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          aria-label="返回"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          返回
        </button>
      </div>

      {/* 移动端返回按钮 */}
      <div className="mb-4 flex items-center justify-between sm:hidden">
        <button
          type="button"
          onClick={() => navigate(`/accounts/${accountId}/messages`)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100"
          aria-label="返回"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {message && (
        <article>
          <h2 className="break-words">{message.subject}</h2>
          <dl>
            <dt>发件人</dt>
            <dd className="break-all">{message.fromAddr}</dd>
            <dt>收件人</dt>
            <dd className="break-all">{message.toAddr}</dd>
            {message.ccAddr && (
              <>
                <dt>抄送</dt>
                <dd className="break-all">{message.ccAddr}</dd>
              </>
            )}
            <dt>时间</dt>
            <dd>{formatTime(message.sentAt)}</dd>
          </dl>

          {/* 正文：HTML 优先，回退纯文本 */}
          {message.bodyHtml ? (
            <div
              className="mail-body overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
            />
          ) : (
            <pre className="mail-body overflow-x-auto">{message.bodyText}</pre>
          )}

          {message.attachments.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-base font-semibold">附件</h3>
              <ul className="space-y-2">
                {message.attachments.map((att) => (
                  <li key={att.id} className="attachment-item">
                    <Paperclip className="attachment-icon" aria-hidden="true" />
                    <a
                      href={api.attachmentUrl(message.id, att.id)}
                      download
                      className="link break-all"
                    >
                      {att.filename}
                    </a>
                    <span className="text-xs text-slate-500">（{formatSize(att.size)}）</span>
                    <Download className="attachment-download-icon" aria-hidden="true" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>
      )}
    </div>
  );
}
