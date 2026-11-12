// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({
  getWritingPreferences: vi.fn(),
  mutateWritingPreference: vi.fn(),
}));
vi.mock('@/api/agent-preferences', () => api);
vi.mock('antd', () => ({
  Alert: ({ message }: any) => <p role="alert">{message}</p>,
  Button: ({ children, disabled, onClick }: any) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  Checkbox: ({ children, checked, disabled, onChange }: any) => (
    <label>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      {children}
    </label>
  ),
  Drawer: ({ open, title, children }: any) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
  Input: { TextArea: (props: any) => <textarea {...props} /> },
  Space: ({ children }: any) => <div>{children}</div>,
}));
import AgentPreferencesDrawer from './AgentPreferencesDrawer';
import type { WritingPreferencesState } from '@/api/agent-preferences';

const initial: WritingPreferencesState = {
  revision: 3,
  items: [
    {
      id: 'saved',
      text: '默认表达简洁',
      status: 'confirmed',
      conflicts_with: [],
      source: { kind: 'manual', input_id: 'manual', quote: '默认表达简洁' },
      created_at: 'now',
      updated_at: 'now',
    },
    {
      id: 'candidate',
      text: '默认详细展开',
      status: 'pending',
      conflicts_with: ['saved'],
      source: {
        kind: 'user_input',
        input_id: 'turn',
        quote: '以后可以详细一些 <img src=x>',
      },
      created_at: 'now',
      updated_at: 'now',
    },
  ],
};
let container: HTMLDivElement;
let root: Root;
const button = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === text,
  )!;
const textarea = (name = '新的写作偏好') =>
  container.querySelector<HTMLTextAreaElement>(
    `textarea[aria-label="${name}"]`,
  )!;
