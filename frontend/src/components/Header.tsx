import { Mail } from 'lucide-react';
import type { CurrentUser } from '../api/client';
import { UserMenu } from './UserMenu';

export interface HeaderProps {
  user: CurrentUser | null;
  onOpenProfile: () => void;
  onLogout: () => void;
}

/**
 * 全局顶栏：左侧品牌 logo + 站名，右侧用户菜单（仅登录后显示）。
 * 对齐 design-prototype.html section-1。
 */
export function Header({ user, onOpenProfile, onLogout }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-6 py-3 shadow-sm backdrop-blur-md">
      {/* 左侧品牌 */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30">
          <Mail className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-base font-bold tracking-tight text-slate-800">MailDock</span>
          <span className="text-xs text-slate-400">邮箱管理中心</span>
        </div>
      </div>

      {/* 右侧用户菜单（仅登录后显示） */}
      {user && (
        <UserMenu user={user} onOpenProfile={onOpenProfile} onLogout={onLogout} />
      )}
    </header>
  );
}
