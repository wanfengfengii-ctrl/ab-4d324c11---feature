import {
  ANGLES,
  ANGLE_INDEX,
  MAX_RUN,
  formatAngle,
  isAdjacentAllowed,
  type Angle,
} from './angles';
import type { ResolvedStrip } from './strips';

export interface StripPlacement {
  /** 对应输入条带的序号（0 基） */
  stripIndex: number;
  /** 原始区间（0 基、右开，位于参考铺层首半） */
  originalStart: number;
  originalEnd: number;
  /** 修复后采用区间（0 基、右开，位于修复结果首半） */
  adoptedStart: number;
  adoptedEnd: number;
  /** 采用区间在中面另一侧的镜像位置（0 基、右开） */
  mirrorStart: number;
  mirrorEnd: number;
  /** 完整连续出现的角度顺序 */
  pattern: Angle[];
}

export interface SolveOptions {
  /** 条带模式：已校验的条带列表（1–3 条）；缺省/空数组为关闭，语义与原求解器完全一致 */
  strips?: readonly ResolvedStrip[];
}

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
  /** 条带模式是否开启 */
  stripMode: boolean;
  /** 每条条带的最终落位证据（关闭时为空） */
  stripPlacements: StripPlacement[];
}

export interface SolveInfeasible {
  status: 'infeasible';
  /** 无解原因（可复核） */
  reasons: string[];
  /** 本次综合是否开启了条带模式 */
  stripMode: boolean;
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
  /** 已开始落位的条带序号（-1 表示无活跃条带） */
  active: number;
  /** 活跃条带已铺设层数 */
  activePos: number;
  /** 已完整落位的条带位掩码（bit k = 条带 k） */
  mask: number;
  /** 每条条带在修复首半中的采用起点（-1 = 尚未落位），用于回溯证据 */
  starts: number[];
}

