import { describe, expect, it } from 'vitest';
import {
  ANGLES,
  ANGLE_INDEX,
  MAX_ADJACENT_DIFF,
  MAX_RUN,
  angleDiff,
  type Angle,
} from '../angles';
import { buildRuleChecks, buildStripCheck } from '../evidence';
import { solve, type SolveOk } from '../solve';
import { validateStrips, type StripSpec } from '../strips';

/** 可复现伪随机数（mulberry32） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 独立实现的完整规则检查（用于验证，不与求解器共享逻辑） */
function isValidFull(seq: readonly Angle[]): boolean {
  const n = seq.length;
  if (n < 4 || n > 48 || n % 2 !== 0) return false;
  if (seq[0] === 90 || seq[n - 1] === 90) return false;
  const counts = [0, 0, 0, 0];
  for (const a of seq) counts[ANGLE_INDEX[a]]++;
  if (counts[1] !== counts[2]) return false;
  for (let i = 0; i < n / 2; i++) {
    if (seq[i] !== seq[n - 1 - i]) return false;
  }
  for (let i = 0; i < n - 1; i++) {
    if (angleDiff(seq[i], seq[i + 1]) > MAX_ADJACENT_DIFF) return false;
  }
  let run = 1;
  for (let i = 1; i < n; i++) {
    run = seq[i] === seq[i - 1] ? run + 1 : 1;
    if (run > MAX_RUN) return false;
  }
  return true;
}

/** 首半排列（角度下标）中是否存在互不重叠的条带落位（回溯搜索） */
function stripsPlaceable(perm: readonly number[], strips: readonly number[][]): boolean {
  const used = new Array<boolean>(perm.length).fill(false);
  const rec = (i: number): boolean => {
    if (i === strips.length) return true;
    const s = strips[i];
    for (let p = 0; p + s.length <= perm.length; p++) {
      let ok = true;
      for (let k = 0; k < s.length; k++) {
        if (used[p + k] || perm[p + k] !== s[k]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      for (let k = 0; k < s.length; k++) used[p + k] = true;
      if (rec(i + 1)) return true;
      for (let k = 0; k < s.length; k++) used[p + k] = false;
    }
    return false;
  };
  return rec(0);
}

interface BruteBest {
  changes: number;
  transitions: number;
  seq: Angle[];
}

function lexKey(seq: readonly Angle[]): number[] {
  return seq.map((a) => ANGLE_INDEX[a]);
}

function bruteLess(a: BruteBest, b: BruteBest): boolean {
  if (a.changes !== b.changes) return a.changes < b.changes;
  if (a.transitions !== b.transitions) return a.transitions < b.transitions;
  const ka = lexKey(a.seq);
  const kb = lexKey(b.seq);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] < kb[i];
  }
  return false;
}

/**
 * 暴力基准（条带模式）：枚举首半多重集合的全部不同排列，
 * 要求存在互不重叠的条带落位，拼出对称全序列后逐条检查规则，
 * 按 (改动数, 变化次数, 字典序) 取全局最优。
 */
function bruteForce(original: readonly Angle[], strips: readonly StripSpec[]): BruteBest | null {
  const n = original.length;
  const half = n / 2;
  const totals = [0, 0, 0, 0];
  for (const a of original) totals[ANGLE_INDEX[a]]++;
  if (totals.some((t) => t % 2 !== 0)) return null;
  if (totals[1] !== totals[2]) return null;
  const stripIdx = strips.map((s) => s.angles.map((a) => ANGLE_INDEX[a]));

  const remaining = totals.map((t) => t / 2);
  const perm: number[] = [];
  let best: BruteBest | null = null;

  const visit = (): void => {
    if (perm.length === half) {
      if (!stripsPlaceable(perm, stripIdx)) return;
      const firstHalf = perm.map((i) => ANGLES[i]);
      const full: Angle[] = [...firstHalf, ...firstHalf.slice().reverse()];
      if (!isValidFull(full)) return;
      let changes = 0;
      for (let i = 0; i < n; i++) if (full[i] !== original[i]) changes++;
      let transitions = 0;
      for (let i = 0; i < n - 1; i++) if (full[i] !== full[i + 1]) transitions++;
      const cand: BruteBest = { changes, transitions, seq: full };
      if (!best || bruteLess(cand, best)) best = cand;
      return;
    }
    for (let ai = 0; ai < ANGLES.length; ai++) {
      if (remaining[ai] === 0) continue;
      remaining[ai]--;
      perm.push(ai);
      visit();
      perm.pop();
      remaining[ai]++;
    }
  };
  visit();
  return best;
}

