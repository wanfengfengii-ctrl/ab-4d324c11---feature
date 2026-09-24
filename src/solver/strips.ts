import { formatAngle, type Angle } from './angles';

/** 条带长度下限（层） */
export const STRIP_MIN_LEN = 2;
/** 条带长度上限（层） */
export const STRIP_MAX_LEN = 4;
/** 条带数量上限 */
export const STRIP_MAX_COUNT = 3;

/**
 * 工艺条带：参考铺层首半中一段已完成预压的连续铺层。
 * 带条带约束的综合要求：每条条带的角度序列完整连续地出现在修复结果首半中
 * （落位位置由全局搜索裁决，不必留在原位），且各条带的采用区间互不重叠。
 */
export interface StripSpec {
  /** 条带在参考铺层中的起始层（0 基，区间须落在首半内） */
  start: number;
  /** 条带角度序列（取自参考铺层，长度 2–4） */
  angles: Angle[];
}

/**
 * 条带定义校验（区别于落位可行性——后者由求解器在全局搜索中判定）。
 * 仅当条带无法定义一个合法的带约束修复问题时才报错：
 * 数量越界、长度越界、区间超出首半、与参考铺层不一致或彼此重叠。
 */
export function validateStrips(
  original: readonly Angle[],
  strips: readonly StripSpec[],
): string[] {
  const problems: string[] = [];
  const half = Math.floor(original.length / 2);

  if (strips.length === 0) {
    problems.push('已启用条带约束但未选定条带：请在首半选定 1–3 条条带，或关闭条带模式。');
  }
  if (strips.length > STRIP_MAX_COUNT) {
    problems.push(`条带数量 ${strips.length} 超过上限 ${STRIP_MAX_COUNT} 条。`);
  }

  strips.forEach((s, i) => {
    const label = `条带 ${i + 1}`;
    const len = s.angles.length;
    if (len < STRIP_MIN_LEN || len > STRIP_MAX_LEN) {
      problems.push(
        `${label}长度 ${len} 层，不在 ${STRIP_MIN_LEN}–${STRIP_MAX_LEN} 层范围内。`,
      );
    }
    if (s.start < 0 || s.start + len > half) {
      problems.push(
        `${label}原始区间 第 ${s.start + 1}–${s.start + len} 层 超出参考铺层首半（第 1–${half} 层）。`,
      );
    }
    if (s.start >= 0 && s.start + len <= original.length) {
      for (let k = 0; k < len; k++) {
        if (original[s.start + k] !== s.angles[k]) {
          problems.push(
            `${label}角度序列与参考铺层第 ${s.start + 1}–${s.start + len} 层不一致：条带必须取自现有参考铺层。`,
          );
          break;
        }
      }
    }
  });

  for (let i = 0; i < strips.length; i++) {
    for (let j = i + 1; j < strips.length; j++) {
      const a = strips[i];
      const b = strips[j];
      if (a.start < b.start + b.angles.length && b.start < a.start + a.angles.length) {
        problems.push(
          `条带 ${i + 1}（第 ${a.start + 1}–${a.start + a.angles.length} 层）与` +
            `条带 ${j + 1}（第 ${b.start + 1}–${b.start + b.angles.length} 层）在参考铺层中重叠。`,
        );
      }
    }
  }
  return problems;
}

/** 展示用条带角度序列文本，如 "0° → +45° → 90°" */
export function formatStripAngles(angles: readonly Angle[]): string {
  return angles.map(formatAngle).join(' → ');
}
