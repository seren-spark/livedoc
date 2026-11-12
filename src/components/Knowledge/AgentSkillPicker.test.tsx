// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({
  listWritingSkills: vi.fn(),
  getWritingSkill: vi.fn(),
  saveWritingSkill: vi.fn(),
  deleteWritingSkill: vi.fn(),
}));
const ui = vi.hoisted(() => ({
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/api/agent-skills', () => api);
vi.mock('antd', () => {
  const Input = Object.assign((props: any) => <input {...props} />, {
    TextArea: (props: any) => <textarea {...props} />,
  });
  const Modal = Object.assign(
    ({ open, children, title, onCancel, closable = true }: any) =>
      open ? (
        <div role="dialog" aria-label={title}>
          {closable && <button onClick={onCancel}>关闭管理</button>}
          {children}
        </div>
      ) : null,
    { confirm: ui.confirm },
  );
  return {
    Input,
    Modal,
    Button: ({
      children,
      disabled,
      loading,
      onClick,
      'aria-label': label,
    }: any) => (
      <button
        aria-label={label}
        disabled={disabled || loading}
        onClick={onClick}
      >
        {children}
      </button>
    ),
    Popover: ({ open, content, children }: any) => (
      <div>
        {children}
        {open && content}
      </div>
    ),
    Space: ({ children }: any) => <div>{children}</div>,
    Tag: ({ children }: any) => <span>{children}</span>,
    Alert: ({ message }: any) => <p role="alert">{message}</p>,
    message: { success: ui.success, error: ui.error },
  };
});
import AgentSkillPicker, { AgentSkillSuggestions } from './AgentSkillPicker';
import type { SkillSelection, WritingSkill } from '@/api/agent-skills';

const skill: WritingSkill = {
  skill_id: 'technical',
  name: '技术文章',
  description: '按资料组织文章',
  revision: 3,
  builtin: true,
  parameters: [{ name: 'audience', label: '读者', required: true }],
  steps: [
    {
      id: 'read',
      description: '读取资料并整理术语',
      depends_on: [],
      capability: 'read',
    },
  ],
  allowed_tools: ['read_current_document', 'finish_answer'],
  acceptance: ['保留关键结论的来源'],
  enabled: true,
};
const metadata = {
  skill_id: skill.skill_id,
  name: skill.name,
  description: skill.description,
  revision: skill.revision,
  builtin: true,
  enabled: true,
};
let container: HTMLDivElement;
let root: Root;
const choose = vi.fn();
const onOpenChange = vi.fn();
const button = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) =>
      node.textContent === label || node.getAttribute('aria-label') === label,
  )!;
const render = async (
  props: Partial<React.ComponentProps<typeof AgentSkillPicker>> = {},
) => {
  await act(async () =>
    root.render(
      <AgentSkillPicker
        open
        onOpenChange={onOpenChange}
        onChange={() => {}}
        onChoose={choose}
        {...props}
      />,
    ),
  );
};
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.values(api).forEach((mock) => mock.mockReset());
  Object.values(ui).forEach((mock) => mock.mockReset());
  choose.mockReset();
  onOpenChange.mockReset();
  api.listWritingSkills.mockResolvedValue([metadata]);
  api.getWritingSkill.mockResolvedValue(skill);
  api.saveWritingSkill.mockResolvedValue({
    ...skill,
    skill_id: 'personal',
    builtin: false,
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('writing skill selection and management', () => {
  it('loads only metadata when opened and chooses only after a click', async () => {
    await render({ open: false });
    expect(api.listWritingSkills).not.toHaveBeenCalled();
    await render();
    expect(api.listWritingSkills).toHaveBeenCalledTimes(1);
    expect(api.getWritingSkill).not.toHaveBeenCalled();
    expect(choose).not.toHaveBeenCalled();
    await act(async () => button('技术文章按资料组织文章').click());
    expect(choose).toHaveBeenCalledWith(metadata);
  });

  it('keeps suggestions inactive until the user selects one', async () => {
    await act(async () =>
      root.render(
        <AgentSkillSuggestions skills={[metadata]} onChoose={choose} />,
      ),
    );
    expect(choose).not.toHaveBeenCalled();
    expect(api.getWritingSkill).not.toHaveBeenCalled();
    await act(async () => button('选用').click());
    expect(choose).toHaveBeenCalledWith(metadata);
  });

  it('retains the loaded skill revision while editing required parameters and previewing steps', async () => {
    let value: SkillSelection | undefined;
    function Harness() {
      const [selection, setSelection] = useState<SkillSelection>({
        skill,
        inputs: {},
      });
      value = selection;
      return (
        <AgentSkillPicker
          open
          onOpenChange={() => {}}
          selection={selection}
          onChange={(next) => {
            if (next) setSelection(next);
          }}
          onChoose={choose}
        />
      );
    }
    await act(async () => root.render(<Harness />));
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="读者"]',
    )!;
    expect(input.getAttribute('aria-required')).toBe('true');
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, '后端开发者');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(value).toMatchObject({
      skill: { skill_id: 'technical', revision: 3 },
      inputs: { audience: '后端开发者' },
    });
    expect(container.textContent).toContain('读取资料并整理术语');
    expect(container.textContent).toContain('保留关键结论的来源');
  });

  it('copies a builtin as a personal definition without builtin identifiers', async () => {
    await render();
    await act(async () => button('管理写作流程').click());
    await act(async () => button('复制流程').click());
    const draft = container.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(JSON.parse(draft.value)).toMatchObject({
      name: '技术文章副本',
      steps: skill.steps,
    });
    expect(JSON.parse(draft.value)).not.toHaveProperty('skill_id');
    expect(JSON.parse(draft.value)).not.toHaveProperty('revision');
    await act(async () => button('保存流程').click());
    expect(api.saveWritingSkill).toHaveBeenCalledWith(
      expect.objectContaining({ name: '技术文章副本' }),
      undefined,
      undefined,
    );
  });

  it('preserves edited content when a concurrent revision update is rejected', async () => {
    const personal = { ...skill, skill_id: 'personal', builtin: false };
    api.listWritingSkills.mockResolvedValue([personal]);
    api.getWritingSkill.mockResolvedValue(personal);
    api.saveWritingSkill.mockRejectedValue({
      response: { data: { message: '流程已更新，请重新读取' } },
    });
    await render();
    await act(async () => button('管理写作流程').click());
    await act(async () => button('编辑流程').click());
    const before =
      container.querySelector<HTMLTextAreaElement>('textarea')!.value;
    await act(async () => button('保存流程').click());
    expect(api.saveWritingSkill).toHaveBeenCalledWith(
      expect.any(Object),
      'personal',
      3,
    );
    expect(
      container.querySelector<HTMLTextAreaElement>('textarea')!.value,
    ).toBe(before);
    expect(container.textContent).toContain('流程已更新，请重新读取');
  });

  it('rejects malformed JSON locally and deletes personal definitions with their revision', async () => {
    const personal = { ...metadata, skill_id: 'personal', builtin: false };
    api.listWritingSkills.mockResolvedValue([personal]);
    await render();
    await act(async () => button('管理写作流程').click());
    await act(async () => button('新增个人流程').click());
    const input = container.querySelector<HTMLTextAreaElement>('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!.call(input, '{');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('保存流程').click());
    expect(api.saveWritingSkill).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => button('返回列表').click());
    await act(async () => button('删除流程').click());
    await act(async () => ui.confirm.mock.calls[0][0].onOk());
    expect(api.deleteWritingSkill).toHaveBeenCalledWith('personal', 3);
  });

  it('does not reopen a cancelled editor after its detail request finishes', async () => {
    let resolve!: (value: WritingSkill) => void;
    api.getWritingSkill.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await render();
    await act(async () => button('管理写作流程').click());
    await act(async () => button('复制流程').click());
    await act(async () => button('关闭管理').click());
    await act(async () => resolve(skill));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
  });
});
