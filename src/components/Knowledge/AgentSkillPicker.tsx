import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  Modal,
  Popover,
  Space,
  Tag,
  message,
} from 'antd';
import { Check, ListChecks } from 'lucide-react';
import {
  deleteWritingSkill,
  getWritingSkill,
  listWritingSkills,
  saveWritingSkill,
  type SkillSelection,
  type WritingSkill,
  type WritingSkillDefinition,
  type WritingSkillSummary,
} from '@/api/agent-skills';

const errorText = (error: any) => {
  const text = error.response?.data?.message ?? error.message;
  return Array.isArray(text) ? text.join('，') : text;
};
const definitionOf = (skill: WritingSkill): WritingSkillDefinition => ({
  ...(skill.workflow ? { workflow: skill.workflow } : {}),
  name: skill.name,
  description: skill.description,
  parameters: skill.parameters,
  steps: skill.steps,
  allowed_tools: skill.allowed_tools,
  acceptance: skill.acceptance,
  ...(skill.template_id ? { template_id: skill.template_id } : {}),
  enabled: skill.enabled,
});
const newDefinition: WritingSkillDefinition = {
  name: '',
  description: '',
  parameters: [],
  steps: [
    {
      id: 'read',
      description: '读取当前文档与用户选定的资料',
      depends_on: [],
      capability: 'read',
    },
  ],
  allowed_tools: [
    'read_current_document',
    'read_reference',
    'finish_answer',
    'request_clarification',
    'propose_new_document',
    'propose_document_edits',
  ],
  acceptance: ['遵循用户要求，保留可核对的资料来源'],
  enabled: true,
};

export function AgentSkillSuggestions({
  skills,
  disabled,
  onChoose,
}: {
  skills: WritingSkillSummary[];
  disabled?: boolean;
  onChoose: (skill: WritingSkillSummary) => void;
}) {
  if (!skills.length) return null;
  return (
    <section className="agent-skill-suggestions" aria-label="建议写作流程">
      <strong>下次可以使用这些写作流程</strong>
      {skills.map((skill) => (
        <div key={skill.skill_id}>
          <span>
            <b>{skill.name}</b>
            <small>{skill.description}</small>
          </span>
          <Button
            size="small"
            disabled={disabled}
            onClick={() => onChoose(skill)}
          >
            选用
          </Button>
        </div>
      ))}
    </section>
  );
}

