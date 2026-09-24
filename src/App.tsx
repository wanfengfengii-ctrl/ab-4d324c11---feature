import { useMemo, useState } from 'react';
import { ResultView, type RunOutcome } from './components/ResultView';
import { EXAMPLES, SequenceEditor } from './components/SequenceEditor';
import { StripEditor, type StripDraft } from './components/StripEditor';
import {
  buildRuleChecks,
  buildStripCheck,
  parseSequence,
  solve,
  validateInput,
  validateStrips,
  type StripSpec,
} from './solver';

export default function App() {
  const [text, setText] = useState(EXAMPLES[0].text);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [stripMode, setStripMode] = useState(false);
  const [stripDrafts, setStripDrafts] = useState<StripDraft[]>([{ start: 1, length: 2 }]);

  // 输入实时解析（仅用于编辑反馈；综合时重新解析，保证结果与输入一致）
  const parsed = useMemo(() => parseSequence(text), [text]);

  // 条带草稿 → 求解器条带定义（起始层转 0 基，角度取自参考铺层）
  const stripSpecs = useMemo<StripSpec[]>(
    () =>
      stripDrafts.map((d) => ({
        start: d.start - 1,
        angles: parsed.sequence.slice(d.start - 1, d.start - 1 + d.length),
      })),
    [stripDrafts, parsed],
  );

  // 条带定义实时校验（仅条带模式且输入可解析时；用于编辑反馈）
  const stripProblems = useMemo(() => {
    if (!stripMode || parsed.errors.length > 0 || parsed.sequence.length === 0) return [];
    return validateStrips(parsed.sequence, stripSpecs);
  }, [stripMode, parsed, stripSpecs]);

  const handleTextChange = (next: string) => {
    setText(next);
    setOutcome(null); // 参考铺层变更即撤下旧综合结果
  };
  const handleStripModeChange = (on: boolean) => {
    setStripMode(on);
    setOutcome(null); // 模式切换即撤下旧综合结果
  };
  const handleStripDraftsChange = (drafts: StripDraft[]) => {
    setStripDrafts(drafts);
    setOutcome(null); // 条带编辑即撤下旧综合结果
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
    let specs: StripSpec[] | undefined;
    if (stripMode) {
      // 综合时按当前输入重建条带定义并复核，保证结果与输入一致
      const rebuilt: StripSpec[] = stripDrafts.map((d) => ({
        start: d.start - 1,
        angles: p.sequence.slice(d.start - 1, d.start - 1 + d.length),
      }));
      const problems = validateStrips(p.sequence, rebuilt);
      if (problems.length > 0) {
        setOutcome({ kind: 'invalid', problems });
        return;
      }
      specs = rebuilt;
    }
    const result = solve(p.sequence, specs);
    if (result.status === 'infeasible') {
      setOutcome({
        kind: 'infeasible',
        reasons: result.reasons,
        sequence: p.sequence,
        strips: stripMode,
      });
    } else {
      const checks = buildRuleChecks(result.original, result.repaired);
      if (result.stripPlacements && result.stripPlacements.length > 0) {
        checks.push(buildStripCheck(result.original, result.repaired, result.stripPlacements));
      }
      setOutcome({ kind: 'ok', solution: result, checks });
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
          enabled={stripMode}
          drafts={stripDrafts}
          sequence={parsed.errors.length === 0 && parsed.sequence.length > 0 ? parsed.sequence : null}
          problems={stripProblems}
          onToggle={handleStripModeChange}
          onDraftsChange={handleStripDraftsChange}
        />

        <div className="run-bar">
          <button type="button" className="btn primary" onClick={runSynthesis}>
            {stripMode ? '▶ 启动综合（含条带约束）' : '▶ 启动综合'}
          </button>
          <span className="hint">
            {stripMode
              ? `条带模式：${stripDrafts.length} 条条带的落位与两级目标在同一全局搜索中同时裁决`
              : '目标：依次最小化「改动位置数」与「相邻角度变化次数」，再取规定次序的字典序最小方案'}
          </span>
        </div>

        {outcome && <ResultView outcome={outcome} />}
      </main>

      <footer className="page-foot">
        求解器：对称折半动态规划（全局精确）· 条带落位与两级目标同一搜索裁决 ·
        规则证据可逐条展开复核
      </footer>
    </div>
  );
}
