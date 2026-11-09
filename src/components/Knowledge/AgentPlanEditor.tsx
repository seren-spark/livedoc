import { useState } from 'react';
import { Button, Input, Modal, Select, Space, message } from 'antd';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ExecutionPlan } from '@/api/document-agent.types';

export default function AgentPlanEditor({
  plan,
  disabled,
  maxSteps = 5,
  onSave,
}: {
  plan: ExecutionPlan;
  disabled: boolean;
  maxSteps?: number;
  onSave: (plan: ExecutionPlan) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(plan);
  const [outline, setOutline] = useState('');
  const [constraints, setConstraints] = useState('');
  const lines = (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  const save = () => {
    if (draft.steps.length > maxSteps) {
      message.warning(`当前最多支持 ${maxSteps} 步，请合并步骤`);
      return;
    }
    if (
      !draft.goal.trim() ||
      draft.steps.some((step) => !step.description.trim())
    ) {
      message.warning('请填写计划目标和每一步的内容');
      return;
    }
    onSave({
      ...draft,
      goal: draft.goal.trim(),
      outline: lines(outline),
      constraints: lines(constraints),
      steps: draft.steps.map((step, index) => ({
        ...step,
        description: step.description.trim(),
        depends_on: index ? [draft.steps[index - 1].id] : [],
      })),
    });
    setOpen(false);
  };
  const move = (index: number, direction: number) => {
    const steps = [...draft.steps];
    [steps[index], steps[index + direction]] = [
      steps[index + direction],
      steps[index],
    ];
    setDraft({ ...draft, steps });
  };
  return (
    <>
      <Button
        icon={<Pencil size={14} />}
        disabled={disabled}
        onClick={() => {
          setDraft(structuredClone(plan));
          setOutline(plan.outline.join('\n'));
          setConstraints(plan.constraints.join('\n'));
          setOpen(true);
        }}
      >
        编辑计划
      </Button>
      <Modal
        title="编辑写作计划"
        open={open}
        width={680}
        onCancel={() => setOpen(false)}
        onOk={save}
        okText="保存计划"
        cancelText="取消"
        destroyOnHidden
      >
        <div className="agent-plan-editor">
          <label htmlFor="agent-plan-goal">写作目标</label>
          <Input.TextArea
            id="agent-plan-goal"
            value={draft.goal}
            onChange={(event) =>
              setDraft({ ...draft, goal: event.target.value })
            }
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
          <label htmlFor="agent-plan-outline">
            章节结构 <small>每行一个章节</small>
          </label>
          <Input.TextArea
            id="agent-plan-outline"
            value={outline}
            onChange={(event) => setOutline(event.target.value)}
            autoSize={{ minRows: 3, maxRows: 8 }}
          />
          <label htmlFor="agent-plan-constraints">
            写作要求 <small>每行一条，可指定表格、重点或语气</small>
          </label>
          <Input.TextArea
            id="agent-plan-constraints"
            value={constraints}
            onChange={(event) => setConstraints(event.target.value)}
            autoSize={{ minRows: 2, maxRows: 6 }}
          />
          <label>
            执行步骤 <small>按列表顺序执行，最多 {maxSteps} 步</small>
          </label>
          {draft.steps.map((step, index) => (
            <div className="agent-plan-editor-step" key={step.id}>
              <span>{index + 1}</span>
              <div>
                <Input.TextArea
                  aria-label={`第 ${index + 1} 步内容`}
                  value={step.description}
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      steps: draft.steps.map((item, i) =>
                        i === index
                          ? { ...item, description: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <Select
                  aria-label={`第 ${index + 1} 步类型`}
                  size="small"
                  value={step.capability}
                  options={[
                    { value: 'read', label: '阅读资料' },
                    { value: 'search', label: '检索资料' },
                    { value: 'compose', label: '编写内容' },
                  ]}
                  onChange={(capability) =>
                    setDraft({
                      ...draft,
                      steps: draft.steps.map((item, i) =>
                        i === index ? { ...item, capability } : item,
                      ),
                    })
                  }
                />
              </div>
              <Space size={0}>
                <Button
                  type="text"
                  size="small"
                  aria-label={`上移第 ${index + 1} 步`}
                  icon={<ArrowUp size={14} />}
                  disabled={!index}
                  onClick={() => move(index, -1)}
                />
                <Button
                  type="text"
                  size="small"
                  aria-label={`下移第 ${index + 1} 步`}
                  icon={<ArrowDown size={14} />}
                  disabled={index === draft.steps.length - 1}
                  onClick={() => move(index, 1)}
                />
                <Button
                  type="text"
                  size="small"
                  aria-label={`删除第 ${index + 1} 步`}
                  icon={<Trash2 size={14} />}
                  disabled={draft.steps.length === 1}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      steps: draft.steps.filter((_, i) => i !== index),
                    })
                  }
                />
              </Space>
            </div>
          ))}
          <Button
            type="dashed"
            icon={<Plus size={14} />}
            disabled={draft.steps.length >= maxSteps}
            onClick={() =>
              setDraft({
                ...draft,
                steps: [
                  ...draft.steps,
                  {
                    id: crypto.randomUUID(),
                    description: '',
                    capability: 'compose',
                    depends_on: [],
                  },
                ],
              })
            }
          >
            添加步骤
          </Button>
          <small>保存只更新计划，点击侧栏的“按此计划执行”后才开始编写。</small>
        </div>
      </Modal>
    </>
  );
}
