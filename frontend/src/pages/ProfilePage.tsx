import { useState, type FormEvent } from 'react';
import type { ApiClient, CurrentUser } from '../api/client';

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

  return (
    <div className="profile-page">
      <header className="profile-header">
        <button type="button" className="link-btn" onClick={onBack}>返回</button>
        <h1>个人中心</h1>
      </header>

      {/* 资料卡 */}
      <section className="profile-card">
        <h2>资料与头像</h2>
        <div className="profile-card-body">
          <div className="profile-identity">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="profile-avatar-img" />
            ) : (
              <div className="profile-avatar" aria-hidden="true">{initial(user)}</div>
            )}
            <div className="flex flex-col gap-2">
              <dl className="profile-readonly">
                <dt>邮箱</dt>
                <dd>{user.primaryEmail ?? '—'}</dd>
                <dt>登录方式</dt>
                <dd>{user.hasPassword ? '邮箱密码' : 'linux.do'}</dd>
              </dl>
            </div>
          </div>

          <form className="profile-form" onSubmit={handleProfileSubmit}>
            <h3 className="text-sm font-semibold text-slate-700">编辑个人资料</h3>
            <div className="field">
              <label htmlFor="displayName">显示名</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                maxLength={64}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            {profileErr && <p className="error" role="alert">{profileErr}</p>}
            {profileMsg && <p className="success">{profileMsg}</p>}
            <button type="submit" className="btn-primary" disabled={savingProfile}>更新资料</button>
          </form>
        </div>
      </section>

      {/* 修改密码卡 */}
      <section className="profile-card">
        <h2>修改密码</h2>
        {!user.hasPassword && (
          <p className="profile-note">当前账号通过 linux.do 登录，未设置密码</p>
        )}
        <form className="profile-form" onSubmit={handlePasswordSubmit}>
          <div className="field">
            <label htmlFor="oldPassword">原密码</label>
            <input
              id="oldPassword"
              type="password"
              value={oldPassword}
              disabled={!user.hasPassword}
              autoComplete="current-password"
              onChange={(e) => setOldPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="newPassword">新密码</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              disabled={!user.hasPassword}
              autoComplete="new-password"
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">确认新密码</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              disabled={!user.hasPassword}
              autoComplete="new-password"
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {pwdErr && <p className="error" role="alert">{pwdErr}</p>}
          {pwdMsg && <p className="success">{pwdMsg}</p>}
          <button type="submit" className="btn-primary" disabled={!user.hasPassword || savingPwd}>
            修改密码
          </button>
        </form>
      </section>
    </div>
  );
}