const render = async (open = true, refreshKey = 0) => {
  await act(async () =>
    root.render(
      <AgentPreferencesDrawer
        open={open}
        onClose={() => {}}
        refreshKey={refreshKey}
      />,
    ),
  );
};
const setText = async (value: string, name?: string) => {
  await act(async () => {
    const input = textarea(name);
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.values(api).forEach((mock) => mock.mockReset());
  api.getWritingPreferences.mockResolvedValue(structuredClone(initial));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('confirmed and candidate writing preferences', () => {
  it('loads on open and displays candidate provenance without applying it', async () => {
    await render(false);
    expect(api.getWritingPreferences).not.toHaveBeenCalled();
    await render();
    expect(container.textContent).toContain('本次明确要求优先');
    expect(container.textContent).toContain('已保存 · 1');
    expect(container.textContent).toContain('待确认 · 1');
    expect(container.textContent).toContain('以后可以详细一些 <img src=x>');
    expect(container.querySelector('img')).toBeNull();
    expect(api.mutateWritingPreference).not.toHaveBeenCalled();
  });

  it('saves explicit text with a version and clears the draft after success', async () => {
    api.mutateWritingPreference.mockResolvedValue({ ...initial, revision: 4 });
    await render();
    await setText('保留代码块');
    await act(async () => button('保存偏好').click());
    expect(api.mutateWritingPreference).toHaveBeenCalledWith({
      action: 'save',
      expected_revision: 3,
      request_id: expect.any(String),
      text: '保留代码块',
    });
    expect(textarea().value).toBe('');
  });

  it('keeps a failed save draft and retries the same request identity', async () => {
    api.mutateWritingPreference
      .mockRejectedValueOnce(new Error('暂时无法连接'))
      .mockResolvedValueOnce({ ...initial, revision: 4 });
    await render();
    await setText('保留代码块');
    await act(async () => button('保存偏好').click());
    const first = api.mutateWritingPreference.mock.calls[0]![0];
    expect(textarea().value).toBe('保留代码块');
    expect(container.textContent).toContain('暂时无法连接');
    await act(async () => button('保存偏好').click());
    expect(api.mutateWritingPreference.mock.calls[1]![0]).toEqual(first);
  });

  it('refreshes on a version conflict and preserves the edited text', async () => {
    api.mutateWritingPreference.mockRejectedValueOnce({
      response: { status: 409, data: { message: '版本已变化' } },
    });
    api.getWritingPreferences
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce({ ...initial, revision: 9 });
    await render();
    await setText('保留代码块');
    await act(async () => button('保存偏好').click());
    expect(api.getWritingPreferences).toHaveBeenCalledTimes(2);
    expect(textarea().value).toBe('保留代码块');
    expect(container.textContent).toContain('版本已变化');
    api.mutateWritingPreference.mockResolvedValue({ ...initial, revision: 10 });
    await act(async () => button('保存偏好').click());
    const [first, second] = api.mutateWritingPreference.mock.calls.map(
      (call) => call[0],
    );
    expect(second.expected_revision).toBe(9);
    expect(second.request_id).not.toBe(first.request_id);
  });

  it('keeps the original retry payload after an unrelated refresh changes the revision', async () => {
    api.mutateWritingPreference
      .mockRejectedValueOnce(new Error('响应丢失'))
      .mockResolvedValueOnce({ ...initial, revision: 4 });
    await render();
    await setText('保留代码块');
    await act(async () => button('保存偏好').click());
    const first = api.mutateWritingPreference.mock.calls[0]![0];
    api.getWritingPreferences.mockResolvedValue({ ...initial, revision: 8 });
    await render(true, 1);
    await act(async () => button('保存偏好').click());
    expect(api.mutateWritingPreference.mock.calls[1]![0]).toEqual(first);
    expect(api.getWritingPreferences).toHaveBeenCalledTimes(3);
  });

  it('requires explicit selection before replacing a conflicting saved preference', async () => {
    api.mutateWritingPreference.mockResolvedValue({
      revision: 4,
      items: [{ ...initial.items[1]!, status: 'confirmed' }],
    });
    await render();
    expect(button('确认并替换所选偏好').disabled).toBe(true);
    await act(async () =>
      container
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .click(),
    );
    expect(button('确认并替换所选偏好').disabled).toBe(false);
    await act(async () => button('确认并替换所选偏好').click());
    expect(api.mutateWritingPreference).toHaveBeenCalledWith({
      action: 'confirm',
      id: 'candidate',
      replace_ids: ['saved'],
      expected_revision: 3,
      request_id: expect.any(String),
    });
    expect(container.textContent).toContain('已保存 · 1');
    expect(container.textContent).toContain('待确认 · 0');
  });

  it('rejects a candidate without replacing the saved preference', async () => {
    api.mutateWritingPreference.mockResolvedValue({
      revision: 4,
      items: [initial.items[0]!, { ...initial.items[1]!, status: 'rejected' }],
    });
    await render();
    await act(async () => button('拒绝候选').click());
    expect(api.mutateWritingPreference).toHaveBeenCalledWith({
      action: 'reject',
      id: 'candidate',
      expected_revision: 3,
      request_id: expect.any(String),
    });
    expect(container.textContent).toContain('默认表达简洁');
    expect(container.textContent).toContain('待确认 · 0');
  });

  it('edits then deletes the selected saved preference with the latest version', async () => {
    api.mutateWritingPreference
      .mockResolvedValueOnce({
        revision: 4,
        items: [{ ...initial.items[0]!, text: '技术解释简洁' }],
      })
      .mockResolvedValueOnce({ revision: 5, items: [] });
    await render();
    await act(async () => button('编辑偏好').click());
    await setText('技术解释简洁', '编辑写作偏好');
    await act(async () => button('保存修改').click());
    expect(api.mutateWritingPreference.mock.calls[0]![0]).toMatchObject({
      action: 'update',
      id: 'saved',
      text: '技术解释简洁',
      expected_revision: 3,
    });
    await act(async () => button('删除偏好').click());
    expect(api.mutateWritingPreference.mock.calls[1]![0]).toMatchObject({
      action: 'delete',
      id: 'saved',
      expected_revision: 4,
    });
    expect(container.textContent).toContain('已保存 · 0');
  });

  it('ignores a stale load after close and reopening', async () => {
    const oldLoad = deferred<WritingPreferencesState>();
    api.getWritingPreferences
      .mockReturnValueOnce(oldLoad.promise)
      .mockResolvedValueOnce({ revision: 8, items: [] });
    await render();
    await render(false);
    await render(true);
    await act(async () => oldLoad.resolve(initial));
    expect(container.textContent).toContain('已保存 · 0');
    expect(container.textContent).not.toContain('默认表达简洁');
  });

  it('refreshes a visible drawer after a preference event without changing a draft', async () => {
    await render();
    await setText('尚未保存的要求');
    api.getWritingPreferences.mockResolvedValue({ revision: 5, items: [] });
    await render(true, 1);
    expect(api.getWritingPreferences).toHaveBeenCalledTimes(2);
    expect(textarea().value).toBe('尚未保存的要求');
  });
});
