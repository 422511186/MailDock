import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfilePage } from './ProfilePage';
import type { CurrentUser } from '../api/client';

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 1,
    primaryEmail: 'alice@example.com',
    displayName: 'Alice',
    avatarUrl: null,
    hasPassword: true,
    ...overrides,
  };
}

function stubApi(overrides: Record<string, unknown> = {}) {
  return {
    updateDisplayName: vi.fn().mockResolvedValue(user({ displayName: '新名字' })),
    changePassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../contexts/AuthContext';

function mockAuth(overrides = {}) {
  vi.mocked(useAuth).mockReturnValue({
    user: user(),
    loading: false,
    error: null,
    login: vi.fn(),
    loginWithLinuxDo: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  });
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  it('渲染只读资料（邮箱）与显示名输入框', () => {
    const api = stubApi();
    render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText('显示名')).toHaveValue('Alice');
  });

  it('提交改名调用 updateDisplayName 并回传更新后的用户', async () => {
    const updateUser = vi.fn();
    mockAuth({ updateUser });
    const api = stubApi();
    render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('显示名'), { target: { value: '新名字' } });
    fireEvent.click(screen.getByRole('button', { name: '更新资料' }));

    await waitFor(() => expect(api.updateDisplayName).toHaveBeenCalledWith('新名字'));
    await waitFor(() => expect(updateUser).toHaveBeenCalled());
  });

  it('改密两次输入不一致时报错且不调用 API', async () => {
    const api = stubApi();
    render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('原密码'), { target: { value: 'old-pass' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'new-pass-1' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'mismatch' } });
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));

    expect(await screen.findByText('两次输入的新密码不一致')).toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it('改密成功时调用 changePassword 并清空表单', async () => {
    const api = stubApi();
    render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('原密码'), { target: { value: 'old-pass' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'new-pass-1' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'new-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));

    await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith('old-pass', 'new-pass-1'));
    await waitFor(() => expect(screen.getByLabelText('新密码')).toHaveValue(''));
  });

  it('linux.do 用户（hasPassword=false）改密区禁用并提示', () => {
    const api = stubApi();
    mockAuth({ user: user({ hasPassword: false }) });
    render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );

    expect(screen.getByText('当前账号通过 linux.do 登录，未设置密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '修改密码' })).toBeDisabled();
  });

  it('更新资料按钮内嵌图标且可访问名保持「更新资料」', () => {
    const api = stubApi();
    render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );
    const btn = screen.getByRole('button', { name: '更新资料' });
    expect(btn.querySelector('svg')).toBeInTheDocument();
  });

  it('头像为圆形（rounded-full，方案 C）', () => {
    const api = stubApi();
    render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );
    const avatar = document.querySelector('.rounded-full.shadow-lg');
    expect(avatar).toBeInTheDocument();
  });

  it('两张卡片标题（资料与头像 / 修改密码）均存在', () => {
    const api = stubApi();
    render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: '资料与头像' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '修改密码' })).toBeInTheDocument();
  });

  it('资料卡片邮箱长时不省略（方案 C 直接 truncate）', () => {
    const api = stubApi();
    mockAuth({ user: user({ primaryEmail: 'iog9k1hbaw2dflwu@privaterelay.linux.do' }) });
    const { container } = render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );
    // 方案 C 用 CSS truncate，完整邮箱在 title 属性里
    const emailDiv = container.querySelector('div[title="iog9k1hbaw2dflwu@privaterelay.linux.do"]');
    expect(emailDiv).toBeInTheDocument();
    expect(emailDiv?.className).toContain('truncate');
  });

  it('资料卡片邮箱元素有 title 属性悬浮展示完整邮箱', () => {
    const api = stubApi();
    mockAuth({ user: user({ primaryEmail: 'iog9k1hbaw2dflwu@privaterelay.linux.do' }) });
    const { container } = render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );
    const emailDiv = container.querySelector('div[title="iog9k1hbaw2dflwu@privaterelay.linux.do"]');
    expect(emailDiv).toBeInTheDocument();
  });

  it('资料卡片邮箱短时完整显示', () => {
    const api = stubApi();
    mockAuth({ user: user({ primaryEmail: 'a@b.c' }) });
    render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );
    expect(screen.getByText('a@b.c')).toBeInTheDocument();
  });

  it('资料卡片显示"编辑个人资料"小标题且带编辑图标（对齐原型）', () => {
    const api = stubApi();
    render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );
    const heading = screen.getByRole('heading', { name: '编辑个人资料' });
    expect(heading).toBeInTheDocument();
    expect(heading.querySelector('svg')).toBeInTheDocument();
  });

  it('编辑表单包裹在浅灰描边子区块中（对齐原型）', () => {
    const api = stubApi();
    render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );
    const heading = screen.getByRole('heading', { name: '编辑个人资料' });
    const block = heading.closest('div');
    const classes = block?.className.split(/\s+/) ?? [];
    expect(classes).toContain('rounded-xl');
    expect(classes).toContain('border');
    expect(classes).toContain('border-slate-200');
    expect(classes).toContain('bg-slate-50/50');
    expect(classes).toContain('p-5');
  });

  it('不显示"返回"按钮（顶栏用户菜单已提供导航）', () => {
    const api = stubApi();
    render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: '返回' })).not.toBeInTheDocument();
  });

  it('页面容器使用与账号列表一致的自适应宽度（app-main）', () => {
    const api = stubApi();
    const { container } = render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );
    expect(container.querySelector('.app-main')).toBeInTheDocument();
  });

  it('输入框使用原型样式（rounded-xl + px-4 + py-2.5）', () => {
    const api = stubApi();
    render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );
    const classes = screen.getByLabelText('显示名').className.split(/\s+/);
    expect(classes).toContain('rounded-xl');
    expect(classes).toContain('px-4');
    expect(classes).toContain('py-2.5');
    expect(classes).not.toContain('rounded-lg');
    expect(classes).not.toContain('px-3');
    expect(classes).not.toContain('py-2');
  });

  it('linux.do 提示使用琥珀色样式（对齐原型，非蓝色）', () => {
    const api = stubApi();
    mockAuth({ user: user({ hasPassword: false }) });
    render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );
    const notice = screen.getByText('当前账号通过 linux.do 登录，未设置密码').closest('div');
    const classes = notice?.className.split(/\s+/) ?? [];
    expect(classes).toContain('bg-amber-50');
    expect(classes).toContain('text-amber-800');
    expect(classes).toContain('rounded-xl');
    expect(classes).not.toContain('bg-blue-50');
    expect(classes).not.toContain('border-blue-500');
    expect(classes).not.toContain('border-l-4');
  });

  it('资料卡片采用极简式布局（方案 C）：圆形头像 + 垂直堆叠信息', () => {
    const api = stubApi();
    render(
      <MemoryRouter>
        <ProfilePage api={api as never} />
      </MemoryRouter>
    );

    // 头像是圆形（rounded-full）
    const avatar = document.querySelector('.rounded-full.bg-gradient-to-br');
    expect(avatar).toBeInTheDocument();
    expect(avatar?.className).toContain('h-20');
    expect(avatar?.className).toContain('w-20');

    // 不再使用 dl/dt/dd 表格式布局
    expect(document.querySelector('dl')).not.toBeInTheDocument();

    // 登录方式显示为纯文本（"通过 linux.do 登录"）
    expect(screen.getByText(/通过.*登录/)).toBeInTheDocument();
  });
});