/** 生成满足数量前提（各角度偶数、±45 等量）的随机序列 */
function randomFeasibleMultisetSequence(rand: () => number, n: number): Angle[] {
  const half = n / 2;
  const halfCounts = [0, 0, 0, 0];
  let rem = half;
  while (rem > 0) {
    if (rand() < 0.3 && rem >= 2) {
      halfCounts[1]++;
      halfCounts[2]++;
      rem -= 2;
    } else {
      halfCounts[rand() < 0.5 ? 0 : 3]++;
      rem--;
    }
  }
  const seq: Angle[] = [];
  for (let ai = 0; ai < 4; ai++) {
    for (let k = 0; k < halfCounts[ai] * 2; k++) seq.push(ANGLES[ai]);
  }
  for (let i = seq.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [seq[i], seq[j]] = [seq[j], seq[i]];
  }
  return seq;
}

/** 从参考铺层首半随机选定 1–3 条互不重叠、长度 2–4 的条带 */
function randomStrips(rand: () => number, seq: Angle[]): StripSpec[] {
  const half = seq.length / 2;
  const specs: StripSpec[] = [];
  const want = 1 + Math.floor(rand() * 3);
  for (let tries = 0; tries < 60 && specs.length < want; tries++) {
    const len = 2 + Math.floor(rand() * 3);
    if (len > half) continue;
    const start = Math.floor(rand() * (half - len + 1));
    if (specs.some((s) => start < s.start + s.angles.length && s.start < start + len)) continue;
    specs.push({ start, angles: seq.slice(start, start + len) });
  }
  specs.sort((a, b) => a.start - b.start);
  if (specs.length === 0 && half >= 2) {
    specs.push({ start: 0, angles: seq.slice(0, 2) });
  }
  return specs;
}

/** 校验落位结果与修复序列、原序列、镜像关系完全一致且互不重叠 */
function expectPlacementsConsistent(r: SolveOk, strips: readonly StripSpec[]): void {
  const n = r.repaired.length;
  const pls = r.stripPlacements;
  expect(pls).toBeDefined();
  expect(pls!).toHaveLength(strips.length);
  const occupied = new Set<number>();
  pls!.forEach((pl, i) => {
    expect(pl.index).toBe(i);
    expect(pl.angles).toEqual([...strips[i].angles]);
    expect(pl.originalStart).toBe(strips[i].start);
    expect(pl.originalEnd).toBe(strips[i].start + strips[i].angles.length);
    expect(pl.placedEnd).toBe(pl.placedStart + pl.angles.length);
    expect(pl.placedStart).toBeGreaterThanOrEqual(0);
    expect(pl.placedEnd).toBeLessThanOrEqual(n / 2);
    expect(pl.mirrorStart).toBe(n - pl.placedEnd);
    expect(pl.mirrorEnd).toBe(n - pl.placedStart);
    for (let k = 0; k < pl.angles.length; k++) {
      expect(r.original[pl.originalStart + k]).toBe(pl.angles[k]);
      expect(r.repaired[pl.placedStart + k]).toBe(pl.angles[k]);
      expect(r.repaired[n - 1 - (pl.placedStart + k)]).toBe(pl.angles[k]);
      expect(occupied.has(pl.placedStart + k)).toBe(false);
      occupied.add(pl.placedStart + k);
    }
  });
}

