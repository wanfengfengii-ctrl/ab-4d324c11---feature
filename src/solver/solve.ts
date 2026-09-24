import {
  ANGLES,
  ANGLE_INDEX,
  MAX_RUN,
  formatAngle,
  isAdjacentAllowed,
  type Angle,
} from './angles';
import { formatStripAngles, validateStrips, type StripSpec } from './strips';

/** 条带在修复结果中的落位（区间均为 0 基，end 不含） */
export interface StripPlacement {
  /** 条带序号（0 基，与输入条带顺序一致） */
  index: number;
  /** 条带角度序列（取自参考铺层原区间） */
  angles: Angle[];
  /** 原始区间起点（参考铺层中的层，0 基） */
  originalStart: number;
  /** 原始区间终点（0 基，不含） */
  originalEnd: number;
  /** 采用区间起点（修复结果首半中的层，0 基） */
  placedStart: number;
  /** 采用区间终点（0 基，不含） */
  placedEnd: number;
  /** 镜像区间起点（修复结果第二半中的层，0 基）；镜像层序与条带相反 */
  mirrorStart: number;
  /** 镜像区间终点（0 基，不含） */
  mirrorEnd: number;
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
  /** 条带落位结果（仅条带模式返回，与输入条带一一对应） */
  stripPlacements?: StripPlacement[];
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
  /** 每条条带进度：0=未落位；1..len-1=落位中（已放层数）；len=已完整落位 */
  progress: number[];
  /** 每条条带在首半的落位起点（0 基），未落位为 -1 */
  placements: number[];
}

function keyOf(
  counts: readonly number[],
  last: number,
  run: number,
  progress: readonly number[],
): string {
  return `${counts[0]},${counts[1]},${counts[2]},${counts[3]}|${last}|${run}|${progress.join(',')}`;
}

