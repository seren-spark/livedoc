import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Drawer, Input, Space } from 'antd';
import {
  getWritingPreferences,
  mutateWritingPreference,
  type PreferenceMutation,
  type WritingPreference,
  type WritingPreferencesState,
} from '@/api/agent-preferences';

const errorMessage = (error: any) => {
  const value = error.response?.data?.message ?? error.message;
  return Array.isArray(value) ? value.join('，') : value;
};

export default function AgentPreferencesDrawer({
  open,
  onClose,
  refreshKey,
}: {
  open: boolean;
  onClose: () => void;
  refreshKey: number;
}) {
  const [state, setState] = useState<WritingPreferencesState>();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string }>();
  const [replacements, setReplacements] = useState<Record<string, string[]>>(
    {},
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  const visible = useRef(open);
  visible.current = open;
  const generation = useRef(0);
  const readSequence = useRef(0);
  const mutationPending = useRef(false);
  const refreshQueued = useRef(false);
  const previousRefresh = useRef(refreshKey);
  const failedRequest = useRef<
    { signature: string; input: PreferenceMutation } | undefined
  >(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      readSequence.current++;
    };
  }, []);
  const load = async (preserveError = false) => {
    const token = generation.current;
    const sequence = ++readSequence.current;
    setLoading(true);
    try {
      const result = await getWritingPreferences();
      if (
        !mounted.current ||
        !visible.current ||
        token !== generation.current ||
        sequence !== readSequence.current
      )
        return;
      setState(result);
      if (!preserveError) setError('');
    } catch (failure) {
      if (
        mounted.current &&
        visible.current &&
        token === generation.current &&
        sequence === readSequence.current
      )
        setError(errorMessage(failure));
    } finally {
      if (
        mounted.current &&
        token === generation.current &&
        sequence === readSequence.current
      )
        setLoading(false);
    }
  };
  useEffect(() => {
    generation.current++;
    if (open) {
      if (mutationPending.current) refreshQueued.current = true;
      else void load();
    } else setState(undefined);
    return () => {
      generation.current++;
      readSequence.current++;
    };
  }, [open]);
  useEffect(() => {
    if (previousRefresh.current === refreshKey) return;
    previousRefresh.current = refreshKey;
    if (!open) return;
    if (mutationPending.current) refreshQueued.current = true;
    else void load();
  }, [refreshKey, open]);

  const mutate = async (
    action: PreferenceMutation['action'],
    fields: Pick<PreferenceMutation, 'id' | 'text' | 'replace_ids'> = {},
  ) => {
    if (!state || mutationPending.current || loading) return;
    const token = generation.current;
    const signature = JSON.stringify({ action, ...fields });
    const retry = failedRequest.current?.signature === signature;
    const input = retry
      ? failedRequest.current!.input
      : {
          action,
          expected_revision: state.revision,
          ...fields,
          request_id: crypto.randomUUID(),
        };
    failedRequest.current = { signature, input };
    let succeeded = false;
    mutationPending.current = true;
    readSequence.current++;
    setPending(true);
    setError('');
    try {
      const result = await mutateWritingPreference(input);
      succeeded = true;
      failedRequest.current = undefined;
      if (!mounted.current || !visible.current || token !== generation.current)
        return;
      setState(result);
      if (action === 'save') setDraft('');
      if (action === 'update') setEditing(undefined);
      if (fields.id)
        setReplacements((current) => ({ ...current, [fields.id!]: [] }));
    } catch (failure: any) {
      if (!mounted.current || !visible.current || token !== generation.current)
        return;
      setError(errorMessage(failure));
      if (failure.response?.status === 409) {
        failedRequest.current = undefined;
        await load(true);
      }
    } finally {
      mutationPending.current = false;
      if (mounted.current) setPending(false);
      if (
        (refreshQueued.current || (retry && succeeded)) &&
        mounted.current &&
        visible.current
      ) {
        refreshQueued.current = false;
        void load(true);
      }
    }
  };

  const confirmed =
    state?.items.filter((item) => item.status === 'confirmed') ?? [];
  const candidates =
    state?.items.filter((item) => item.status === 'pending') ?? [];
  const disabled = pending || loading || !state;
  const source = (item: WritingPreference) => (
    <details className="agent-preference-source">
      <summary>
        {item.source.kind === 'manual' ? '手动保存的原文' : '用户输入的原文'}
      </summary>
      <blockquote>{item.source.quote}</blockquote>
    </details>
  );

  return (
    <Drawer open={open} onClose={onClose} title="写作偏好" width={460}>
      <div className="agent-preferences">
        <p>保存常用写作要求，供后续会话使用。本次明确要求优先。</p>
        {error && <Alert type="error" message={error} />}
        {loading && <p role="status">正在读取写作偏好</p>}
        <section aria-label="明确保存写作偏好">
          <label htmlFor="agent-preference-draft">希望长期保留的要求</label>
          <Input.TextArea
            id="agent-preference-draft"
            aria-label="新的写作偏好"
            rows={3}
            value={draft}
            disabled={pending}
            placeholder="例如，技术文章保留完整代码块，优先使用简洁表达"
            onChange={(event) => setDraft(event.target.value)}
          />
          <Space>
            <Button
              type="primary"
              disabled={disabled || !draft.trim()}
              onClick={() => void mutate('save', { text: draft.trim() })}
            >
              保存偏好
            </Button>
            <Button disabled={pending || loading} onClick={() => void load()}>
              刷新偏好
            </Button>
          </Space>
        </section>

        <section aria-label="已保存偏好">
          <h3>已保存 · {confirmed.length}</h3>
          {!confirmed.length && !loading && <p>尚未保存写作偏好</p>}
          {confirmed.map((item) => (
            <article key={item.id}>
              {editing?.id === item.id ? (
                <>
                  <Input.TextArea
                    aria-label="编辑写作偏好"
                    rows={3}
                    value={editing.text}
                    disabled={pending}
                    onChange={(event) =>
                      setEditing({ id: item.id, text: event.target.value })
                    }
                  />
                  <Space>
                    <Button
                      size="small"
                      disabled={disabled || !editing.text.trim()}
                      onClick={() =>
                        void mutate('update', {
                          id: item.id,
                          text: editing.text.trim(),
                        })
                      }
                    >
                      保存修改
                    </Button>
                    <Button
                      size="small"
                      disabled={pending}
                      onClick={() => setEditing(undefined)}
                    >
                      取消编辑
                    </Button>
                  </Space>
                </>
              ) : (
                <>
                  <p>{item.text}</p>
                  {source(item)}
                  <Space>
                    <Button
                      size="small"
                      disabled={disabled}
                      onClick={() =>
                        setEditing({ id: item.id, text: item.text })
                      }
                    >
                      编辑偏好
                    </Button>
                    <Button
                      size="small"
                      danger
                      disabled={disabled}
                      onClick={() => void mutate('delete', { id: item.id })}
                    >
                      删除偏好
                    </Button>
                  </Space>
                </>
              )}
            </article>
          ))}
        </section>

        <section aria-label="待确认偏好">
          <h3>待确认 · {candidates.length}</h3>
          <p>候选经你确认后保存。</p>
          {!candidates.length && !loading && <p>暂无待确认偏好</p>}
          {candidates.map((item) => {
            const conflicts = confirmed.filter((saved) =>
              item.conflicts_with?.includes(saved.id),
            );
            const selected = replacements[item.id] ?? [];
            const canConfirm = conflicts.every((saved) =>
              selected.includes(saved.id),
            );
            return (
              <article key={item.id}>
                <p>{item.text}</p>
                {source(item)}
                {!!conflicts.length && (
                  <fieldset className="agent-preference-conflicts">
                    <legend>选择要替换的已保存偏好</legend>
                    {conflicts.map((saved) => (
                      <Checkbox
                        key={saved.id}
                        disabled={disabled}
                        checked={selected.includes(saved.id)}
                        onChange={(event) =>
                          setReplacements((current) => ({
                            ...current,
                            [item.id]: event.target.checked
                              ? [...selected, saved.id]
                              : selected.filter((id) => id !== saved.id),
                          }))
                        }
                      >
                        {saved.text}
                      </Checkbox>
                    ))}
                  </fieldset>
                )}
                <Space>
                  <Button
                    size="small"
                    disabled={disabled || !canConfirm}
                    onClick={() =>
                      void mutate('confirm', {
                        id: item.id,
                        ...(conflicts.length
                          ? { replace_ids: conflicts.map((saved) => saved.id) }
                          : {}),
                      })
                    }
                  >
                    {conflicts.length ? '确认并替换所选偏好' : '确认保存'}
                  </Button>
                  <Button
                    size="small"
                    disabled={disabled}
                    onClick={() => void mutate('reject', { id: item.id })}
                  >
                    拒绝候选
                  </Button>
                </Space>
              </article>
            );
          })}
        </section>
      </div>
    </Drawer>
  );
}
