import { useState, type FormEvent } from 'react';
import type { ApiClient, CurrentUser } from '../api/client';
import { Mail, User, Lock, Save, Info, ArrowLeft } from 'lucide-react';

interface ProfilePageProps {
  api: ApiClient;
  user: CurrentUser;
  /** 返回上一视图。 */
  onBack: () => void;
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
export function ProfilePage({ api, user, onBack, onUserUpdated }: ProfilePageProps) {
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
    'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50';

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          返回
        </button>
        <h1 className="text-xl font-bold text-slate-800">个人中心</h1>
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
            {/* 头像与只读信息 */}
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-20 w-20 rounded-2xl object-cover shadow-lg ring-2 ring-slate-100"
                />
              ) : (
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-400 to-slate-500 text-2xl font-semibold text-white shadow-lg ring-2 ring-slate-100"
                  aria-hidden="true"
                >
                  {initial(user)}
                </div>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="flex items-center gap-1 font-medium text-slate-500">
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  邮箱
                </dt>
                <dd className="text-slate-700">{user.primaryEmail ?? '—'}</dd>
                <dt className="font-medium text-slate-500">登录方式</dt>
                <dd className="text-slate-700">{user.hasPassword ? '邮箱密码' : 'linux.do'}</dd>
              </dl>
            </div>

            {/* 编辑表单 */}
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">编辑个人资料</h3>
              <div>
                <label
                  htmlFor="displayName"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
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
                <p className="text-sm text-rose-600" role="alert">
                  {profileErr}
                </p>
              )}
              {profileMsg && <p className="text-sm text-emerald-600">{profileMsg}</p>}
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                更新资料
              </button>
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
            <div className="mb-4 flex items-start gap-3 rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4 text-sm text-slate-700">
              <Info className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
              <p>当前账号通过 linux.do 登录，未设置密码</p>
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
