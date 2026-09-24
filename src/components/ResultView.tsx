import { formatAngle, type Angle } from '../solver';
import type { RuleCheck } from '../solver/evidence';
import type { SolveOk, StripPlacement } from '../solver/solve';
import { AngleChip } from './AngleChip';

export type RunOutcome =
  | { kind: 'invalid'; problems: string[] }
  | { kind: 'infeasible'; reasons: string[]; sequence: Angle[]; stripMode: boolean }
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
    const blockedByStrips = outcome.reasons.some((r) => r.includes('条带无法共同放置'));
    return (
      <section className="card warn-card" aria-label="确实无解">
        <h2>∅ {blockedByStrips ? '条带无法共同放置' : '确实无解'}，已清除旧结果</h2>
        <p>
          输入本身合法（{outcome.sequence.length} 层
          {outcome.stripMode ? '，条带模式开启' : ''}），但在保持各角度数量的前提下不存在满足全部约束的排列：
        </p>
        <ul className="problem-list">
          {outcome.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        <p className="hint">
          旧综合结论已撤下。可尝试放宽条带（减少条数、缩短长度或更换原始区间）后重新综合；
          或关闭条带模式查看无工艺约束的最优修复。
        </p>
      </section>
    );
  }

  const { solution, checks } = outcome;
  const n = solution.repaired.length;
  const changed = new Set(solution.changedPositions);
  const stripMode = solution.stripMode;
  // 条带采用区间（含镜像）覆盖的层，用于差异表与结果序列高亮
  const stripCovered = new Set<number>();
  if (stripMode) {
    for (const p of solution.stripPlacements) {
      for (let i = p.adoptedStart; i < p.adoptedEnd; i++) stripCovered.add(i);
      for (let i = p.mirrorStart; i < p.mirrorEnd; i++) stripCovered.add(i);
    }
  }
  const stripOfAdopted = new Map<number, number>();
  if (stripMode) {
    solution.stripPlacements.forEach((p, k) => {
      for (let i = p.adoptedStart; i < p.adoptedEnd; i++) stripOfAdopted.set(i, k);
    });
  }

  return (
    <>
      <section className="card" aria-label="两级目标值">
        <div className="card-head">
          <h2>{stripMode ? '③' : '②'} 综合结果 · 两级目标</h2>
          <span className="badge ok">已求得全局最优解{stripMode ? '（带条带约束）' : ''}</span>
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
          {stripMode &&
            '条带模式下，条带落位是同一 DP 状态的一部分，与两级目标和字典序在同一次全局搜索中联合裁决（非先出方案再筛选）。'}
        </p>
      </section>

      {stripMode && (
        <StripEvidenceCard placements={solution.stripPlacements} repaired={solution.repaired} total={n} />
      )}

      <section className="card" aria-label="逐层差异">
        <h2>{stripMode ? '⑤' : '③'} 逐层比较（原序列 vs 修复结果）</h2>
        <div className="table-wrap">
          <table className="diff-table">
            <thead>
              <tr>
                <th>层号</th>
                <th>镜像层</th>
                <th>原序列</th>
                <th>修复后</th>
                <th>对比</th>
                {stripMode && <th>条带</th>}
              </tr>
            </thead>
            <tbody>
              {solution.repaired.map((a, i) => {
                const adoptedIdx = stripOfAdopted.get(i);
                const inStrip = stripCovered.has(i);
                return (
                  <tr
                    key={i}
                    className={[
                      changed.has(i) ? 'changed' : '',
                      inStrip ? 'strip-row' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <td className="mono">{i + 1}</td>
                    <td className="mono">{n - i}</td>
                    <td>
                      <AngleChip angle={solution.original[i]} dimmed={changed.has(i)} />
                    </td>
                    <td>
                      <AngleChip angle={a} />
                    </td>
                    <td>{changed.has(i) ? <span className="tag-changed">已改动</span> : '保留'}</td>
                    {stripMode && (
                      <td>
                        {adoptedIdx !== undefined ? (
                          <span className="tag-strip">第 {adoptedIdx + 1} 条·采用</span>
                        ) : inStrip ? (
                          <span className="tag-strip-mirror">镜像</span>
                        ) : (
                          ''
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" aria-label="规则证据">
        <h2>{stripMode ? '⑥' : '④'} 规则复核证据（针对修复结果）</h2>
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
          <h2>{stripMode ? '⑦' : '⑤'} 修复结果序列</h2>
          <CopyButton text={solution.repaired.map(serializeForCopy).join(', ')} />
        </div>
        <p className="mono result-seq">
          {solution.repaired.map((a, i) => (
            <span
              key={i}
              className={[
                changed.has(i) ? 'seq-item changed' : 'seq-item',
                stripCovered.has(i) ? 'strip-covered' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {formatAngle(a)}
            </span>
          ))}
        </p>
        {stripMode && (
          <p className="hint">高亮（紫色描边）为条带采用区间及其中面镜像区间。</p>
        )}
      </section>
    </>
  );
}

/** 条带落位证据：逐条显示原始区间、采用区间、镜像位置与逐层角度证据 */
function StripEvidenceCard({
  placements,
  repaired,
  total,
}: {
  placements: StripPlacement[];
  repaired: readonly Angle[];
  total: number;
}) {
  return (
    <section className="card strip-card" aria-label="条带落位证据">
      <div className="card-head">
        <h2>④ 工艺条带落位证据</h2>
        <span className="badge ok">{placements.length} 条条带全部完整落位、互不重叠</span>
      </div>
      <p className="hint">
        每条条带的角度顺序在修复结果首半的「采用区间」完整连续出现，并在中面另一侧「镜像区间」逆序复现；
        下表逐层给出条带要求角度与修复结果实际角度，可逐层核对相等性。
      </p>
      <div className="strip-evidence-list">
        {placements.map((p, k) => {
          const adoptedAngles = repaired.slice(p.adoptedStart, p.adoptedEnd);
          const mirrorAngles = repaired.slice(p.mirrorStart, p.mirrorEnd);
          const adoptedMatch = adoptedAngles.every((a, t) => a === p.pattern[t]);
          return (
            <details key={k} className="strip-evidence" open>
              <summary>
                <span className="strip-badge">第 {k + 1} 条</span>
                <span className="mono">{p.pattern.map(formatAngle).join(' → ')}</span>
                <span className={`check-icon ${adoptedMatch ? 'pass' : 'fail'}`}>
                  {adoptedMatch ? '✓ 逐层一致' : '✗ 不一致'}
                </span>
              </summary>
              <table className="strip-evidence-table">
                <tbody>
                  <tr>
                    <th>原始区间（参考铺层）</th>
                    <td className="mono">
                      首半第 {p.originalStart + 1}–{p.originalEnd} 层（全板第 {p.originalStart + 1}–
                      {p.originalEnd} 层）
                    </td>
                  </tr>
                  <tr>
                    <th>修复后采用区间</th>
                    <td className="mono">
                      首半第 {p.adoptedStart + 1}–{p.adoptedEnd} 层（全板第 {p.adoptedStart + 1}–
                      {p.adoptedEnd} 层）
                    </td>
                  </tr>
                  <tr>
                    <th>镜像位置（中面另一侧）</th>
                    <td className="mono">
                      全板第 {p.mirrorStart + 1}–{p.mirrorEnd} 层
                    </td>
                  </tr>
                  <tr>
                    <th>逐层角度证据 · 采用区间</th>
                    <td>
                      <table className="layer-angle-table">
                        <thead>
                          <tr>
                            <th></th>
                            {p.pattern.map((_, t) => (
                              <th key={t}>第 {p.adoptedStart + t + 1} 层</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>条带要求</td>
                            {p.pattern.map((a, t) => (
                              <td key={t}>
                                <AngleChip angle={a} />
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td>修复结果</td>
                            {adoptedAngles.map((a, t) => (
                              <td key={t}>
                                <AngleChip angle={a} />
                                <span className={`match-mark ${a === p.pattern[t] ? 'ok' : 'bad'}`}>
                                  {a === p.pattern[t] ? '✓' : '✗'}
                                </span>
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <th>逐层角度证据 · 镜像区间</th>
                    <td>
                      <table className="layer-angle-table">
                        <thead>
                          <tr>
                            <th></th>
                            {p.pattern.map((_, t) => (
                              <th key={t}>第 {p.mirrorStart + t + 1} 层</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>修复结果</td>
                            {mirrorAngles.map((a, t) => (
                              <td key={t}>
                                <AngleChip angle={a} />
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td>应对称于</td>
                      {p.pattern.map((_, t) => (
                        <td key={t} className="mono mirror-ref">
                          第 {p.adoptedEnd - t} 层
                        </td>
                      ))}
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <th>镜像对应（逐层）</th>
                    <td className="mono">
                      {p.pattern.map((a, t) => {
                        const up = p.adoptedStart + t + 1;
                        const down = total - p.adoptedStart - t;
                        return (
                          <span key={t} className="mirror-pair">
                            第 {up} 层 {formatAngle(a)} ↔ 第 {down} 层 {formatAngle(a)}
                          </span>
                        );
                      })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </details>
          );
        })}
      </div>
    </section>
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
