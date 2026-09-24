import { formatAngle, type Angle } from '../solver';
import type { RuleCheck } from '../solver/evidence';
import type { SolveOk } from '../solver/solve';
import { AngleChip } from './AngleChip';

export type RunOutcome =
  | { kind: 'invalid'; problems: string[] }
  | { kind: 'infeasible'; reasons: string[]; sequence: Angle[] }
  | { kind: 'ok'; solution: SolveOk; checks: RuleCheck[] };

export function ResultView({ outcome }: { outcome: RunOutcome }) {
  if (outcome.kind === 'invalid') {
    return (
      <section className="card alert-card" aria-label="输入非法">
        <h2>✕ 输入非法，已清除旧结果</h2>
        <p>请修正以下问题后重新启动综合：</p>
        <ul className="problem-list">
          {outcome.problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </section>
    );
  }

  if (outcome.kind === 'infeasible') {
    return (
      <section className="card warn-card" aria-label="确实无解">
        <h2>∅ 确实无解，已清除旧结果</h2>
        <p>输入本身合法（{outcome.sequence.length} 层），但在保持各角度数量的前提下不存在合法排列：</p>
        <ul className="problem-list">
          {outcome.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </section>
    );
  }

  const { solution, checks } = outcome;
  const n = solution.repaired.length;
  const changed = new Set(solution.changedPositions);

  return (
    <>
      <section className="card" aria-label="两级目标值">
        <div className="card-head">
          <h2>② 综合结果 · 两级目标</h2>
          <span className="badge ok">已求得全局最优解</span>
        </div>
        <div className="objectives">
          <div className="obj-card">
            <div className="obj-label">一级目标 · 改动位置数</div>
            <div className="obj-value">{solution.changes}</div>
            <div className="obj-sub">
              {solution.changes === 0
                ? '原序列已合法，无需改动'
                : `改动层：${solution.changedPositions.map((p) => p + 1).join('、')}`}
            </div>
          </div>
          <div className="obj-card">
            <div className="obj-label">二级目标 · 相邻角度变化次数</div>
            <div className="obj-value">{solution.transitions}</div>
            <div className="obj-sub">
              {solution.transitions === 0
                ? '全序列角度一致'
                : `变化层间：${solution.transitionBoundaries
                    .map((b) => `${b + 1}|${b + 2}`)
                    .join('、')}`}
            </div>
          </div>
        </div>
        <p className="hint">
          并列时按 0° → +45° → −45° → 90° 的规定次序取字典序最小方案；求解器对首半做动态规划，
          全局依次最小化两级目标，而非局部交换或首个可行排列。
        </p>
      </section>

      <section className="card" aria-label="逐层差异">
        <h2>③ 逐层比较（原序列 vs 修复结果）</h2>
        <div className="table-wrap">
          <table className="diff-table">
            <thead>
              <tr>
                <th>层号</th>
                <th>镜像层</th>
                <th>原序列</th>
                <th>修复后</th>
                <th>对比</th>
              </tr>
            </thead>
            <tbody>
              {solution.repaired.map((a, i) => (
                <tr key={i} className={changed.has(i) ? 'changed' : ''}>
                  <td className="mono">{i + 1}</td>
                  <td className="mono">{n - i}</td>
                  <td>
                    <AngleChip angle={solution.original[i]} dimmed={changed.has(i)} />
                  </td>
                  <td>
                    <AngleChip angle={a} />
                  </td>
                  <td>{changed.has(i) ? <span className="tag-changed">已改动</span> : '保留'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" aria-label="规则证据">
        <h2>④ 规则复核证据（针对修复结果）</h2>
        <div className="checks">
          {checks.map((c) => (
            <details key={c.id} className={`check ${c.pass ? 'pass' : 'fail'}`}>
              <summary>
                <span className={`check-icon ${c.pass ? 'pass' : 'fail'}`}>
                  {c.pass ? '✓' : '✗'}
                </span>
                <span className="check-title">{c.title}</span>
                <span className="check-summary">{c.summary}</span>
              </summary>
              <ul className="evidence-list">
                {c.details.map((d, i) => (
                  <li key={i} className="mono">
                    {d}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>

      <section className="card" aria-label="修复结果序列">
        <div className="card-head">
          <h2>⑤ 修复结果序列</h2>
          <CopyButton text={solution.repaired.map(serializeForCopy).join(', ')} />
        </div>
        <p className="mono result-seq">
          {solution.repaired.map((a, i) => (
            <span key={i} className={changed.has(i) ? 'seq-item changed' : 'seq-item'}>
              {formatAngle(a)}
            </span>
          ))}
        </p>
      </section>
    </>
  );
}

function serializeForCopy(a: Angle): string {
  if (a === 45) return '+45';
  if (a === -45) return '-45';
  return String(a);
}

function CopyButton({ text }: { text: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`[${text}]`);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = `[${text}]`;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };
  return (
    <button type="button" className="btn" onClick={copy}>
      复制结果
    </button>
  );
}