describe('solve 条带模式（手工核算用例）', () => {
  it('条带本就在最优解中：改动 0，落位即原位', () => {
    // 原序列已合法；条带 [0°, +45°] 位于首半第 1–2 层
    const input: Angle[] = [0, 45, 90, -45, -45, 90, 45, 0];
    const r = solve(input, [{ start: 0, angles: [0, 45] }]);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.repaired).toEqual(input);
    expect(r.changes).toBe(0);
    expectPlacementsConsistent(r, [{ start: 0, angles: [0, 45] }]);
    const pl = r.stripPlacements![0];
    expect(pl.placedStart).toBe(0);
    expect(pl.placedEnd).toBe(2);
    expect(pl.mirrorStart).toBe(6);
    expect(pl.mirrorEnd).toBe(8);
  });

  it('条带改变最优解：首半 [90°,+45°] 被迫保留，改动数 4 → 6', () => {
    // 无约束最优首半为 [45, 90, -45, 0]（改动 4），其中不含连续 [90, 45]。
    // 枚举含条带 [90, 45] 的全部首半：仅 [-45, 90, 45, 0]（改动 6）与
    // [0, -45, 90, 45]（改动 8）合法，故唯一最优为前者，条带落于首半第 2–3 层。
    const input: Angle[] = [90, 45, -45, 0, 0, -45, 45, 90];
    const unconstrained = solve(input);
    expect(unconstrained.status).toBe('ok');
    if (unconstrained.status !== 'ok') return;
    expect(unconstrained.changes).toBe(4);

    const strips: StripSpec[] = [{ start: 0, angles: [90, 45] }];
    const r = solve(input, strips);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.repaired).toEqual([-45, 90, 45, 0, 0, 45, 90, -45]);
    expect(r.changes).toBe(6);
    expect(r.transitions).toBe(6);
    expect(r.changedPositions).toEqual([0, 1, 2, 5, 6, 7]);
    expectPlacementsConsistent(r, strips);
    const pl = r.stripPlacements![0];
    expect(pl.placedStart).toBe(1);
    expect(pl.placedEnd).toBe(3);
    expect(pl.mirrorStart).toBe(5);
    expect(pl.mirrorEnd).toBe(7);
  });

  it('多条带共同落位：两条条带恰好铺满首半，唯一合法排布即原序列', () => {
    // 条带 [0°,+45°]（第 1–2 层）与 [90°,−45°]（第 3–4 层）合计 4 层 = 首半长度，
    // 仅 [0,45,90,-45] 合法（[90,-45,0,45] 表面为 90° 非法）。
    const input: Angle[] = [0, 45, 90, -45, -45, 90, 45, 0];
    const strips: StripSpec[] = [
      { start: 0, angles: [0, 45] },
      { start: 2, angles: [90, -45] },
    ];
    const r = solve(input, strips);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.repaired).toEqual(input);
    expect(r.changes).toBe(0);
    expectPlacementsConsistent(r, strips);
    expect(r.stripPlacements![0].placedStart).toBe(0);
    expect(r.stripPlacements![1].placedStart).toBe(2);
    expect(r.stripPlacements![1].mirrorStart).toBe(4);
    expect(r.stripPlacements![1].mirrorEnd).toBe(6);
  });

  it('条带内部角差超限（90°→0°）：原本可修的输入被判条带阻断', () => {
    // 同一输入不带条带时可修复；条带 [90°, 0°] 角差 90° > 45°，任何落位都非法
    const input: Angle[] = [90, 0, 45, -45, -45, 45, 0, 90];
    expect(solve(input).status).toBe('ok');
    const r = solve(input, [{ start: 0, angles: [90, 0] }]);
    expect(r.status).toBe('infeasible');
    if (r.status !== 'infeasible') return;
    expect(r.reasons[0]).toContain('条带');
    expect(r.reasons[0]).toContain('无法在首半共同落位');
    expect(r.reasons.join('')).toContain('90° → 0°');
  });

  it('条带内部角差超限（+45°→−45°）：同样被阻断', () => {
    const input: Angle[] = [45, -45, 0, 90, 90, 0, -45, 45];
    expect(solve(input).status).toBe('ok');
    const r = solve(input, [{ start: 0, angles: [45, -45] }]);
    expect(r.status).toBe('infeasible');
    if (r.status !== 'infeasible') return;
    expect(r.reasons[0]).toContain('无法在首半共同落位');
  });

  it('条带含 90° 且只能落于表面：阻断', () => {
    // 首半仅 2 层，条带 [90°, 0°] 若落位必占表面层 → 无解
    const input: Angle[] = [90, 0, 0, 90];
    const r = solve(input, [{ start: 0, angles: [90, 0] }]);
    expect(r.status).toBe('infeasible');
  });

  it('修复结果通过全部规则证据与条带证据复核', () => {
    const input: Angle[] = [90, 45, -45, 0, 0, -45, 45, 90];
    const strips: StripSpec[] = [{ start: 0, angles: [90, 45] }];
    const r = solve(input, strips);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    const checks = buildRuleChecks(r.original, r.repaired);
    expect(checks).toHaveLength(8);
    const stripCheck = buildStripCheck(r.original, r.repaired, r.stripPlacements!);
    expect(stripCheck.pass).toBe(true);
    expect(stripCheck.details.length).toBeGreaterThan(0);
    for (const c of [...checks, stripCheck]) {
      expect(c.pass, `规则 ${c.id} 应通过`).toBe(true);
    }
  });
});

describe('solve 条带模式（关闭时语义不变）', () => {
  const inputs: Angle[][] = [
    [0, 45, 90, -45, -45, 90, 45, 0],
    [90, 45, -45, 0, 0, -45, 45, 90],
    [0, 0, 45, 45, -45, -45, 90, 90],
    [0, 0, 0, 45, 45, -45, -45, 90], // 无解：0° 为奇数
    [0, 0, 0, 0], // 无解：中面 4 连
  ];
  it('不传条带 / 传空数组 / 显式 undefined 三者结果完全一致', () => {
    for (const input of inputs) {
      const a = solve(input);
      const b = solve(input, []);
      const c = solve(input, undefined);
      expect(b).toEqual(a);
      expect(c).toEqual(a);
      if (a.status === 'ok') expect(a.stripPlacements).toBeUndefined();
    }
  });
});

