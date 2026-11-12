import type {
  AgentReplanning,
  AgentVerification,
} from '@/api/document-agent.types';
import type { GraphRun } from '@/api/document-agent-graph';

const labels: Record<AgentVerification['status'], string> = {
  checking: '正在核验证据',
  repairing: '正在修正核验问题',
  rechecking: '正在复验修正结果',
  passed: '证据核验通过',
  incomplete: '证据核验未完成',
};

export default function AgentVerificationProgress({
  verification,
  replanning,
  steps,
  waiting,
}: {
  verification?: AgentVerification;
  replanning?: AgentReplanning;
  steps: Record<string, { description: string; status: string }>;
  waiting?: GraphRun['waiting'];
}) {
  const failures =
    waiting?.value.type === 'retry' ? (waiting.value.failures ?? []) : [];
  if (!verification && !replanning && !failures.length) return null;
  return (
    <section className="agent-verification" aria-label="核验与重规划进度">
      {verification && (
        <>
          <div className="agent-verification-status" role="status">
            <strong>{labels[verification.status]}</strong>
            <small>候选版本 {verification.candidate_version}</small>
          </div>
          {verification.message && <p>{verification.message}</p>}
          {!!verification.issues?.length && (
            <ul>
              {verification.issues.map((issue, index) => (
                <li key={index}>{issue.description}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {replanning && (
        <details open>
          <summary>已调整执行计划 · 版本 {replanning.plan_version}</summary>
          {!!replanning.invalidated_steps.length && (
            <div>
              <strong>受影响步骤</strong>
              <ul>
                {replanning.invalidated_steps.map((id) => (
                  <li key={id}>{steps[id]?.description ?? id}</li>
                ))}
              </ul>
            </div>
          )}
          {!!replanning.reused_steps.length && (
            <div>
              <strong>复用已完成步骤</strong>
              <ul>
                {replanning.reused_steps.map((id) => (
                  <li key={id}>{steps[id]?.description ?? id}</li>
                ))}
              </ul>
            </div>
          )}
        </details>
      )}
      {!!failures.length && (
        <div role="status">
          <strong>任务等待继续</strong>
          <ul>
            {failures.map((failure) => (
              <li key={failure.step_id}>
                {steps[failure.step_id]?.description ?? failure.step_id}
                {' · '}
                {failure.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
