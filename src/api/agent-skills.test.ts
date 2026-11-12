import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('./rag', () => ({ ragClient: api }));
import {
  deleteWritingSkill,
  getWritingSkill,
  listWritingSkills,
  saveWritingSkill,
  type WritingSkillDefinition,
} from './agent-skills';

const definition: WritingSkillDefinition = {
  name: '资料对比',
  description: '逐项对比并保留证据',
  parameters: [],
  steps: [
    { id: 'read', description: '读取资料', depends_on: [], capability: 'read' },
  ],
  allowed_tools: ['read_reference', 'finish_answer'],
  acceptance: ['结论有证据'],
  enabled: true,
};
beforeEach(() => Object.values(api).forEach((mock) => mock.mockReset()));

describe('writing skill API', () => {
  it('loads metadata separately from a selected definition', async () => {
    api.get.mockResolvedValueOnce({
      data: [{ skill_id: 'one', name: '资料对比' }],
    });
    expect(await listWritingSkills()).toEqual([
      { skill_id: 'one', name: '资料对比' },
    ]);
    expect(api.get.mock.calls).toEqual([['/ai/skills']]);
    api.get.mockResolvedValueOnce({
      data: { ...definition, skill_id: 'one', revision: 2 },
    });
    expect(await getWritingSkill('personal/one')).toMatchObject({
      revision: 2,
    });
    expect(api.get.mock.calls[1]).toEqual(['/ai/skills/personal%2Fone']);
  });
  it('creates a personal skill and updates only with the selected revision', async () => {
    api.post.mockResolvedValue({ data: { skill_id: 'new', revision: 1 } });
    await saveWritingSkill(definition);
    expect(api.post).toHaveBeenCalledWith('/ai/skills', definition);
    api.patch.mockResolvedValue({ data: { skill_id: 'new', revision: 3 } });
    await saveWritingSkill(definition, 'new', 2);
    expect(api.patch).toHaveBeenCalledWith('/ai/skills/new', {
      ...definition,
      expected_revision: 2,
    });
  });
  it('sends the expected revision in the delete body and preserves conflicts', async () => {
    const conflict = {
      response: { status: 409, data: { message: '流程已更新' } },
    };
    api.delete.mockRejectedValue(conflict);
    await expect(deleteWritingSkill('personal/one', 4)).rejects.toBe(conflict);
    expect(api.delete).toHaveBeenCalledWith('/ai/skills/personal%2Fone', {
      data: { expected_revision: 4 },
    });
  });
});
