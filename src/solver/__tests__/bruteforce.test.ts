import { describe, expect, it } from 'vitest';
import {
  ANGLES,
  ANGLE_INDEX,
  MAX_ADJACENT_DIFF,
  MAX_RUN,
  angleDiff,
  type Angle,
} from '../angles';
import { buildRuleChecks } from '../evidence';
import { solve } from '../solve';

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
 * 暴力基准：枚举首半多重集合的全部不同排列，拼出对称全序列，
 * 逐条检查规则，按 (改动数, 变化次数, 字典序) 取全局最优。
 */
function bruteForce(original: readonly Angle[]): BruteBest | null {
  const n = original.length;
  const half = n / 2;
  const totals = [0, 0, 0, 0];
  for (const a of original) totals[ANGLE_INDEX[a]]++;
  if (totals.some((t) => t % 2 !== 0)) return null;
  if (totals[1] !== totals[2]) return null;

  const remaining = totals.map((t) => t / 2);
  const perm: number[] = [];
  let best: BruteBest | null = null;

  const visit = (): void => {
    if (perm.length === half) {
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

function randomSequence(rand: () => number, n: number): Angle[] {
  return Array.from({ length: n }, () => ANGLES[Math.floor(rand() * 4)]);
}

/** 生成满足数量前提（各角度偶数、±45 等量）的随机序列，提高可行样本比例 */
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

describe('solve 对照暴力枚举（全局最优性）', () => {
  it.each([4, 6, 8, 10])('n=%i：随机输入与暴力枚举逐一一致', (n) => {
    const rand = mulberry32(1000 + n);
    for (let iter = 0; iter < 200; iter++) {
      const original =
        iter % 2 === 0
          ? randomSequence(rand, n)
          : randomFeasibleMultisetSequence(rand, n);
      const expected = bruteForce(original);
      const actual = solve(original);
      if (expected === null) {
        expect(actual.status, `应判无解：${original.join(',')}`).toBe('infeasible');
      } else {
        expect(actual.status, `应有解：${original.join(',')}`).toBe('ok');
        if (actual.status !== 'ok') continue;
        expect(actual.changes).toBe(expected.changes);
        expect(actual.transitions).toBe(expected.transitions);
        expect(actual.repaired).toEqual(expected.seq);
      }
    }
  });

  it('n=12：抽样对照暴力枚举', () => {
    const rand = mulberry32(20260920);
    for (let iter = 0; iter < 60; iter++) {
      const original = randomFeasibleMultisetSequence(rand, 12);
      const expected = bruteForce(original);
      const actual = solve(original);
      if (expected === null) {
        expect(actual.status).toBe('infeasible');
      } else {
        expect(actual.status).toBe('ok');
        if (actual.status !== 'ok') continue;
        expect(actual.changes).toBe(expected.changes);
        expect(actual.transitions).toBe(expected.transitions);
        expect(actual.repaired).toEqual(expected.seq);
      }
    }
  });
});

describe('solve 大规模性质（n=48）', () => {
  it('输出恒满足全部规则，且对输出再求解改动为 0（幂等）', () => {
    const rand = mulberry32(48);
    let solved = 0;
    for (let iter = 0; iter < 120; iter++) {
      const original = randomFeasibleMultisetSequence(rand, 48);
      const r = solve(original);
      if (r.status !== 'ok') continue;
      solved++;
      expect(isValidFull(r.repaired)).toBe(true);
      // 数量保持
      const before = [0, 0, 0, 0];
      const after = [0, 0, 0, 0];
      for (const a of r.original) before[ANGLE_INDEX[a]]++;
      for (const a of r.repaired) after[ANGLE_INDEX[a]]++;
      expect(after).toEqual(before);
      // 目标值与实际差异一致
      expect(r.changedPositions).toHaveLength(r.changes);
      expect(r.transitionBoundaries).toHaveLength(r.transitions);
      // 规则证据全部通过
      for (const c of buildRuleChecks(r.original, r.repaired)) {
        expect(c.pass, `规则 ${c.id}`).toBe(true);
      }
      // 幂等：合法序列的最优修复是其自身
      const again = solve(r.repaired);
      expect(again.status).toBe('ok');
      if (again.status === 'ok') {
        expect(again.changes).toBe(0);
        expect(again.repaired).toEqual(r.repaired);
      }
    }
    expect(solved).toBeGreaterThan(0);
  });
});
