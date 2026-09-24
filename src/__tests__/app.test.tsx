import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import App from '../App';
import { ResultView } from '../components/ResultView';
import { StripEditor } from '../components/StripEditor';
import { buildRuleChecks, buildStripCheck, solve, type Angle } from '../solver';

/** 服务端渲染会在插值文本间插入 <!-- --> 注释，剥离后再做整句断言 */
const text = (el: React.ReactElement) => renderToString(el).replace(/<!-- -->/g, '');

describe('App 渲染', () => {
  it('工作台骨架可渲染（输入区 + 条带约束区 + 综合按钮）', () => {
    const html = renderToString(<App />);
    expect(html).toContain('复合材料铺层序列修复工作台');
    expect(html).toContain('启动综合');
    expect(html).toContain('参考铺层');
    expect(html).toContain('不调用任何业务后端');
    expect(html).toContain('条带约束');
    expect(html).toContain('启用条带约束');
  });
});

describe('StripEditor 渲染', () => {
  const seq: Angle[] = [0, 45, 90, -45, -45, 90, 45, 0];

  it('未启用时展示说明，不展示条带行', () => {
    const html = renderToString(
      <StripEditor
        enabled={false}
        drafts={[{ start: 1, length: 2 }]}
        sequence={seq}
        problems={[]}
        onToggle={() => {}}
        onDraftsChange={() => {}}
      />,
    );
    expect(html).toContain('未启用');
    expect(html).not.toContain('起始层');
  });

  it('启用时展示条带行、角度预览与实时校验问题', () => {
    const html = renderToString(
      <StripEditor
        enabled
        drafts={[
          { start: 1, length: 2 },
          { start: 2, length: 3 },
        ]}
        sequence={seq}
        problems={['条带 1（第 1–2 层）与条带 2（第 2–4 层）在参考铺层中重叠。']}
        onToggle={() => {}}
        onDraftsChange={() => {}}
      />,
    );
    expect(html).toContain('条带 1');
    expect(html).toContain('条带 2');
    expect(html).toContain('起始层');
    expect(html).toContain('添加条带');
    expect(html).toContain('重叠');
  });

  it('参考铺层解析失败时提示预览不可用', () => {
    const html = renderToString(
      <StripEditor
        enabled
        drafts={[{ start: 1, length: 2 }]}
        sequence={null}
        problems={[]}
        onToggle={() => {}}
        onDraftsChange={() => {}}
      />,
    );
    expect(html).toContain('尚未成功解析');
  });
});

describe('ResultView 条带模式渲染', () => {
  it('展示条带落位（原始区间 / 采用区间 / 镜像位置）与逐层角度证据', () => {
    const input: Angle[] = [90, 45, -45, 0, 0, -45, 45, 90];
    const r = solve(input, [{ start: 0, angles: [90, 45] }]);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    const checks = buildRuleChecks(r.original, r.repaired);
    checks.push(buildStripCheck(r.original, r.repaired, r.stripPlacements!));
    const html = text(<ResultView outcome={{ kind: 'ok', solution: r, checks }} />);
    expect(html).toContain('条带落位与逐层证据');
    expect(html).toContain('原始区间：参考铺层第 1–2 层');
    expect(html).toContain('采用区间：修复结果首半第 2–3 层');
    expect(html).toContain('镜像位置：第 6–7 层');
    expect(html).toContain('条带层');
    expect(html).toContain('条带完整连续保留');
    expect(html).toContain('条带1');
    expect(html).toContain('条带1·镜像');
  });

  it('无条带时不展示条带证据区', () => {
    const input: Angle[] = [0, 45, 90, -45, -45, 90, 45, 0];
    const r = solve(input);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    const html = renderToString(
      <ResultView
        outcome={{ kind: 'ok', solution: r, checks: buildRuleChecks(r.original, r.repaired) }}
      />,
    );
    expect(html).not.toContain('条带落位与逐层证据');
    expect(html).not.toContain('条带完整连续保留');
  });

  it('条带阻断的无解结果说明阻断原因并提示已清除旧结果', () => {
    const input: Angle[] = [90, 0, 45, -45, -45, 45, 0, 90];
    const r = solve(input, [{ start: 0, angles: [90, 0] }]);
    expect(r.status).toBe('infeasible');
    if (r.status !== 'infeasible') return;
    const html = renderToString(
      <ResultView
        outcome={{ kind: 'infeasible', reasons: r.reasons, sequence: input, strips: true }}
      />,
    );
    expect(html).toContain('确实无解，已清除旧结果');
    expect(html).toContain('无法在首半共同落位');
    expect(html).toContain('完整连续保留所选条带');
  });
});