/** 下标数组按"规定次序"比较（下标序即 0 < +45 < −45 < 90） */
function compareSeq(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/**
 * 全局最优铺层修复（可选条带约束）。
 *
 * 思路：合法序列关于中面对称，因此由首半唯一确定（后一半为首半的镜像）。
 * 对首半做动态规划，状态为 (各角度已用数量, 末层角度, 末层连续段长, 各条带进度)，
 * 逐层扩展；每个状态只保留目标元组 (改动数, 变化次数, 字典序) 最优的前缀——
 * 同一状态的后续选择集合与代价完全相同，被支配的前缀不可能翻盘，
 * 因此该 DP 是全局精确的，而非局部交换或首个可行解。
 *
 * 条带约束在同一全局搜索中裁决（不是先生成原修复方案再筛选）：
 *  - 状态中的"各条带进度"记录每条条带未落位 / 落位中已放层数 / 已完整落位；
 *  - 某条条带落位中时，下一层角度被锁定为该条带的下一层（强制转移）；
 *  - 无条带落位中时，可自由选角，也可在剩余层数足够时开始落位任一未落位条带；
 *    条带一旦开始必须连续放完，且同时至多一条在落位中，故各条带采用区间
 *    天然完整连续且互不重叠；
 *  - 落位位置不进入目标值，只在 (改动数, 变化次数, 字典序) 完全并列时
 *    按"贴近原区间、再靠左"做确定性裁决，保证结果可复现。
 * 不传条带（或传空数组）时，进度维恒为空，转移与裁决退化为原有无约束搜索，
 * 结果语义与条带模式出现前完全一致。
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
export function solve(original: readonly Angle[], strips: readonly StripSpec[] = []): SolveResult {
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

  // —— 条带定义校验（界面已先行校验；此处为防御性复核，非法定义直接判无解） ——
  if (strips.length > 0) {
    const problems = validateStrips(original, strips);
    if (problems.length > 0) return { status: 'infeasible', reasons: problems };
  }

  const m = strips.length;
  const stripSeq = strips.map((s) => s.angles.map((a) => ANGLE_INDEX[a]));
  const stripLen = strips.map((s) => s.angles.length);

  const target = totals.map((t) => t / 2);
  const costAt = (p: number, ai: number): number =>
    (ANGLES[ai] !== original[p] ? 1 : 0) + (ANGLES[ai] !== original[n - 1 - p] ? 1 : 0);

  /** 目标元组 (改动数, 变化次数, 字典序) 的字典序比较：candidate 是否严格优于 current */
  const prefer = (candidate: DpValue, current: DpValue): boolean => {
    if (candidate.changes !== current.changes) return candidate.changes < current.changes;
    if (candidate.trans !== current.trans) return candidate.trans < current.trans;
    const c = compareSeq(candidate.seq, current.seq);
    if (c !== 0) return c < 0;
    // 目标与序列完全并列（修复结果相同，仅落位不同）：条带落位优先贴近原区间
    for (let i = 0; i < m; i++) {
      const dc = Math.abs(candidate.placements[i] - strips[i].start);
      const du = Math.abs(current.placements[i] - strips[i].start);
      if (dc !== du) return dc < du;
    }
    // 再取靠左落位，保证结果确定可复现
    for (let i = 0; i < m; i++) {
      if (candidate.placements[i] !== current.placements[i]) {
        return candidate.placements[i] < current.placements[i];
      }
    }
    return false;
  };

  const NO_PROGRESS: number[] = Array(m).fill(0);
  const NO_PLACEMENT: number[] = Array(m).fill(-1);

  // 首层（表面）初始化：不允许 90°；可自由选角，也可直接开始落位某条条带
  let cur = new Map<string, DpValue>();
  const init = (ai: number, progress: number[], placements: number[]) => {
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
      progress,
      placements,
    };
    const k = keyOf(counts, ai, 1, progress);
    const existing = cur.get(k);
    if (!existing || prefer(v, existing)) cur.set(k, v);
  };
  for (let ai = 0; ai < ANGLES.length; ai++) init(ai, NO_PROGRESS, NO_PLACEMENT);
  for (let i = 0; i < m; i++) {
    if (stripLen[i] > half) continue;
    const progress = [...NO_PROGRESS];
    progress[i] = 1;
    const placements = [...NO_PLACEMENT];
    placements[i] = 0;
    init(stripSeq[i][0], progress, placements);
  }

  // 逐层扩展首半
  for (let p = 1; p < half; p++) {
    const nxt = new Map<string, DpValue>();
    /** 在位置 p 放置角度下标 ai，并按条带进度更新状态后并入候选集 */
    const extend = (v: DpValue, ai: number, progress: number[], placements: number[]) => {
      if (v.counts[ai] >= target[ai]) return;
      if (!isAdjacentAllowed(ANGLES[v.last], ANGLES[ai])) return;
      const run = ai === v.last ? v.run + 1 : 1;
      if (run > MAX_RUN) return;
      const counts = [...v.counts];
      counts[ai]++;
      const cand: DpValue = {
        counts,
        last: ai,
        run,
        changes: v.changes + costAt(p, ai),
        trans: v.trans + (ai === v.last ? 0 : 1),
        seq: [...v.seq, ai],
        progress,
        placements,
      };
      const k = keyOf(counts, ai, run, progress);
      const existing = nxt.get(k);
      if (!existing || prefer(cand, existing)) nxt.set(k, cand);
    };
    for (const v of cur.values()) {
      const busy = v.progress.findIndex((pr, i) => pr > 0 && pr < stripLen[i]);
      if (busy >= 0) {
        // 条带落位中：下一层被锁定为该条带的下一层
        const progress = [...v.progress];
        progress[busy]++;
        extend(v, stripSeq[busy][v.progress[busy]], progress, v.placements);
      } else {
        // 自由选角
        for (let ai = 0; ai < ANGLES.length; ai++) extend(v, ai, v.progress, v.placements);
        // 或开始落位一条尚未落位的条带（剩余层数须放得下整条）
        for (let i = 0; i < m; i++) {
          if (v.progress[i] !== 0) continue;
          if (p + stripLen[i] > half) continue;
          const progress = [...v.progress];
          progress[i] = 1;
          const placements = [...v.placements];
          placements[i] = p;
          extend(v, stripSeq[i][0], progress, placements);
        }
      }
    }
    cur = nxt;
    if (cur.size === 0) break;
  }

  // 收尾：首半末尾连续段长须为 1（否则中面处同角连续 ≥ 4 层），且全部条带已完整落位
  let best: DpValue | null = null;
  for (const v of cur.values()) {
    if (v.run !== 1) continue;
    let allPlaced = true;
    for (let i = 0; i < m; i++) {
      if (v.progress[i] !== stripLen[i]) {
        allPlaced = false;
        break;
      }
    }
    if (!allPlaced) continue;
    if (!best || prefer(v, best)) best = v;
  }

  if (!best) {
    const quota = ANGLES.map((a, i) => `${formatAngle(a)} × ${totals[i]}`).join('，');
    if (m > 0) {
      return {
        status: 'infeasible',
        reasons: [
          `所选 ${m} 条条带无法在首半共同落位：在保持各角度数量（${quota}）且完整连续保留全部条带的前提下，` +
            `不存在满足中面对称、表面非 90°、相邻角差 ≤ 45°、同角连续 ≤ ${MAX_RUN} 层的排列。`,
          ...strips.map(
            (s, i) =>
              `条带 ${i + 1}（原第 ${s.start + 1}–${s.start + s.angles.length} 层）：${formatStripAngles(s.angles)}。`,
          ),
          '可尝试缩短条带、减少条带数量或改选其他区间后重新综合。',
        ],
      };
    }
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

  const result: SolveOk = {
    status: 'ok',
    original: [...original],
    repaired,
    changes: changedPositions.length,
    transitions: transitionBoundaries.length,
    changedPositions,
    transitionBoundaries,
  };

  if (m > 0) {
    result.stripPlacements = strips.map((s, i) => {
      const placedStart = best.placements[i];
      const len = s.angles.length;
      return {
        index: i,
        angles: [...s.angles],
        originalStart: s.start,
        originalEnd: s.start + len,
        placedStart,
        placedEnd: placedStart + len,
        mirrorStart: n - placedStart - len,
        mirrorEnd: n - placedStart,
      };
    });
  }

  return result;
}
