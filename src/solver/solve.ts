import {
  ANGLES,
  ANGLE_INDEX,
  MAX_RUN,
  formatAngle,
  isAdjacentAllowed,
  type Angle,
} from './angles';

export interface SolveOk {
  status: 'ok';
  /** 输入的参考铺层（原序列） */
  original: Angle[];
  /** 修复后的合法序列 */
  repaired: Angle[];
  /** 一级目标：改动位置数（原序列与修复结果不同的层数） */
  changes: number;
  /** 二级目标：相邻角度变化次数（修复结果中相邻层角度不同的层间数） */
  transitions: number;
  /** 发生改动的层（0 基下标） */
  changedPositions: number[];
  /** 发生角度变化的层间（0 基：i 表示第 i 层与第 i+1 层之间） */
  transitionBoundaries: number[];
}

export interface SolveInfeasible {
  status: 'infeasible';
  /** 无解原因（可复核） */
  reasons: string[];
}

export type SolveResult = SolveOk | SolveInfeasible;

interface DpValue {
  /** 首半已使用的各角度数量（按下标序） */
  counts: number[];
  /** 最后一层的角度下标 */
  last: number;
  /** 最后一层所属同角连续段长度 */
  run: number;
  /** 首半已产生的改动数（含镜像层） */
  changes: number;
  /** 首半内部的相邻角度变化次数 */
  trans: number;
  /** 首半序列（角度下标），用于字典序裁决 */
  seq: number[];
}

function keyOf(counts: readonly number[], last: number, run: number): string {
  return `${counts[0]},${counts[1]},${counts[2]},${counts[3]}|${last}|${run}`;
}

