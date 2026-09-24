import { describe, expect, it } from 'vitest';
import {
  ANGLES,
  ANGLE_INDEX,
  MAX_ADJACENT_DIFF,
  MAX_RUN,
  angleDiff,
  type Angle,
} from '../angles';
import { solve } from '../solve';
import {
  MAX_STRIP_LEN,
  MAX_STRIPS,
  MIN_STRIP_LEN,
  validateStrips,
  type StripSpec,
} from '../strips';

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

/** 独立实现的完整规则检查（不与求解器共享逻辑） */
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

function bruteLess(a: BruteBest, b: BruteBest): boolean {
  if (a.changes !== b.changes) return a.changes < b.changes;
  if (a.transitions !== b.transitions) return a.transitions < b.transitions;
  for (let i = 0; i < a.seq.length; i++) {
    const ka = ANGLE_INDEX[a.seq[i]];
    const kb = ANGLE_INDEX[b.seq[i]];
    if (ka !== kb) return ka < kb;
  }
  return false;
}

/** 模式 pat 在首半中所有出现起点 */
function occurrences(half: readonly number[], pat: readonly number[]): number[] {
  const out: number[] = [];
  for (let s = 0; s + pat.length <= half.length; s++) {
    if (pat.every((a, t) => half[s + t] === a)) out.push(s);
  }
  return out;
}

/** 回溯：每条条带选择一个出现区间，区间两两不得重叠 */
function stripsSatisfied(half: readonly number[], patterns: number[][], starts: number[] = [], k = 0): boolean {
  if (k === patterns.length) return true;
  for (const s of occurrences(half, patterns[k])) {
    const e = s + patterns[k].length;
    const overlap = starts.some((us, i) => {
      const ue = us + patterns[i].length;
      return s < ue && us < e;
    });
    if (overlap) continue;
    starts.push(s);
    if (stripsSatisfied(half, patterns, starts, k + 1)) return true;
    starts.pop();
  }
  return false;
}

/**
 * 带条带约束的暴力基准：枚举首半多重集合的全部不同排列，
 * 检查全部规则 + 每条条带完整连续出现且采用位置互不重叠，
 * 按 (改动数, 变化次数, 字典序) 取全局最优。
 */