function keyOf(
  counts: readonly number[],
  last: number,
  run: number,
  active: number,
  activePos: number,
  mask: number,
): string {
  return `${counts[0]},${counts[1]},${counts[2]},${counts[3]}|${last}|${run}|${active}|${activePos}|${mask}`;
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
 * 对首半做动态规划，状态为 (各角度已用数量, 末层角度, 末层连续段长, 条带落位进度)，
 * 逐层扩展；每个状态只保留目标元组 (改动数, 变化次数, 字典序) 最优的前缀——
 * 同一状态的后续选择集合与代价完全相同，被支配的前缀不可能翻盘，
 * 因此该 DP 是全局精确的，而非局部交换或首个可行解。
 *
 * 条带模式（返工工艺约束）：
 *  每条条带是参考铺层首半中一段 2–4 层的连续角度顺序，必须在修复结果首半中
 *  以相同顺序完整连续出现；多条条带的采用位置不得重叠。条带"落在哪里"与
 *  两级目标、字典序在同一次全局搜索中联合裁决——条带进度是 DP 状态的一部分，
 *  不存在"先出修复方案再筛选条带"的两阶段过程。无条带（options 缺省）时，
 *  条带维度退化为常量，搜索空间与逐状态支配关系与原求解器完全一致。
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
 *  - 改动位置数：首半位置 p 选角度 ai 的代价为
 *    [ai ≠ 原序列[p]] + [ai ≠ 原序列[n-1-p]]（计入镜像层）；
 *  - 相邻角度变化次数：中面处不变化，全序列变化次数 = 2 × 首半内部变化次数；
 *  - 字典序：两条不同首半的首次不同处必在首半内，故全序列字典序 = 首半字典序。
 */
export function solve(
  original: readonly Angle[],
  options: SolveOptions = {},
): SolveResult {
  const n = original.length;
  const half = n / 2;
  const strips = options.strips ?? [];
  const stripMode = strips.length > 0;
  const m = strips.length;
  const fullMask = stripMode ? (1 << m) - 1 : 0;

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
  if (reasons.length > 0) return { status: 'infeasible', reasons, stripMode };

  if (stripMode) {
    // 条带角度总需求超过首半配额：任何不重叠落位都不可能
    const need = [0, 0, 0, 0];
    for (const s of strips) for (const a of s.pattern) need[ANGLE_INDEX[a]]++;
    ANGLES.forEach((ang, i) => {
      if (need[i] > totals[i] / 2) {
        reasons.push(
          `${m} 条条带共需要 ${formatAngle(ang)} × ${need[i]} 层，但首半配额仅 ${totals[i] / 2} 层，条带无法共同放置。`,
        );
      }
    });
    if (reasons.length > 0) return { status: 'infeasible', reasons, stripMode };
  }

  const target = totals.map((t) => t / 2);
  const costAt = (p: number, ai: number): number =>
    (ANGLES[ai] !== original[p] ? 1 : 0) + (ANGLES[ai] !== original[n - 1 - p] ? 1 : 0);

  /** 在首半位置 p、条带进度 (active,activePos,mask) 下允许选择的角度下标集合 */
  const allowedAngles = (
    p: number,
    active: number,
    activePos: number,
    mask: number,
  ): { ai: number; nActive: number; nPos: number; nMask: number }[] => {
    if (!stripMode) {
      return [0, 1, 2, 3].map((ai) => ({ ai, nActive: -1, nPos: 0, nMask: 0 }));
    }
    const out: { ai: number; nActive: number; nPos: number; nMask: number }[] = [];
    const seen = new Set<string>();
    const push = (ai: number, nActive: number, nPos: number, nMask: number): void => {
      const key = `${ai}|${nActive}|${nPos}|${nMask}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ ai, nActive, nPos, nMask });
    };

    if (active >= 0) {
      // 继续活跃条带：当前层角度被条带强制；铺完最后一层时置位掩码
      const s = strips[active];
      const ai = ANGLE_INDEX[s.pattern[activePos]];
      const finished = activePos + 1 === s.length;
      push(ai, finished ? -1 : active, finished ? 0 : activePos + 1, finished ? mask | (1 << active) : mask);
      return out;
    }

    // 无活跃条带：可在位置 p 开启任意尚未落位且放得下的条带
    for (let k = 0; k < m; k++) {
      if (mask & (1 << k)) continue;
      const s = strips[k];
      if (p + s.length > half) continue; // 条带须完整落在首半内
      // 即使两条条带首角度相同，它们也是不同的后续选择（nActive 不同），不可合并
      push(ANGLE_INDEX[s.pattern[0]], k, 1, mask);
    }
    // 也可以不开启任何条带（条带只能从当前位置开启，跨过的位置日后无法回填，
    // 因此两条条带的采用区间天然不可能重叠）
    for (let ai = 0; ai < 4; ai++) push(ai, -1, 0, mask);
    return out;
  };

  // 首层（表面）初始化：不允许 90°
  let cur = new Map<string, DpValue>();
  const seed = (
    ai: number,
    active: number,
    activePos: number,
    mask: number,
    starts: number[],
  ): void => {
    if (target[ai] === 0 || ANGLES[ai] === 90) return;
    const counts = [0, 0, 0, 0];
    counts[ai] = 1;
    const v: DpValue = {
      counts,
      last: ai,
      run: 1,
      changes: costAt(0, ai),
      trans: 0,
      seq: [ai],
      active,
      activePos,
      mask,
      starts,
    };
    const k = keyOf(counts, ai, 1, active, activePos, mask);
    const existing = cur.get(k);
    if (!existing || isBetter(v, existing)) cur.set(k, v);
  };

  if (stripMode) {
    for (let k = 0; k < m; k++) {
      const s = strips[k];
      if (s.length > half) continue; // validateStrips 已排除，双保险
      const ai = ANGLE_INDEX[s.pattern[0]];
      const starts = new Array(m).fill(-1);
      starts[k] = 0;
      seed(ai, k, 1, 0, starts);
    }
    // 首层不放置任何条带
    for (let ai = 0; ai < ANGLES.length; ai++) seed(ai, -1, 0, 0, new Array(m).fill(-1));
  } else {
    for (let ai = 0; ai < ANGLES.length; ai++) seed(ai, -1, 0, 0, []);
  }

  // 逐层扩展首半
  for (let p = 1; p < half; p++) {
    const nxt = new Map<string, DpValue>();
    for (const v of cur.values()) {
      const choices = allowedAngles(p, v.active, v.activePos, v.mask);
      for (const { ai, nActive, nPos, nMask } of choices) {
        if (v.counts[ai] >= target[ai]) continue;
        if (!isAdjacentAllowed(ANGLES[v.last], ANGLES[ai])) continue;
        const run = ai === v.last ? v.run + 1 : 1;
        if (run > MAX_RUN) continue;
        const counts = [...v.counts];
        counts[ai]++;
        // 新开启条带（无活跃 → 有活跃）记录采用起点
        let starts = v.starts;
        if (stripMode && v.active === -1 && nActive >= 0 && v.activePos === 0) {
          starts = [...v.starts];
          starts[nActive] = p;
        }
        const cand: DpValue = {
          counts,
          last: ai,
          run,
          changes: v.changes + costAt(p, ai),
          trans: v.trans + (ai === v.last ? 0 : 1),
          seq: [...v.seq, ai],
          active: nActive,
          activePos: nPos,
          mask: nMask,
          starts,
        };
        const k = keyOf(counts, ai, run, nActive, nPos, nMask);
        const existing = nxt.get(k);
        if (!existing || isBetter(cand, existing)) nxt.set(k, cand);
      }
    }
    cur = nxt;
    if (cur.size === 0) break;
  }

  // 收尾：首半末尾连续段长须为 1，否则中面处同角连续 ≥ 4 层；
  // 条带模式下所有条带必须已完整落位（mask 全 1 且无活跃条带）
  let best: DpValue | null = null;
  for (const v of cur.values()) {
    if (v.run !== 1) continue;
    if (stripMode && (v.mask !== fullMask || v.active !== -1)) continue;
    if (!best || isBetter(v, best)) best = v;
  }

  if (!best) {
    const quota = ANGLES.map((a, i) => `${formatAngle(a)} × ${totals[i]}`).join('，');
    if (stripMode) {
      return {
        status: 'infeasible',
        stripMode: true,
        reasons: [
          `条带无法共同放置：在保持各角度数量（${quota}）并满足中面对称、表面非 90°、相邻角差 ≤ 45°、同角连续 ≤ 3 层的前提下，` +
            `不存在让 ${m} 条条带各自以规定角度顺序完整连续出现、且采用位置互不重叠的首半排列。`,
          ...describeStripBlockers(strips),
        ],
      };
    }
    return {
      status: 'infeasible',
      stripMode: false,
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

  let stripPlacements: StripPlacement[] = [];
  if (stripMode) {
    stripPlacements = strips.map((s, k) => {
      const adoptedStart = best!.starts[k];
      const adoptedEnd = adoptedStart + s.length;
      return {
        stripIndex: k,
        originalStart: s.start,
        originalEnd: s.end,
        adoptedStart,
        adoptedEnd,
        mirrorStart: n - adoptedEnd,
        mirrorEnd: n - adoptedStart,
        pattern: [...s.pattern],
      };
    });
  }

  return {
    status: 'ok',
    original: [...original],
    repaired,
    changes: changedPositions.length,
    transitions: transitionBoundaries.length,
    changedPositions,
    transitionBoundaries,
    stripMode,
    stripPlacements,
  };
}

/** 条带阻断时给出逐条的可复核线索（角度构成、长度与表面限制） */
function describeStripBlockers(strips: readonly ResolvedStrip[]): string[] {
  const lines: string[] = [];
  strips.forEach((s, k) => {
    const seqText = s.pattern.map(formatAngle).join(' → ');
    const parts: string[] = [`长度 ${s.length} 层，须连续占用 ${s.length} 个首半位置`];
    if (s.pattern[0] === 90) parts.push('首角度为 90°，采用起点不能是第 1 层（表面层非 90°）');
    lines.push(`第 ${k + 1} 条（原第 ${s.start + 1}–${s.end} 层，${seqText}）：${parts.join('；')}。`);
  });
  return lines;
}
