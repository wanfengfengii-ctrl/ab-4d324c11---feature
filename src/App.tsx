import { useMemo, useState } from 'react';
import { ResultView, type RunOutcome } from './components/ResultView';
import { EXAMPLES, SequenceEditor } from './components/SequenceEditor';
import { buildRuleChecks, parseSequence, solve, validateInput } from './solver';

export default function App() {
  const [text, setText] = useState(EXAMPLES[0].text);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);

  // 输入实时解析（仅用于编辑反馈；综合时重新解析，保证结果与输入一致）
  const parsed = useMemo(() => parseSequence(text), [text]);

  const handleTextChange = (next: string) => {
    setText(next);
    setOutcome(null); // 输入变更即清除旧结果，避免展示过期结论
  };

  const runSynthesis = () => {
    const p = parseSequence(text);
    if (p.errors.length > 0) {
      setOutcome({ kind: 'invalid', problems: p.errors });
      return;
    }
    const inputErrors = validateInput(p.sequence);
    if (inputErrors.length > 0) {
      setOutcome({ kind: 'invalid', problems: inputErrors });
      return;
    }
    const result = solve(p.sequence);
    if (result.status === 'infeasible') {
      setOutcome({ kind: 'infeasible', reasons: result.reasons, sequence: p.sequence });
    } else {
      setOutcome({
        kind: 'ok',
        solution: result,
        checks: buildRuleChecks(result.original, result.repaired),
      });
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>复合材料铺层序列修复工作台</h1>
        <p className="subtitle">
          纯前端运行：解析、综合与复核全部在浏览器内完成，不调用任何业务后端。
          合法序列：4–48 偶数层 · 角度 ∈ {'{'}0°, +45°, −45°, 90°{'}'} · 各角度数量保持 ·
          中面对称 · +45°/−45° 等量 · 表面非 90° · 相邻角差 ≤ 45°（180° 周期）· 同角连续 ≤ 3 层
        </p>
      </header>

      <main>
        <SequenceEditor text={text} parsed={parsed} onTextChange={handleTextChange} />

        <div className="run-bar">
          <button type="button" className="btn primary" onClick={runSynthesis}>
            ▶ 启动综合
          </button>
          <span className="hint">
            目标：依次最小化「改动位置数」与「相邻角度变化次数」，再取规定次序的字典序最小方案
          </span>
        </div>

        {outcome && <ResultView outcome={outcome} />}
      </main>

      <footer className="page-foot">
        求解器：对称折半动态规划（全局精确）· 规则证据可逐条展开复核
      </footer>
    </div>
  );
}