function bruteForceWithStrips(
  original: readonly Angle[],
  patterns: readonly (readonly Angle[])[],
): BruteBest | null {
  const n = original.length;
  const half = n / 2;
  const totals = [0, 0, 0, 0];
  for (const a of original) totals[ANGLE_INDEX[a]]++;
  if (totals.some((t) => t % 2 !== 0)) return null;
  if (totals[1] !== totals[2]) return null;

  const pats = patterns.map((p) => p.map((a) => ANGLE_INDEX[a]));
  const remaining = totals.map((t) => t / 2);
  const perm: number[] = [];
  let best: BruteBest | null = null;

  const visit = (): void => {
    if (perm.length === half) {
      if (!stripsSatisfied(perm, pats)) return;
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

/** 在合法首半中随机抽取互不重叠的窗口作为条带（保证至少一条） */
function randomWindows(rand: () => number, half: number): StripSpec[] {
  const maxCount = Math.min(MAX_STRIPS, Math.floor(half / MIN_STRIP_LEN));
  const count = 1 + Math.floor(rand() * maxCount);
  const occupied = new Array(half).fill(false);
  const specs: StripSpec[] = [];
  for (let k = 0; k < count; k++) {
    const candidates: StripSpec[] = [];
    for (let len = MIN_STRIP_LEN; len <= Math.min(MAX_STRIP_LEN, half); len++) {
      for (let s = 0; s + len <= half; s++) {
        let free = true;
        for (let t = s; t < s + len; t++) if (occupied[t]) free = false;
        if (free) candidates.push({ start: s, length: len });
      }
    }
    if (candidates.length === 0) break;
    const spec = candidates[Math.floor(rand() * candidates.length)];
    for (let t = spec.start; t < spec.start + spec.length; t++) occupied[t] = true;
    specs.push(spec);
  }
  return specs;
}

/** 拒绝采样：构造一条随机的合法对称全序列（失败返回 null） */
function randomValidSymmetricSequence(rand: () => number, n: number): Angle[] | null {
  const half = n / 2;
  for (let tries = 0; tries < 3000; tries++) {
    const counts = [0, 0, 0, 0];
    let rem = half;
    while (rem > 0) {
      if (rand() < 0.4 && rem >= 2) {
        counts[1]++;
        counts[2]++;
        rem -= 2;
      } else {
        counts[rand() < 0.5 ? 0 : 3]++;
        rem--;
      }
    }
    const perm: number[] = [];
    const c = [...counts];
    while (perm.length < half) {
      const opts: number[] = [];
      for (let ai = 0; ai < 4; ai++) if (c[ai] > 0) opts.push(ai);
      const ai = opts[Math.floor(rand() * opts.length)];
      c[ai]--;
      perm.push(ai);
    }
    const h = perm.map((i) => ANGLES[i]);
    const full: Angle[] = [...h, ...h.slice().reverse()];
    if (isValidFull(full)) return full;
  }
  return null;
}

/** 保持各角度数量的全随机重排（条带仍可能可放，但需要真正的修复） */
function shuffledCopy(rand: () => number, seq: readonly Angle[]): Angle[] {
  const out = [...seq];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 在参考铺层首半中随机抽取条带配置（区间保证落在首半内） */
function randomStrips(rand: () => number, half: number): StripSpec[] {
  const count = 1 + Math.floor(rand() * Math.min(MAX_STRIPS, half));
  const specs: StripSpec[] = [];
  for (let k = 0; k < count; k++) {
    const maxLen = Math.min(MAX_STRIP_LEN, half);
    const length = MIN_STRIP_LEN + Math.floor(rand() * (maxLen - MIN_STRIP_LEN + 1));
    const start = Math.floor(rand() * (half - length + 1));
    specs.push({ start, length });
  }
  return specs;
}

describe('validateStrips（条带配置校验）', () => {
  const seq: Angle[] = [0, 45, -45, 90, 90, -45, 45, 0]; // half = 4

  it('合法条带通过并读出角度顺序（保持工程师选择顺序）', () => {
    const r = validateStrips(seq, [
      { start: 2, length: 2 },
      { start: 0, length: 3 },
    ]);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.strips.map((s) => s.start)).toEqual([2, 0]);
    expect(r.strips[0].pattern).toEqual([-45, 90]);
    expect(r.strips[1].pattern).toEqual([0, 45, -45]);
    expect(r.strips.map((s) => s.order)).toEqual([1, 2]);
  });

  it('0 条、超过 3 条、长度越界、超出首半均报错', () => {
    expect(validateStrips(seq, []).valid).toBe(false);
    expect(validateStrips(seq, []).errors.join('')).toContain('1–3');
    const four = [0, 1, 2, 3].map((start) => ({ start, length: 2 }));
    expect(validateStrips(seq, four).errors.join('')).toContain('最多');
    expect(validateStrips(seq, [{ start: 0, length: 1 }]).errors.join('')).toContain('长度');
    expect(validateStrips(seq, [{ start: 0, length: 5 }]).errors.join('')).toContain('长度');
    expect(validateStrips(seq, [{ start: 3, length: 2 }]).errors.join('')).toContain('超出首半');
    expect(validateStrips(seq, [{ start: 4, length: 2 }]).errors.join('')).toContain('越界');
  });

  it('原始区间相交本身合法（采用位置互斥由求解器裁决）', () => {
    const r = validateStrips(seq, [
      { start: 0, length: 3 },
      { start: 1, length: 2 },
    ]);
    expect(r.valid).toBe(true);
  });
});

describe('solve 条带模式（手工核算用例）', () => {
  const input: Angle[] = [90, 45, -45, 0, 0, -45, 45, 90];

  it('关闭条带模式（空数组）与原求解语义完全一致', () => {
    const r1 = solve(input);
    const r2 = solve(input, { strips: [] });
    expect(r2.status).toBe('ok');
    if (r1.status !== 'ok' || r2.status !== 'ok') return;
    expect(r2.repaired).toEqual(r1.repaired);
    expect(r2.changes).toBe(r1.changes);
    expect(r2.transitions).toBe(r1.transitions);
    expect(r2.stripMode).toBe(false);
    expect(r2.stripPlacements).toEqual([]);
  });

  it('条带 [90°,+45°] 强制改变最优落位：改动由 4 升到 6，首半 [-45,90,45,0]', () => {
    const v = validateStrips(input, [{ start: 0, length: 2 }]);
    expect(v.valid).toBe(true);
    const r = solve(input, { strips: v.strips });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.repaired).toEqual([-45, 90, 45, 0, 0, 45, 90, -45]);
    expect(r.changes).toBe(6);
    expect(r.changedPositions).toEqual([0, 1, 2, 5, 6, 7]);
    expect(r.transitions).toBe(6);
    expect(r.stripMode).toBe(true);
    expect(r.stripPlacements).toHaveLength(1);
    const p = r.stripPlacements[0];
    expect(p.pattern).toEqual([90, 45]);
    expect([p.originalStart, p.originalEnd]).toEqual([0, 2]);
    expect([p.adoptedStart, p.adoptedEnd]).toEqual([1, 3]);
    expect([p.mirrorStart, p.mirrorEnd]).toEqual([5, 7]);
    // 逐层角度证据
    expect(r.repaired.slice(p.adoptedStart, p.adoptedEnd)).toEqual(p.pattern);
    expect(r.repaired.slice(p.mirrorStart, p.mirrorEnd)).toEqual([45, 90]);
  });

  it('条带内部违反相邻角差（+45 → −45）→ 条带无法共同放置', () => {
    const v = validateStrips(input, [{ start: 1, length: 2 }]); // [45,-45]
    const r = solve(input, { strips: v.strips });
    expect(r.status).toBe('infeasible');
    if (r.status !== 'infeasible') return;
    expect(r.stripMode).toBe(true);
    expect(r.reasons.join('')).toContain('条带无法共同放置');
  });

  it('两条条带角度需求超过首半配额 → 前置阻断并说明', () => {
    // [90,45] 与 [90,45,-45]：首半只有 1 个 90° 配额
    const v = validateStrips(input, [
      { start: 0, length: 2 },
      { start: 0, length: 3 },
    ]);
    const r = solve(input, { strips: v.strips });
    expect(r.status).toBe('infeasible');
    if (r.status !== 'infeasible') return;
    expect(r.reasons.join('')).toContain('90°');
    expect(r.reasons.join('')).toContain('条带无法共同放置');
  });

  it('多条条带可行：采用位置互不重叠且镜像正确', () => {
    // n=12 合法对称序列，首半 [+45,0,0,0,−45,90]：
    // 条带 1 [0°,0°] 原在第 2–3 层；条带 2 [−45°,90°] 原在第 5–6 层；
    // 两条条带内部均满足相邻角差，原序列已合法且已不重叠落位，最优解改动为 0。
    const seq: Angle[] = [45, 0, 0, 0, -45, 90, 90, -45, 0, 0, 0, 45];
    const v = validateStrips(seq, [
      { start: 1, length: 2 }, // [0,0]
      { start: 4, length: 2 }, // [-45,90]
    ]);
    expect(v.valid).toBe(true);
    const r = solve(seq, { strips: v.strips });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.changes).toBe(0);
    expect(r.repaired).toEqual(seq);
    const [p1, p2] = r.stripPlacements;
    expect(p1.pattern).toEqual([0, 0]);
    expect(p2.pattern).toEqual([-45, 90]);
    // 采用区间不重叠
    const overlap = p1.adoptedStart < p2.adoptedEnd && p2.adoptedStart < p1.adoptedEnd;
    expect(overlap).toBe(false);
    // 每个采用区间与镜像区间的逐层角度均与条带模式一致
    for (const p of r.stripPlacements) {
      expect(r.repaired.slice(p.adoptedStart, p.adoptedEnd)).toEqual(p.pattern);
      expect(r.repaired.slice(p.mirrorStart, p.mirrorEnd)).toEqual([...p.pattern].reverse());
    }
    expect([p1.originalStart, p1.originalEnd]).toEqual([1, 3]);
    expect([p2.originalStart, p2.originalEnd]).toEqual([4, 6]);
    expect([p1.adoptedStart, p1.adoptedEnd]).toEqual([1, 3]);
    expect([p1.mirrorStart, p1.mirrorEnd]).toEqual([9, 11]);
    expect([p2.adoptedStart, p2.adoptedEnd]).toEqual([4, 6]);
    expect([p2.mirrorStart, p2.mirrorEnd]).toEqual([6, 8]);
  });
});

describe('solve 条带模式对照暴力枚举（全局最优性）', () => {
  it.each([6, 8, 10])('n=%i：合法序列取条带（必可行）与暴力枚举逐一一致', (n) => {
    const rand = mulberry32(7700 + n);
    let samples = 0;
    for (let iter = 0; iter < 80 && samples < 40; iter++) {
      const valid = randomValidSymmetricSequence(rand, n);
      if (!valid) continue;
      const specs = randomWindows(rand, n / 2);
      const v = validateStrips(valid, specs);
      if (!v.valid) continue;
      samples++;
      const expected = bruteForceWithStrips(valid, v.strips.map((s) => s.pattern));
      const actual = solve(valid, { strips: v.strips });
      expect(expected, `暴力基准应可行：${valid.join(',')}`).not.toBeNull();
      expect(actual.status).toBe('ok');
      if (expected === null || actual.status !== 'ok') continue;
      expect(actual.changes).toBe(expected.changes);
      expect(actual.transitions).toBe(expected.transitions);
      expect(actual.repaired).toEqual(expected.seq);
      // 原序列本身合法且已含全部条带，最优解应原样保留
      expect(actual.changes).toBe(0);
      // 落位证据自洽、两两不重叠
      const ps = actual.stripPlacements;
      for (const p of ps) {
        expect(actual.repaired.slice(p.adoptedStart, p.adoptedEnd)).toEqual(p.pattern);
        // 中面镜像区间内容为条带模式的逆序
        expect(actual.repaired.slice(p.mirrorStart, p.mirrorEnd)).toEqual([...p.pattern].reverse());
      }
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          expect(ps[i].adoptedStart < ps[j].adoptedEnd && ps[j].adoptedStart < ps[i].adoptedEnd).toBe(false);
        }
      }
    }
    expect(samples).toBeGreaterThan(0);
  });

  it.each([6, 8, 10])('n=%i：随机参考铺层与随机条带配置（含阻断）与暴力枚举逐一一致', (n) => {
    const rand = mulberry32(9900 + n);
    let feasibleSamples = 0;
    let infeasibleSamples = 0;
    for (let iter = 0; iter < 150; iter++) {
      let original: Angle[];
      let specs: StripSpec[];
      if (iter % 3 === 0) {
        // 合法序列重排：数量构成可实现，条带多为合法相邻片段
        const base = randomValidSymmetricSequence(rand, n);
        if (!base) continue;
        original = shuffledCopy(rand, base);
        specs = randomWindows(rand, n / 2);
      } else {
        // 纯随机参考铺层 + 随机条带（大量阻断场景）
        original = Array.from({ length: n }, () => ANGLES[Math.floor(rand() * 4)]);
        specs = randomStrips(rand, n / 2);
      }
      const v = validateStrips(original, specs);
      if (!v.valid) continue;
      const expected = bruteForceWithStrips(original, v.strips.map((s) => s.pattern));
      const actual = solve(original, { strips: v.strips });
      if (expected === null) {
        infeasibleSamples++;
        expect(actual.status, `应判无解：${original.join(',')} | ${JSON.stringify(specs)}`).toBe(
          'infeasible',
        );
      } else {
        feasibleSamples++;
        expect(actual.status, `应有解：${original.join(',')} | ${JSON.stringify(specs)}`).toBe('ok');
        if (actual.status !== 'ok') continue;
        expect(actual.changes).toBe(expected.changes);
        expect(actual.transitions).toBe(expected.transitions);
        expect(actual.repaired).toEqual(expected.seq);
        for (const p of actual.stripPlacements) {
          expect(actual.repaired.slice(p.adoptedStart, p.adoptedEnd)).toEqual(p.pattern);
        }
        const ps = actual.stripPlacements;
        for (let i = 0; i < ps.length; i++) {
          for (let j = i + 1; j < ps.length; j++) {
            expect(ps[i].adoptedStart < ps[j].adoptedEnd && ps[j].adoptedStart < ps[i].adoptedEnd).toBe(false);
          }
        }
      }
    }
    expect(feasibleSamples).toBeGreaterThan(0);
    expect(infeasibleSamples).toBeGreaterThan(0);
  });
});

