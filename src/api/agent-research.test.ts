import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('./rag', () => ({ ragClient: api }));
import { getAgentResearch } from './agent-research';
beforeEach(() => {
  api.get.mockReset();
});
describe('research artifact API', () => {
  it('encodes the run and pages by research question', async () => {
    api.get.mockResolvedValue({ data: { notes: [], next_offset: null } });
    expect(await getAgentResearch('run/one', 'q2', 10)).toEqual({
      notes: [],
      next_offset: null,
    });
    expect(api.get).toHaveBeenCalledWith('/ai/agent/runs/run%2Fone/research', {
      params: { question_id: 'q2', offset: 10, limit: 10 },
    });
  });
  it('preserves permission and source-version failures', async () => {
    const failure = {
      response: { status: 409, data: { message: '资料版本已变化' } },
    };
    api.get.mockRejectedValue(failure);
    await expect(getAgentResearch('run')).rejects.toBe(failure);
  });
});
