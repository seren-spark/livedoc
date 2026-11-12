import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./rag', () => ({ ragClient: api }));
import {
  getWritingPreferences,
  mutateWritingPreference,
  type PreferenceMutation,
} from './agent-preferences';

beforeEach(() => Object.values(api).forEach((mock) => mock.mockReset()));

describe('writing preferences API', () => {
  it('reads the authenticated preference state without a client-supplied user identity', async () => {
    api.get.mockResolvedValue({ data: { revision: 2, items: [] } });
    expect(await getWritingPreferences()).toEqual({ revision: 2, items: [] });
    expect(api.get).toHaveBeenCalledWith('/ai/agent/preferences');
  });

  it('preserves the request identity, version and explicit replacement selection', async () => {
    const input: PreferenceMutation = {
      request_id: 'retryable-request',
      expected_revision: 4,
      action: 'confirm',
      id: 'candidate',
      replace_ids: ['saved'],
    };
    api.post.mockResolvedValue({ data: { revision: 5, items: [] } });
    expect(await mutateWritingPreference(input)).toEqual({
      revision: 5,
      items: [],
    });
    expect(api.post).toHaveBeenCalledWith('/ai/agent/preferences', input);
  });

  it('returns version conflicts to the editor instead of pretending a save succeeded', async () => {
    const conflict = {
      response: { status: 409, data: { message: '写作偏好已变更' } },
    };
    api.post.mockRejectedValue(conflict);
    await expect(
      mutateWritingPreference({
        request_id: 'save',
        expected_revision: 1,
        action: 'save',
        text: '表达简洁',
      }),
    ).rejects.toBe(conflict);
  });
});
