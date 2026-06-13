import { useState, type FormEvent } from 'react';
import type { ApiClient, CurrentUser } from '../api/client';
import { User, Lock, Save, AlertTriangle, Pencil } from 'lucide-react';

interface ProfilePageProps {
  api: ApiClient;
  user: CurrentUser;
  /** 资料更新后回传新用户，供上层同步状态。 */
  onUserUpdated: (user: CurrentUser) => void;
}

/** 头像首字母占位。 */
function initial(user: CurrentUser): string {
  const source = user.displayName || user.primaryEmail || '?';
  return source.trim().charAt(0).toUpperCase() || '?';
}

/**
 * 个人中心页：展示只读资料、编辑显示名、修改密码。
 * 修改密码仅对邮箱密码用户（hasPassword）开放。
 * 对齐 design-prototype.html section-2。
 */
export function ProfilePage({ api, user, onUserUpdated }: ProfilePageProps) {
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileMsg('');
    setProfileErr('');
    setSavingProfile(true);
    try {
      const updated = await api.updateDisplayName(displayName.trim());
      onUserUpdated(updated);
      setProfileMsg('资料已更新');
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPwdMsg('');
    setPwdErr('');
    if (newPassword.length < 6) {
      setPwdErr('新密码至少 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdErr('两次输入的新密码不一致');
      return;
    }
    setSavingPwd(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdMsg('密码已修改');
    } catch (err) {
      setPwdErr(err instanceof Error ? err.message : '修改失败');
    } finally {
      setSavingPwd(false);
    }
  }

  const inputClass =
    'w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50';

  return (
    <div className="app-main">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">个人中心</h1>
        </header>

      {/* 资料卡片 */}
      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-6 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <User className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            资料与头像
          </h2>
        </div>
        <div className="p-6">
          <div className="flex flex-col gap-6">
            {/* 头像与只读信息 - 方案 C 极简式 */}
            <div className="flex items-center gap-5">
              {/* 头像：优先 avatarUrl，否则首字母占位 */}
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-full object-cover shadow-lg"
                />
              ) : (
                <div
                  className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-400 to-slate-500 text-2xl font-semibold text-white shadow-lg"
                  aria-hidden="true"
                >
                  {initial(user)}
                </div>
              )}
              {/* 信息：垂直堆叠 */}
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-bold text-slate-800">
                  {user.displayName || user.primaryEmail || 'MailDock 用户'}
                </div>
                <div className="truncate text-sm text-slate-500" title={user.primaryEmail ?? ''}>
                  {user.primaryEmail ?? '—'}
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  通过 {user.hasPassword ? '邮箱密码' : 'linux.do'} 登录
                </div>
              </div>
            </div>

            {/* 编辑表单 */}
            <form onSubmit={handleProfileSubmit}>
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Pencil className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  编辑个人资料
                </h3>
                <div className="mb-4">
                  <label
                    htmlFor="displayName"
                    className="mb-1.5 block text-sm font-medium text-slate-600"
                  >
                    显示名
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    maxLength={64}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                {profileErr && (
                  <p className="mb-4 text-sm text-rose-600" role="alert">
                    {profileErr}
                  </p>
                )}
                {profileMsg && <p className="mb-4 text-sm text-emerald-600">{profileMsg}</p>}
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700 hover:shadow-xl hover:shadow-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  更新资料
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* 修改密码卡片 */}
      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-6 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <Lock className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            修改密码
          </h2>
        </div>
        <div className="p-6">
          {!user.hasPassword && (
            <div className="mb-4 flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
              <span>当前账号通过 linux.do 登录，未设置密码</span>
            </div>
          )}
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="oldPassword"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                原密码
              </label>
              <input
                id="oldPassword"
                type="password"
                value={oldPassword}
                disabled={!user.hasPassword}
                autoComplete="current-password"
                onChange={(e) => setOldPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="newPassword"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                新密码
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                disabled={!user.hasPassword}
                autoComplete="new-password"
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                确认新密码
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                disabled={!user.hasPassword}
                autoComplete="new-password"
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            {pwdErr && (
              <p className="text-sm text-rose-600" role="alert">
                {pwdErr}
              </p>
            )}
            {pwdMsg && <p className="text-sm text-emerald-600">{pwdMsg}</p>}
            <button
              type="submit"
              disabled={!user.hasPassword || savingPwd}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              修改密码
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
