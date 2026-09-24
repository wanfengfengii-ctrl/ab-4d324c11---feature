/**
 * 铺层角度域与规则常量。
 *
 * 合法角度仅有 0°、+45°、−45°、90°。
 * 字典序次序（用于最优解并列时的裁决）：0 < +45 < −45 < 90，
 * 因此 ANGLES 数组的下标序即规定次序，直接比较下标数组即可。
 */
export const ANGLES = [0, 45, -45, 90] as const;

export type Angle = (typeof ANGLES)[number];

/** 角度 -> 规定次序下标（0°→0，+45°→1，−45°→2，90°→3） */
export const ANGLE_INDEX: Record<Angle, number> = {
  [0]: 0,
  [45]: 1,
  [-45]: 2,
  [90]: 3,
};

/** 规则常量 */
export const MIN_LAYERS = 4;
export const MAX_LAYERS = 48;
export const MAX_ADJACENT_DIFF = 45;
export const MAX_RUN = 3;

/**
 * 按 180° 周期计算的相邻角差：
 * 角度先归一化到 [0, 180)，再取圆周上的最短距离。
 * 例如 −45°(=135°) 与 90° 的角差为 45°；0° 与 90° 的角差为 90°。
 */
export function angleDiff(a: Angle, b: Angle): number {
  const na = ((a % 180) + 180) % 180;
  const nb = ((b % 180) + 180) % 180;
  const d = Math.abs(na - nb) % 180;
  return Math.min(d, 180 - d);
}

/** 相邻两层是否满足角差 ≤ 45° */
export function isAdjacentAllowed(a: Angle, b: Angle): boolean {
  return angleDiff(a, b) <= MAX_ADJACENT_DIFF;
}

/** 展示用角度文本（使用真正的减号 U+2212） */
export function formatAngle(a: Angle): string {
  if (a === 45) return '+45°';
  if (a === -45) return '−45°';
  return `${a}°`;
}

/** 序列化用角度文本（可被解析器原样读回） */
export function serializeAngle(a: Angle): string {
  if (a === 45) return '+45';
  if (a === -45) return '-45';
  return String(a);
}

export function serializeSequence(seq: readonly Angle[]): string {
  return seq.map(serializeAngle).join(', ');
}
