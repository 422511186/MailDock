import { useEffect, useRef, useState } from 'react';
import { UserCircle, Mail, LogOut, ChevronDown } from 'lucide-react';
import type { CurrentUser } from '../api/client';

interface UserMenuProps {
  /** 当前用户。 */
  user: CurrentUser;
  /** 进入个人中心。 */
  onOpenProfile: () => void;
  /** 退出登录。 */
  onLogout: () => void;
  /** 进入邮件列表（可选；未提供时该菜单项仅关闭菜单不报错。实际由 Header/App 传入“返回账号列表”回调）。 */
  onOpenMailList?: () => void;
}

/** 取头像首字母：优先显示名，其次邮箱，再退化为 ?。 */
function initial(user: CurrentUser): string {
  const source = user.displayName || user.primaryEmail || '?';
  return source.trim().charAt(0).toUpperCase() || '?';
}

/**
 * 右上角用户菜单：触发按钮显示头像 + 用户名 + 箭头。
 * 展开后富信息头部（大头像 + 用户名 + 邮箱）+ 三个菜单项。
 * 对齐 design-prototype.html section-1。
 */
export function UserMenu({ user, onOpenProfile, onLogout, onOpenMailList }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 点击外部与 Esc 关闭
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const name = user.displayName || user.primaryEmail || 'MailDock 用户';

  return (
    <div className="relative" ref={rootRef}>
      {/* 触发按钮 */}
      <button
        type="button"
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 transition hover:border-slate-300 hover:shadow-sm"
        aria-label="用户菜单"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="h-7 w-7 rounded-full object-cover ring-2 ring-white"
          />
        ) : (
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-slate-400 to-slate-500 text-xs font-semibold text-white"
            aria-hidden="true"
          >
            {initial(user)}
          </span>
        )}
        <span className="max-w-[10rem] truncate text-sm font-medium text-slate-700">{name}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
      </button>

      {/* 下拉菜单 */}
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-2 w-52 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white shadow-2xl animate-slide-down"
          role="menu"
        >
          {/* 富信息头部 */}
          <div className="bg-white px-2 py-4">
            <div className="flex items-center justify-center gap-3">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-12 w-12 rounded-full object-cover ring-2 ring-white shadow-md"
                />
              ) : (
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-slate-400 to-slate-500 text-lg font-semibold text-white shadow-md"
                  aria-hidden="true"
                >
                  {initial(user)}
                </span>
              )}
              <div className="overflow-hidden">
                <div className="truncate text-sm font-semibold text-slate-800">{name}</div>
              </div>
            </div>
          </div>

          {/* 菜单项 */}
          <div className="pt-3 pb-2">
            <button
              type="button"
              className="flex w-full appearance-none items-center gap-3 border-none bg-transparent px-2 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenProfile();
              }}
            >
              <UserCircle className="h-5 w-5 text-slate-400" aria-hidden="true" />
              <span>个人中心</span>
            </button>
            <button
              type="button"
              className="flex w-full appearance-none items-center gap-3 border-none bg-transparent px-2 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenMailList?.();
              }}
            >
              <Mail className="h-5 w-5 text-slate-400" aria-hidden="true" />
              <span>邮件列表</span>
            </button>
            <button
              type="button"
              className="flex w-full appearance-none items-center gap-3 rounded-b-2xl border-none bg-transparent px-2 py-2.5 text-left text-sm text-rose-600 transition hover:bg-rose-50"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
