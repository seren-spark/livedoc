import { useEffect, useRef, useState } from 'react';
import {
  getAgentResearch,
  type ResearchBrief,
  type ResearchCoverage,
  type ResearchNote,
} from '@/api/agent-research';
import type { AgentResult, AgentCitation } from '@/api/document-agent.types';

export interface ResearchProgress {
  task_id?: string;
  searches: number;
  stop_reason?: string;
  question_id?: string;
}
const stops: Record<string, string> = {
  search_limit: '达到本步骤搜索上限',
  no_new_evidence: '连续两次没有新增证据',
  repeated_query: '停止重复查询',
  questions_addressed: '已交付发现与剩余缺口',
  turn_limit: '达到步骤轮数上限',
};
const labels = {
  covered: '已覆盖',
  partial: '部分覆盖',
  missing: '缺少资料或内容',
  conflicted: '存在冲突',
};
export default function AgentResearchProgress({
  runId,
  brief: suppliedBrief,
  coverage: suppliedCoverage,
  progress,
  result,
  sections,
  taskLabels,
  citations,
}: {
  runId: string;
  brief?: ResearchBrief;
  coverage?: ResearchCoverage;
  progress?: Record<string, ResearchProgress>;
  result?: AgentResult;
  sections?: Record<string, { title: string; status: string }>;
  taskLabels?: Record<string, string>;
  citations?: AgentCitation[];
}) {
  const [brief, setBrief] = useState(suppliedBrief);
  const [coverage, setCoverage] = useState(suppliedCoverage);
  const [notes, setNotes] = useState<ResearchNote[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [located, setLocated] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    setBrief(suppliedBrief);
  }, [suppliedBrief]);
  useEffect(() => {
    setCoverage(suppliedCoverage);
  }, [suppliedCoverage]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [runId],
  );
  const load = async (offset = 0) => {
    const current = ++generation.current;
    setPending(true);
    setError('');
    try {
      const data = await getAgentResearch(runId, undefined, offset);
      if (current !== generation.current) return;
      setBrief(data.brief ?? undefined);
      setCoverage(data.coverage ?? undefined);
      setNotes((previous) =>
        offset ? [...previous, ...data.notes] : data.notes,
      );
      setNext(data.next_offset);
    } catch (e: any) {
      if (current === generation.current)
        setError(e.response?.data?.message ?? '研究记录暂时无法读取，请重试');
    } finally {
      if (current === generation.current) setPending(false);
    }
  };
  useEffect(() => {
    if (open) void load();
  }, [runId, suppliedCoverage, open]);
  const locate = (item: ResearchCoverage['items'][number]) => {
    const location = item.locations[0];
    const text =
      result?.kind === 'document'
        ? result.markdown
        : result?.kind === 'answer'
          ? result.answer
          : result?.kind === 'edits'
            ? result.edits.find((e) => e.id === location?.edit_id)
                ?.content_markdown
            : undefined;
    setLocated(
      location && text
        ? text.slice(location.start, location.end)
        : '候选尚未交付，完成后可查看对应内容',
    );
  };
  return (
    <section className="agent-research" aria-label="研究写作进度">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          研究写作
          {coverage
            ? coverage.deliverable
              ? coverage.completeness === 'complete'
                ? ' · 要求已覆盖'
                : ' · 部分满足，含资料缺口'
              : ' · 正在处理缺项'
            : ' · 收集与核对资料'}
        </summary>
        {brief && (
          <>
            <h4>{brief.goal}</h4>
            <p>
              {brief.audience && `读者：${brief.audience} · `}
              {brief.deliverable}
            </p>
            {!!brief.unknowns.length && (
              <p>尚未明确：{brief.unknowns.join('；')}</p>
            )}
            {!!brief.constraints.length && (
              <p>写作要求：{brief.constraints.join('；')}</p>
            )}
            <ol>
              {brief.questions.map((q) => (
                <li key={q.id}>{q.text}</li>
              ))}
            </ol>
          </>
        )}
        {!!Object.keys(progress ?? {}).length && (
          <ul>
            {Object.entries(progress ?? {}).map(
              ([id, item]) =>
                item.searches > 0 && (
                  <li key={id}>
                    {taskLabels?.[id] ?? '研究资料'}：已搜索 {item.searches}/3
                    次
                    {item.stop_reason &&
                      `，${stops[item.stop_reason] ?? item.stop_reason}`}
                  </li>
                ),
            )}
          </ul>
        )}
        {!!Object.keys(sections ?? {}).length && (
          <ol aria-label="章节写作进度">
            {Object.entries(sections ?? {}).map(([id, section]) => (
              <li key={id}>
                {section.title} ·{' '}
                {section.status === 'done' ? '已生成' : '正在写作'}
              </li>
            ))}
          </ol>
        )}
        {coverage && (
          <>
            <p>要求覆盖 · 候选版本 {coverage.candidate_version}</p>
            <ul>
              {coverage.items.map((item) => (
                <li key={item.question_id} data-status={item.status}>
                  <strong>
                    {brief?.questions.find((q) => q.id === item.question_id)
                      ?.text ?? item.question_id}
                    ：{labels[item.status]}
                  </strong>
                  <p>
                    {item.reason}
                    {item.gap_declared && '（草稿已明确说明缺口或分歧）'}
                  </p>
                  {!!item.locations.length && (
                    <button type="button" onClick={() => locate(item)}>
                      查看对应内容
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {located && (
          <blockquote
            className="agent-research-location"
            aria-label="对应文章内容"
          >
            {located}
          </blockquote>
        )}
        {!!notes.length && (
          <div aria-label="研究明细">
            <h4>研究明细</h4>
            {notes.map((note, index) => (
              <details key={`${note.task_id}:${note.question_id}:${index}`}>
                <summary>
                  {brief?.questions.find((q) => q.id === note.question_id)
                    ?.text ?? note.question_id}
                </summary>
                <ul>
                  {note.findings.map((finding, i) => (
                    <li key={i}>
                      {finding.statement}
                      <small>
                        来源：
                        {finding.evidence_ids
                          .map(
                            (id) =>
                              citations?.find((c) => c.id === id)?.title ??
                              '已读资料',
                          )
                          .join('、')}
                      </small>
                    </li>
                  ))}
                </ul>
                {!!note.missing.length && (
                  <p>缺口：{note.missing.join('；')}</p>
                )}
                {!!note.conflicts.length && (
                  <p>
                    冲突：{note.conflicts.map((c) => c.description).join('；')}
                  </p>
                )}
              </details>
            ))}
          </div>
        )}
        {pending && <p role="status">正在读取研究记录</p>}
        {error && <p role="alert">{error}</p>}
        <button type="button" disabled={pending} onClick={() => void load()}>
          刷新研究记录
        </button>
        {next !== null && (
          <button
            type="button"
            disabled={pending}
            onClick={() => void load(next)}
          >
            更多研究明细
          </button>
        )}
      </details>
    </section>
  );
}