describe('validateStrips（条带定义校验）', () => {
  const seq: Angle[] = [0, 45, 90, -45, 90, 0, 0, 90, -45, 90, 45, 0]; // n=12，首半 6 层

  it('合法定义通过', () => {
    expect(
      validateStrips(seq, [
        { start: 0, angles: [0, 45] },
        { start: 2, angles: [90, -45, 90] },
      ]),
    ).toEqual([]);
  });

  it('未选定条带 / 条带过多', () => {
    expect(validateStrips(seq, []).join('')).toContain('未选定条带');
    const four: StripSpec[] = [
      { start: 0, angles: [0, 45] },
      { start: 2, angles: [90, -45] },
      { start: 4, angles: [90, 0] },
      { start: 0, angles: [0, 45] },
    ];
    expect(validateStrips(seq, four).join('')).toContain('超过上限 3 条');
  });

  it('长度越界（<2 或 >4）', () => {
    expect(validateStrips(seq, [{ start: 0, angles: [0] }]).join('')).toContain(
      '长度 1 层，不在 2–4 层范围内',
    );
    expect(
      validateStrips(seq, [{ start: 0, angles: [0, 45, 90, -45, 90] }]).join(''),
    ).toContain('长度 5 层，不在 2–4 层范围内');
  });

  it('区间超出首半', () => {
    const problems = validateStrips(seq, [{ start: 4, angles: seq.slice(4, 8) }]);
    expect(problems.join('')).toContain('超出参考铺层首半');
    expect(problems.join('')).toContain('第 5–8 层');
  });

  it('角度序列与参考铺层不一致', () => {
    expect(validateStrips(seq, [{ start: 0, angles: [90, 90] }]).join('')).toContain(
      '必须取自现有参考铺层',
    );
  });

  it('参考铺层中彼此重叠', () => {
    const problems = validateStrips(seq, [
      { start: 0, angles: [0, 45, 90] },
      { start: 2, angles: [90, -45] },
    ]);
    expect(problems.join('')).toContain('重叠');
  });

  it('求解器对非法条带定义做防御性复核', () => {
    const r = solve(seq, [{ start: 0, angles: [0] }]);
    expect(r.status).toBe('infeasible');
    if (r.status !== 'infeasible') return;
    expect(r.reasons.join('')).toContain('长度 1 层');
  });
});

describe('solve 条带模式对照暴力枚举（同一全局搜索的最优性）', () => {
  it.each([6, 8, 10])('n=%i：随机条带与暴力枚举逐一一致', (n) => {
    const rand = mulberry32(7000 + n);
    for (let iter = 0; iter < 120; iter++) {
      const original = randomFeasibleMultisetSequence(rand, n);
      const strips = randomStrips(rand, original);
      const expected = bruteForce(original, strips);
      const actual = solve(original, strips);
      if (expected === null) {
        expect(actual.status, `应判无解：${original.join(',')} 条带 ${JSON.stringify(strips)}`).toBe(
          'infeasible',
        );
      } else {
        expect(actual.status, `应有解：${original.join(',')} 条带 ${JSON.stringify(strips)}`).toBe(
          'ok',
        );
        if (actual.status !== 'ok') continue;
        expect(actual.changes).toBe(expected.changes);
        expect(actual.transitions).toBe(expected.transitions);
        expect(actual.repaired).toEqual(expected.seq);
        expectPlacementsConsistent(actual, strips);
      }
    }
  });
});

describe('solve 条带模式大规模性质（n=48）', () => {
  it('输出恒满足全部规则与条带约束，落位互不重叠', () => {
    const rand = mulberry32(48007);
    let solved = 0;
    for (let iter = 0; iter < 20; iter++) {
      const original = randomFeasibleMultisetSequence(rand, 48);
      const strips = randomStrips(rand, original);
      const r = solve(original, strips);
      if (r.status !== 'ok') continue;
      solved++;
      expect(isValidFull(r.repaired)).toBe(true);
      // 数量保持
      const before = [0, 0, 0, 0];
      const after = [0, 0, 0, 0];
      for (const a of r.original) before[ANGLE_INDEX[a]]++;
      for (const a of r.repaired) after[ANGLE_INDEX[a]]++;
      expect(after).toEqual(before);
      // 条带落位一致且互不重叠
      expectPlacementsConsistent(r, strips);
      // 规则证据与条带证据全部通过
      const checks = buildRuleChecks(r.original, r.repaired);
      checks.push(buildStripCheck(r.original, r.repaired, r.stripPlacements!));
      for (const c of checks) {
        expect(c.pass, `规则 ${c.id}`).toBe(true);
      }
    }
    expect(solved).toBeGreaterThan(0);
  });
});
