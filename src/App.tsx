import { useMemo, useState } from 'react';
import { ResultView, type RunOutcome } from './components/ResultView';
import { EXAMPLES, SequenceEditor } from './components/SequenceEditor';
import { StripEditor } from './components/StripEditor';
import {
  buildRuleChecks,
  parseSequence,
  solve,
  validateInput,
  validateStrips,
  type StripSpec,
} from './solver';

export default function App() {
  const [text, setText] = useState(EXAMPLES[0].text);
  const [stripEnabled, setStripEnabled] = useState(false);
  const [stripSpecs, setStripSpecs] = useState<StripSpec[]>([{ start: 0, length: 2 }]);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);

  // 输入实时解析（仅用于编辑反馈；综合时重新解析，保证结果与输入一致）
  const parsed = useMemo(() => parseSequence(text), [text]);
  const inputErrors = useMemo(() => validateInput(parsed.sequence), [parsed.sequence]);
  // 首半仅在参考铺层可解析且层数合法为偶数时有定义
  const half =
    parsed.errors.length === 0 && inputErrors.length === 0 && parsed.sequence.length % 2 === 0
      ? parsed.sequence.length / 2
      : null;

  const stripCheck = useMemo(() => {
    if (!stripEnabled || half === null) return { valid: false, errors: [] as string[], strips: [] };
    return validateStrips(parsed.sequence, stripSpecs);
  }, [stripEnabled, half, parsed.sequence, stripSpecs]);

  const handleTextChange = (next: string) => {
    setText(next);
    setOutcome(null); // 输入变更即清除旧结果，避免展示过期结论
  };

  const handleStripToggle = (enabled: boolean) => {
    setStripEnabled(enabled);
    if (enabled && stripSpecs.length === 0) {
      setStripSpecs([{ start: 0, length: 2 }]);
    }
    setOutcome(null); // 模式切换即撤下旧综合结果
  };

  const handleStripChange = (specs: StripSpec[]) => {
    setStripSpecs(specs);
    setOutcome(null); // 条带编辑即撤下旧综合结果
  };

  const runSynthesis = () => {
    const p = parseSequence(text);
    if (p.errors.length > 0) {
      setOutcome({ kind: 'invalid', problems: p.errors });
      return;
    }
    const errs = validateInput(p.sequence);
    if (errs.length > 0) {
      setOutcome({ kind: 'invalid', problems: errs });
      return;
    }
    if (stripEnabled) {
      const sv = validateStrips(p.sequence, stripSpecs);
      if (!sv.valid) {
        setOutcome({ kind: 'invalid', problems: sv.errors });
        return;
      }
      const result = solve(p.sequence, { strips: sv.strips });
      if (result.status === 'infeasible') {
        setOutcome({ kind: 'infeasible', reasons: result.reasons, sequence: p.sequence, stripMode: true });
      } else {
        setOutcome({
          kind: 'ok',
          solution: result,
          checks: buildRuleChecks(result.original, result.repaired),
        });
      }
      return;
    }
    const result = solve(p.sequence);
    if (result.status === 'infeasible') {
      setOutcome({ kind: 'infeasible', reasons: result.reasons, sequence: p.sequence, stripMode: false });
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

        <StripEditor
          sequence={parsed.sequence}
          half={half}
          enabled={stripEnabled}
          specs={stripSpecs}
          problems={stripCheck.errors}
          onToggle={handleStripToggle}
          onChange={handleStripChange}
        />

        <div className="run-bar">
          <button type="button" className="btn primary" onClick={runSynthesis}>
            ▶ 启动综合{stripEnabled ? '（带条带约束）' : ''}
          </button>
          <span className="hint">
            {stripEnabled
              ? '同一次全局搜索中联合裁决条带落位、改动位置数、相邻变化次数与字典序'
              : '目标：依次最小化「改动位置数」与「相邻角度变化次数」，再取规定次序的字典序最小方案'}
          </span>
        </div>

        {outcome && <ResultView outcome={outcome} />}
      </main>

      <footer className="page-foot">
        求解器：对称折半动态规划（全局精确）{stripEnabled ? '，条带落位与两级目标同搜索联合裁决' : ''}·
        规则证据可逐条展开复核
      </footer>
    </div>
  );
}
