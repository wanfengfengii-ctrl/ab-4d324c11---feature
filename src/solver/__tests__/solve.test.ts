import { describe, expect, it } from 'vitest';
import { buildRuleChecks } from '../evidence';
import { solve } from '../solve';
import type { Angle } from '../angles';

/** 手工核算用例：均已按规则逐条验证（见各断言注释） */
describe('solve（手工核算用例）', () => {
  it('已合法序列原样返回，改动 0', () => {
    // 对称、表面 0°、相邻角差均 45°、中面 −45°×2、各角度各 2 层
    const input: Angle[] = [0, 45, 90, -45, -45, 90, 45, 0];
    const r = solve(input);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.repaired).toEqual(input);
    expect(r.changes).toBe(0);
    expect(r.transitions).toBe(6);
    expect(r.changedPositions).toEqual([]);
  });

  it('表面 90° 且含 45/−45 相邻的序列被修复（改动 4，变化 6）', () => {
    // 原序列对称但第 1/8 层为 90°，且 45° 与 −45° 相邻（角差 90°）。
    // 枚举全部合法首半后可证：改动数最小为 4，唯一最优首半为 [45, 90, -45, 0]。
    const input: Angle[] = [90, 45, -45, 0, 0, -45, 45, 90];
    const r = solve(input);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.repaired).toEqual([45, 90, -45, 0, 0, -45, 90, 45]);
    expect(r.changes).toBe(4);
    expect(r.transitions).toBe(6);
    expect(r.changedPositions).toEqual([0, 1, 6, 7]);
  });

  it('并列最优时按规定次序取字典序最小', () => {
    // 首半须为 {0,45,-45,90} 的排列；全部合法排列改动数均为 6、变化均为 3，
    // 字典序最小首半为 [0, 45, 90, -45]（优于 [0, -45, 90, 45]）。
    const input: Angle[] = [0, 0, 45, 45, -45, -45, 90, 90];
    const r = solve(input);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.repaired).toEqual([0, 45, 90, -45, -45, 90, 45, 0]);
    expect(r.changes).toBe(6);
    expect(r.transitions).toBe(6);
  });

  it('同角连续 3 层的合法序列不被破坏', () => {
    // 0°×3 连续段（恰好上限），中面 90°×2
    const input: Angle[] = [45, 0, 0, 0, -45, 90, 90, -45, 0, 0, 0, 45];
    const r = solve(input);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.repaired).toEqual(input);
    expect(r.changes).toBe(0);
    expect(r.transitions).toBe(6);
  });

  it('奇数角度数量 → 无解（对称要求偶数）', () => {
    const r = solve([0, 0, 0, 45, 45, -45, -45, 90]);
    expect(r.status).toBe('infeasible');
    if (r.status !== 'infeasible') return;
    expect(r.reasons.join('')).toContain('0°');
    expect(r.reasons.join('')).toContain('奇数');
  });

  it('+45° 与 −45° 数量不等 → 无解', () => {
    const r = solve([0, 0, 45, 45, 45, 45, -45, -45]);
    expect(r.status).toBe('infeasible');
    if (r.status !== 'infeasible') return;
    expect(r.reasons.join('')).toContain('数量不等');
  });

  it('90° 超过内部位置数 → 无解', () => {
    const r = solve([90, 90, 90, 90]);
    expect(r.status).toBe('infeasible');
    if (r.status !== 'infeasible') return;
    expect(r.reasons.join('')).toContain('90°');
  });

  it('单一角度 4 层：中面处必出现 4 连 → 无解', () => {
    const r = solve([0, 0, 0, 0]);
    expect(r.status).toBe('infeasible');
  });

  it('90° 只能上表面却禁止 → 无解', () => {
    // 首半须含一个 0° 一个 90°：0° 与 90° 不能相邻，90° 又不能上表面
    const r = solve([90, 0, 0, 90]);
    expect(r.status).toBe('infeasible');
  });

  it('±45° 在 4 层中无法相邻安置 → 无解', () => {
    const r = solve([45, -45, -45, 45]);
    expect(r.status).toBe('infeasible');
  });

  it('修复结果通过全部规则证据复核', () => {
    const input: Angle[] = [90, 45, -45, 0, 0, -45, 45, 90];
    const r = solve(input);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    const checks = buildRuleChecks(r.original, r.repaired);
    expect(checks).toHaveLength(8);
    for (const c of checks) {
      expect(c.pass, `规则 ${c.id} 应通过`).toBe(true);
      expect(c.details.length).toBeGreaterThan(0);
    }
  });
});