/** 下标数组按"规定次序"比较（下标序即 0 < +45 < −45 < 90） */
function compareSeq(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/** 目标元组 (改动数, 变化次数, 字典序) 的字典序比较：candidate 是否严格优于 current */
function isBetter(candidate: DpValue, current: DpValue): boolean {
  if (candidate.changes !== current.changes) return candidate.changes < current.changes;
  if (candidate.trans !== current.trans) return candidate.trans < current.trans;
  return compareSeq(candidate.seq, current.seq) < 0;
}

/**
 * 全局最优铺层修复。
 *
 * 思路：合法序列关于中面对称，因此由首半唯一确定（后一半为首半的镜像）。
 * 对首半做动态规划，状态为 (各角度已用数量, 末层角度, 末层连续段长)，
 * 逐层扩展；每个状态只保留目标元组 (改动数, 变化次数, 字典序) 最优的前缀——
 * 同一状态的后续选择集合与代价完全相同，被支配的前缀不可能翻盘，
 * 因此该 DP 是全局精确的，而非局部交换或首个可行解。
 *
 * 规则在首半上的等价形式：
 *  - 各角度数量保持：首半各角度数量 = 总数的一半（总数须为偶数，否则无解）；
 *  - +45/−45 等量：前置校验；
 *  - 表面非 90°：首层（即第 1 层与镜像的第 n 层）不得为 90°；
 *  - 相邻角差 ≤ 45°：首半内部逐对检查；中面处两层相同（镜像），角差恒为 0；
 *  - 同角连续 ≤ 3 层：首半内部连续段 ≤ 3；首半末尾连续段长 k 会在中面处
 *    形成 2k 的连续段，故要求首半末尾连续段长恰为 1（即末两层角度不同）。
 *
 * 目标折算：
 *  - 改动位置数：首半位置 p 选角度 a 的代价为
 *    [a ≠ 原序列[p]] + [a ≠ 原序列[n-1-p]]（计入镜像层）；
 *  - 相邻角度变化次数：中面处不变化，全序列变化次数 = 2 × 首半内部变化次数；
 *  - 字典序：两条不同首半的首次不同处必在首半内，故全序列字典序 = 首半字典序。
 */
export function solve(original: readonly Angle[]): SolveResult {
  const n = original.length;
  const half = n / 2;

  const totals = [0, 0, 0, 0];
  for (const a of original) totals[ANGLE_INDEX[a]]++;

  // —— 可判定无解的前置校验（保持数量前提下永远无法满足） ——
  const reasons: string[] = [];
  ANGLES.forEach((ang, i) => {
    if (totals[i] % 2 !== 0) {
      reasons.push(
        `角度 ${formatAngle(ang)} 共 ${totals[i]} 层（奇数）：中面对称要求每种角度的数量为偶数。`,
      );
    }
  });
  if (totals[1] !== totals[2]) {
    reasons.push(
      `+45° 共 ${totals[1]} 层、−45° 共 ${totals[2]} 层：两者数量不等，且修复不得改变各角度数量。`,
    );
  }
  if (totals[3] > n - 2) {
    reasons.push(
      `90° 共 ${totals[3]} 层，但首尾两个表面层不能为 90°，内部仅 ${n - 2} 个位置可放置。`,
    );
  }
  if (reasons.length > 0) return { status: 'infeasible', reasons };

  const target = totals.map((t) => t / 2);
  const costAt = (p: number, ai: number): number =>
    (ANGLES[ai] !== original[p] ? 1 : 0) + (ANGLES[ai] !== original[n - 1 - p] ? 1 : 0);

  // 首层（表面）初始化：不允许 90°
  let cur = new Map<string, DpValue>();
  for (let ai = 0; ai < ANGLES.length; ai++) {
    if (target[ai] === 0 || ANGLES[ai] === 90) continue;
    const counts = [0, 0, 0, 0];
    counts[ai] = 1;
    const v: DpValue = { counts, last: ai, run: 1, changes: costAt(0, ai), trans: 0, seq: [ai] };
    cur.set(keyOf(counts, ai, 1), v);
  }

  // 逐层扩展首半
  for (let p = 1; p < half; p++) {
    const nxt = new Map<string, DpValue>();
    for (const v of cur.values()) {
      for (let ai = 0; ai < ANGLES.length; ai++) {
        if (v.counts[ai] >= target[ai]) continue;
        if (!isAdjacentAllowed(ANGLES[v.last], ANGLES[ai])) continue;
        const run = ai === v.last ? v.run + 1 : 1;
        if (run > MAX_RUN) continue;
        const counts = [...v.counts];
        counts[ai]++;
        const cand: DpValue = {
          counts,
          last: ai,
          run,
          changes: v.changes + costAt(p, ai),
          trans: v.trans + (ai === v.last ? 0 : 1),
          seq: [...v.seq, ai],
        };
        const k = keyOf(counts, ai, run);
        const existing = nxt.get(k);
        if (!existing || isBetter(cand, existing)) nxt.set(k, cand);
      }
    }
    cur = nxt;
    if (cur.size === 0) break;
  }

  // 收尾：首半末尾连续段长须为 1，否则中面处同角连续 ≥ 4 层
  let best: DpValue | null = null;
  for (const v of cur.values()) {
    if (v.run !== 1) continue;
    if (!best || isBetter(v, best)) best = v;
  }

  if (!best) {
    const quota = ANGLES.map((a, i) => `${formatAngle(a)} × ${totals[i]}`).join('，');
    return {
      status: 'infeasible',
      reasons: [
        `在保持各角度数量（${quota}）的前提下，不存在同时满足中面对称、表面非 90°、相邻角差 ≤ 45° 且同角连续 ≤ 3 层的排列。`,
      ],
    };
  }

  const firstHalf = best.seq.map((i) => ANGLES[i]);
  const repaired: Angle[] = [...firstHalf, ...firstHalf.slice().reverse()];

  const changedPositions: number[] = [];
  for (let i = 0; i < n; i++) {
    if (repaired[i] !== original[i]) changedPositions.push(i);
  }
  const transitionBoundaries: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    if (repaired[i] !== repaired[i + 1]) transitionBoundaries.push(i);
  }

  return {
    status: 'ok',
    original: [...original],
    repaired,
    changes: changedPositions.length,
    transitions: transitionBoundaries.length,
    changedPositions,
    transitionBoundaries,
  };
}
