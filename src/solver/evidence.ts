import {
  ANGLES,
  ANGLE_INDEX,
  MAX_ADJACENT_DIFF,
  MAX_LAYERS,
  MAX_RUN,
  MIN_LAYERS,
  angleDiff,
  formatAngle,
  type Angle,
} from './angles';
import type { StripPlacement } from './solve';

export interface RuleCheck {
  id: string;
  /** 规则名称 */
  title: string;
  /** 该规则在修复结果上是否通过 */
  pass: boolean;
  /** 一句话结论 */
  summary: string;
  /** 可复核的逐条证据 */
  details: string[];
}

function countByAngle(seq: readonly Angle[]): number[] {
  const counts = [0, 0, 0, 0];
  for (const a of seq) counts[ANGLE_INDEX[a]]++;
  return counts;
}

/**
 * 针对修复结果逐条生成规则证据。
 * 所有规则都应在修复结果上通过；若某条未通过，页面会如实标出（便于发现求解器缺陷）。
 */
export function buildRuleChecks(original: readonly Angle[], repaired: readonly Angle[]): RuleCheck[] {
  const n = repaired.length;
  const checks: RuleCheck[] = [];

  // 1. 层数与奇偶
  {
    const pass = n >= MIN_LAYERS && n <= MAX_LAYERS && n % 2 === 0;
    checks.push({
      id: 'layer-count',
      title: `层数 ${MIN_LAYERS}–${MAX_LAYERS} 且为偶数`,
      pass,
      summary: `共 ${n} 层（${n % 2 === 0 ? '偶数' : '奇数'}）`,
      details: [`层数 n = ${n}，${MIN_LAYERS} ≤ ${n} ≤ ${MAX_LAYERS}，且 ${n} mod 2 = ${n % 2}。`],
    });
  }

  // 2. 角度取值域
  {
    const bad = repaired
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => !ANGLES.includes(a));
    checks.push({
      id: 'angle-domain',
      title: '角度取值 ∈ {0°, +45°, −45°, 90°}',
      pass: bad.length === 0,
      summary: bad.length === 0 ? `${n} 层全部合法` : `${bad.length} 层越界`,
      details:
        bad.length === 0
          ? [`逐层检查：${n} 个角度均属于 {0°, +45°, −45°, 90°}。`]
          : bad.map(({ a, i }) => `第 ${i + 1} 层取值 ${a} 不在允许集合内。`),
    });
  }

  // 3. 各角度数量保持
  {
    const before = countByAngle(original);
    const after = countByAngle(repaired);
    const pass = ANGLES.every((_, i) => before[i] === after[i]);
    checks.push({
      id: 'count-preserved',
      title: '各角度数量与原序列一致',
      pass,
      summary: pass ? '四种角度数量均未改变' : '存在数量不一致的角度',
      details: ANGLES.map(
        (a, i) =>
          `${formatAngle(a)}：原序列 ${before[i]} 层 → 修复后 ${after[i]} 层${before[i] === after[i] ? '（一致）' : '（不一致！）'}`,
      ),
    });
  }

  // 4. 中面对称
  {
    const pairs: string[] = [];
    let pass = true;
    for (let i = 0; i < n / 2; i++) {
      const j = n - 1 - i;
      const eq = repaired[i] === repaired[j];
      if (!eq) pass = false;
      pairs.push(
        `第 ${i + 1} 层 ↔ 第 ${j + 1} 层：${formatAngle(repaired[i])} ${eq ? '=' : '≠'} ${formatAngle(repaired[j])}`,
      );
    }
    checks.push({
      id: 'symmetry',
      title: '关于中面对称',
      pass,
      summary: `${n / 2} 对镜像层全部相等`,
      details: pairs,
    });
  }

  // 5. +45° 与 −45° 等量
  {
    const after = countByAngle(repaired);
    const pass = after[1] === after[2];
    checks.push({
      id: 'balance',
      title: '+45° 与 −45° 数量相等',
      pass,
      summary: `+45° × ${after[1]}，−45° × ${after[2]}`,
      details: [`+45° 共 ${after[1]} 层，−45° 共 ${after[2]} 层，${pass ? '相等' : '不相等'}。`],
    });
  }

  // 6. 表面非 90°
  {
    const top = repaired[0];
    const bottom = repaired[n - 1];
    const pass = top !== 90 && bottom !== 90;
    checks.push({
      id: 'surface',
      title: '表面层非 90°',
      pass,
      summary: `第 1 层 = ${formatAngle(top)}，第 ${n} 层 = ${formatAngle(bottom)}`,
      details: [
        `上表面第 1 层为 ${formatAngle(top)}（${top !== 90 ? '非 90°' : '为 90°！'}）。`,
        `下表面第 ${n} 层为 ${formatAngle(bottom)}（${bottom !== 90 ? '非 90°' : '为 90°！'}）。`,
      ],
    });
  }

  // 7. 相邻角差 ≤ 45°（180° 周期）
  {
    const pairs: string[] = [];
    let maxDiff = 0;
    let pass = true;
    for (let i = 0; i < n - 1; i++) {
      const d = angleDiff(repaired[i], repaired[i + 1]);
      maxDiff = Math.max(maxDiff, d);
      if (d > MAX_ADJACENT_DIFF) pass = false;
      pairs.push(
        `第 ${i + 1}–${i + 2} 层：${formatAngle(repaired[i])} → ${formatAngle(repaired[i + 1])}，角差 ${d}°${d > MAX_ADJACENT_DIFF ? '（超限！）' : ''}`,
      );
    }
    checks.push({
      id: 'adjacency',
      title: `相邻角差 ≤ ${MAX_ADJACENT_DIFF}°（按 180° 周期计）`,
      pass,
      summary: `${n - 1} 对相邻层，最大角差 ${maxDiff}°`,
      details: pairs,
    });
  }

  // 8. 同角连续 ≤ 3 层
  {
    const runs: string[] = [];
    let maxRun = 0;
    let pass = true;
    let start = 0;
    for (let i = 1; i <= n; i++) {
      if (i === n || repaired[i] !== repaired[start]) {
        const len = i - start;
        maxRun = Math.max(maxRun, len);
        if (len > MAX_RUN) pass = false;
        runs.push(
          `第 ${start + 1}–${i} 层：${formatAngle(repaired[start])} 连续 ${len} 层${len > MAX_RUN ? '（超限！）' : ''}`,
        );
        start = i;
      }
    }
    checks.push({
      id: 'run-length',
      title: `同角连续 ≤ ${MAX_RUN} 层`,
      pass,
      summary: `最长连续 ${maxRun} 层`,
      details: runs,
    });
  }

  return checks;
}

