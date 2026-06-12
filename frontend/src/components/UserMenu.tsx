import { useEffect, useRef, useState } from 'react';
import type { CurrentUser } from '../api/client';

interface UserMenuProps {
  /** 当前用户。 */
  user: CurrentUser;
  /** 进入个人中心。 */
  onOpenProfile: () => void;
  /** 退出登录。 */
  onLogout: () => void;
}

/** 取头像首字母：优先显示名，其次邮箱，再退化为 ?。 */
function initial(user: CurrentUser): string {
  const source = user.displayName || user.primaryEmail || '?';
  return source.trim().charAt(0).toUpperCase() || '?';
}

/**
 * 右上角用户头像 + 下拉菜单。
 * 头像有 avatarUrl 时显示图片，否则显示首字母方块。
 * 下拉菜单含用户名/邮箱与菜单项：个人资料、修改密码、退出登录。
 */
export function UserMenu({ user, onOpenProfile, onLogout }: UserMenuProps) {
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
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="user-avatar"
        aria-label="用户菜单"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="user-avatar-img" />
        ) : (
          <span aria-hidden="true">{initial(user)}</span>
        )}
      </button>

      {open && (
        <div className="user-dropdown" role="menu">
          <div className="user-dropdown-head">
            <span className="user-dropdown-name">{name}</span>
            {user.primaryEmail && (
              <span className="user-dropdown-email">{user.primaryEmail}</span>
            )}
          </div>
          <button
            type="button"
            className="user-dropdown-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenProfile();
            }}
          >
            个人中心
          </button>
          <button
            type="button"
            className="user-dropdown-item user-dropdown-item-danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