export default function AgentSkillPicker({
  open,
  onOpenChange,
  selection,
  onChange,
  onChoose,
  disabled,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection?: SkillSelection;
  onChange: (value?: SkillSelection) => void;
  onChoose: (skill: WritingSkillSummary) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [skills, setSkills] = useState<WritingSkillSummary[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [editing, setEditing] = useState<{ id?: string; revision?: number }>();
  const [draft, setDraft] = useState('');
  const [editError, setEditError] = useState('');
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  const loadingDefinition = useRef(0);
  const mutationPending = useRef(false);
  useEffect(
    () => () => {
      generation.current++;
      loadingDefinition.current++;
    },
    [],
  );

  const load = async () => {
    const token = ++generation.current;
    setCatalogLoading(true);
    try {
      const result = await listWritingSkills();
      if (token !== generation.current) return;
      setSkills(result);
      setCatalogError('');
    } catch (error) {
      if (token === generation.current) setCatalogError(errorText(error));
    } finally {
      if (token === generation.current) setCatalogLoading(false);
    }
  };
  useEffect(() => {
    if (open || managerOpen) void load();
    return () => {
      generation.current++;
    };
  }, [open, managerOpen]);

  const beginEditing = async (summary?: WritingSkillSummary, copy = false) => {
    const token = ++loadingDefinition.current;
    setEditError('');
    if (!summary) {
      setDraft(JSON.stringify(newDefinition, null, 2));
      setEditing({});
      return;
    }
    setPending(true);
    try {
      const skill = await getWritingSkill(summary.skill_id);
      if (token !== loadingDefinition.current) return;
      const definition = definitionOf(skill);
      if (copy) definition.name += '副本';
      setDraft(JSON.stringify(definition, null, 2));
      setEditing(copy ? {} : { id: skill.skill_id, revision: skill.revision });
    } catch (error) {
      if (token === loadingDefinition.current) setEditError(errorText(error));
    } finally {
      if (token === loadingDefinition.current) setPending(false);
    }
  };
  const save = async () => {
    if (!editing || mutationPending.current) return;
    setEditError('');
    let definition: WritingSkillDefinition;
    try {
      definition = JSON.parse(draft);
      if (
        !definition ||
        typeof definition !== 'object' ||
        Array.isArray(definition)
      )
        throw new Error('请填写一个完整的流程定义对象');
    } catch (error) {
      setEditError(errorText(error));
      return;
    }
    mutationPending.current = true;
    setPending(true);
    try {
      await saveWritingSkill(definition, editing.id, editing.revision);
      setEditing(undefined);
      await load();
      message.success('写作流程已保存，重新选用后应用新版本');
    } catch (error) {
      setEditError(errorText(error));
    } finally {
      mutationPending.current = false;
      setPending(false);
    }
  };
  const remove = (skill: WritingSkillSummary) =>
    Modal.confirm({
      title: `删除“${skill.name}”？`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteWritingSkill(skill.skill_id, skill.revision);
          if (selection?.skill.skill_id === skill.skill_id) onChange(undefined);
          await load();
        } catch (error) {
          message.error(errorText(error));
          throw error;
        }
      },
    });
  return (
    <>
      <Popover
        trigger="click"
        placement="topRight"
        title="写作流程"
        open={open && !disabled}
        onOpenChange={onOpenChange}
        content={
          <div className="agent-skill-picker">
            <p>选用后按流程执行，正文修改由你采纳。</p>
            {catalogError && <Alert type="error" message={catalogError} />}
            {catalogLoading && <p role="status">正在加载流程列表</p>}
            {loading && <p role="status">正在读取所选流程</p>}
            {selection && (
              <section
                className="agent-skill-details"
                aria-label="所选流程参数与步骤"
              >
                <strong>
                  {selection.skill.name} · 版本 {selection.skill.revision}
                </strong>
                <p>{selection.skill.description}</p>
                {selection.skill.parameters.map((parameter) => (
                  <label key={parameter.name}>
                    {parameter.label}
                    {parameter.required && '（必填）'}
                    <Input
                      aria-label={parameter.label}
                      aria-required={parameter.required}
                      disabled={disabled || loading}
                      value={selection.inputs[parameter.name] ?? ''}
                      onChange={(event) =>
                        onChange({
                          ...selection,
                          inputs: {
                            ...selection.inputs,
                            [parameter.name]: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                ))}
                <details>
                  <summary>执行步骤与验收条件</summary>
                  <ol>
                    {selection.skill.steps.map((step) => (
                      <li key={step.id}>{step.description}</li>
                    ))}
                  </ol>
                  <ul>
                    {selection.skill.acceptance.map((condition, index) => (
                      <li key={index}>{condition}</li>
                    ))}
                  </ul>
                </details>
              </section>
            )}
            <div className="agent-template-list">
              <button
                className={!selection ? 'selected' : ''}
                disabled={disabled || loading}
                onClick={() => onChange(undefined)}
              >
                <span>自由执行</span>
                <small>按当前需求规划</small>
                {!selection && <Check size={14} />}
              </button>
              {skills.map((skill) => (
                <button
                  key={skill.skill_id}
                  className={
                    selection?.skill.skill_id === skill.skill_id
                      ? 'selected'
                      : ''
                  }
                  disabled={disabled || loading || skill.enabled === false}
                  onClick={() => onChoose(skill)}
                >
                  <span>
                    {skill.name}
                    {skill.enabled === false && '（已停用）'}
                  </span>
                  <small>{skill.description}</small>
                  {selection?.skill.skill_id === skill.skill_id && (
                    <Check size={14} />
                  )}
                </button>
              ))}
            </div>
            <Button
              size="small"
              disabled={disabled || loading}
              onClick={() => {
                onOpenChange(false);
                setManagerOpen(true);
                setEditError('');
              }}
            >
              管理写作流程
            </Button>
          </div>
        }
      >
        <Button
          type="text"
          size="small"
          aria-label="写作流程"
          title="写作流程"
          disabled={disabled}
          loading={loading}
          className={selection ? 'is-active' : ''}
          icon={<ListChecks size={16} />}
        />
      </Popover>
      <Modal
        open={managerOpen}
        title="管理写作流程"
        width={760}
        footer={null}
        closable={!mutationPending.current}
        maskClosable={!mutationPending.current}
        keyboard={!mutationPending.current}
        onCancel={() => {
          if (mutationPending.current) return;
          loadingDefinition.current++;
          setManagerOpen(false);
          setEditing(undefined);
          setPending(false);
          setEditError('');
        }}
      >
        {editError && <Alert type="error" message={editError} />}
        {editing ? (
          <div className="agent-skill-editor">
            <p>
              编辑名称、用途、输入参数、步骤、允许的工具和验收条件。enabled 为
              false 时停用流程。
            </p>
            <Input.TextArea
              aria-label="写作流程定义"
              rows={18}
              value={draft}
              disabled={pending}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Space>
              <Button
                type="primary"
                loading={pending}
                onClick={() => void save()}
              >
                保存流程
              </Button>
              <Button
                disabled={pending}
                onClick={() => {
                  setEditing(undefined);
                  setEditError('');
                }}
              >
                返回列表
              </Button>
            </Space>
          </div>
        ) : (
          <div className="agent-skill-manager">
            <Button
              type="primary"
              disabled={pending}
              onClick={() => void beginEditing()}
            >
              新增个人流程
            </Button>
            {catalogError && <Alert type="error" message={catalogError} />}
            {skills.map((skill) => (
              <article key={skill.skill_id}>
                <strong>{skill.name}</strong>
                {skill.builtin && <Tag>内置</Tag>}
                {skill.enabled === false && <Tag>已停用</Tag>}
                <p>{skill.description}</p>
                <Space wrap>
                  <Button
                    size="small"
                    disabled={pending}
                    onClick={() => void beginEditing(skill, true)}
                  >
                    复制流程
                  </Button>
                  {!skill.builtin && (
                    <>
                      <Button
                        size="small"
                        disabled={pending}
                        onClick={() => void beginEditing(skill)}
                      >
                        编辑流程
                      </Button>
                      <Button
                        size="small"
                        danger
                        disabled={pending}
                        onClick={() => remove(skill)}
                      >
                        删除流程
                      </Button>
                    </>
                  )}
                </Space>
              </article>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