/**
 * 条带约束证据（仅条带模式）：逐条核对每条条带的原始区间、采用区间与镜像位置，
 * 并给出逐层角度证据；同时核验各条带采用区间互不重叠。
 * 所有条目都应在修复结果上通过；若未通过，页面会如实标出（便于发现求解器缺陷）。
 */
export function buildStripCheck(
  original: readonly Angle[],
  repaired: readonly Angle[],
  placements: readonly StripPlacement[],
): RuleCheck {
  const n = repaired.length;
  const details: string[] = [];
  let pass = true;

  placements.forEach((pl, idx) => {
    const len = pl.angles.length;
    let ok = true;
    const layers: string[] = [];
    for (let k = 0; k < len; k++) {
      const o = original[pl.originalStart + k];
      const adopted = repaired[pl.placedStart + k];
      const mirror = repaired[n - 1 - (pl.placedStart + k)];
      if (o !== pl.angles[k] || adopted !== pl.angles[k] || mirror !== pl.angles[k]) ok = false;
      layers.push(
        `　第 ${k + 1} 层：原第 ${pl.originalStart + k + 1} 层 ${formatAngle(o)} →` +
          ` 采用第 ${pl.placedStart + k + 1} 层 ${formatAngle(adopted)} →` +
          ` 镜像第 ${n - pl.placedStart - k} 层 ${formatAngle(mirror)}`,
      );
    }
    if (!ok) pass = false;
    details.push(
      `条带 ${idx + 1}：原第 ${pl.originalStart + 1}–${pl.originalEnd} 层` +
        ` [${pl.angles.map(formatAngle).join(' → ')}] 完整连续落于首半第 ${pl.placedStart + 1}–${pl.placedEnd} 层` +
        `（镜像第 ${pl.mirrorStart + 1}–${pl.mirrorEnd} 层）${ok ? '。' : '——逐层角度不一致！'}`,
    );
    details.push(...layers);
  });

  const sorted = [...placements].sort((a, b) => a.placedStart - b.placedStart);
  let overlapFree = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].placedStart < sorted[i - 1].placedEnd) overlapFree = false;
  }
  if (!overlapFree) pass = false;
  details.push(`各条带采用区间互不重叠：${overlapFree ? '满足。' : '不满足！'}`);

  return {
    id: 'strip-preserved',
    title: '条带完整连续保留（首半落位互不重叠）',
    pass,
    summary: pass
      ? `${placements.length} 条条带全部完整连续保留`
      : `${placements.length} 条条带中存在未完整保留者`,
    details,
  };
}