describe('solve 条带模式大规模性质（n=48）', () => {
  it('输出恒满足全部规则与条带约束，且对输出带同样条带再求解改动为 0（幂等）', () => {
    const rand = mulberry32(48048);
    let solved = 0;
    for (let iter = 0; iter < 60 && solved < 20; iter++) {
      const base = randomValidSymmetricSequence(rand, 48);
      if (!base) continue;
      const specs = randomWindows(rand, 24);
      const v = validateStrips(base, specs);
      if (!v.valid) continue;
      const r = solve(base, { strips: v.strips });
      expect(r.status, '含条带的合法序列应可修复').toBe('ok');
      if (r.status !== 'ok') continue;
      solved++;
      // 全部规则
      expect(isValidFull(r.repaired)).toBe(true);
      // 条带逐层证据：采用区间完整连续、镜像逆序、两两不重叠
      for (const p of r.stripPlacements) {
        expect(r.repaired.slice(p.adoptedStart, p.adoptedEnd)).toEqual(p.pattern);
        expect(r.repaired.slice(p.mirrorStart, p.mirrorEnd)).toEqual([...p.pattern].reverse());
      }
      const ps = r.stripPlacements;
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          expect(ps[i].adoptedStart < ps[j].adoptedEnd && ps[j].adoptedStart < ps[i].adoptedEnd).toBe(false);
        }
      }
      // 幂等：修复结果本身合法且含全部条带，再求解改动为 0
      const again = solve(r.repaired, { strips: v.strips });
      expect(again.status).toBe('ok');
      if (again.status === 'ok') {
        expect(again.changes).toBe(0);
        expect(again.repaired).toEqual(r.repaired);
      }
    }
    expect(solved).toBeGreaterThan(0);
  });
});
