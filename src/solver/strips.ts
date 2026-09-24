import { formatAngle, type Angle } from './angles';

/** 条带数量与长度约束（返工工艺规定） */
export const MAX_STRIPS = 3;
export const MIN_STRIP_LEN = 2;
export const MAX_STRIP_LEN = 4;

/** 工程师在参考铺层首半区间内选定的条带（0 基、右开区间） */
export interface StripSpec {
  /** 原始（参考铺层）起始层下标，0 基，须落在首半内 */
  start: number;
  /** 条带长度：2–4 层 */
  length: number;
}

/** 校验通过后解析出的条带：区间 + 必须完整连续出现的角度顺序 */
export interface ResolvedStrip extends StripSpec {
  /** 结束下标（不含），= start + length */
  end: number;
  /** 从参考铺层原样读出的角度顺序 */
  pattern: Angle[];
  /** 工程师选择时的序号（1 基），排序后仍可追溯 */
  order: number;
}

export interface StripValidation {
  valid: boolean;
  /** 逐条配置错误（可复核），valid 时为空 */
  errors: string[];
  /** 保持工程师选择顺序的条带；valid 时可直接交给求解器 */
  strips: ResolvedStrip[];
}

/**
 * 校验条带配置并从参考铺层读取角度顺序。
 * 规则：1–3 条；每条长度 2–4；区间完整落在首半内。
 * 条带在修复结果中的"采用位置"由求解器在全局搜索中裁决，
 * 采用位置彼此不得重叠由 DP 保证（原始区间允许相交或同模式）。
 */
export function validateStrips(
  original: readonly Angle[],
  specs: readonly StripSpec[],
): StripValidation {
  const errors: string[] = [];
  const n = original.length;
  const half = Math.floor(n / 2);

  if (specs.length === 0) {
    errors.push('条带模式要求选定 1–3 条条带（当前为 0 条），或关闭条带模式。');
    return { valid: false, errors, strips: [] };
  }
  if (specs.length > MAX_STRIPS) {
    errors.push(`条带最多 ${MAX_STRIPS} 条（当前指定了 ${specs.length} 条）。`);
  }

  const resolved: ResolvedStrip[] = [];
  specs.forEach((spec, i) => {
    const label = `第 ${i + 1} 条条带`;
    const start = Math.trunc(spec.start);
    const length = Math.trunc(spec.length);
    if (!Number.isInteger(start) || start < 0 || start >= half) {
      errors.push(`${label}：起始层 ${spec.start + 1} 越界，须在首半第 1–${half} 层内。`);
      return;
    }
    if (!Number.isInteger(length) || length < MIN_STRIP_LEN || length > MAX_STRIP_LEN) {
      errors.push(`${label}：长度 ${spec.length} 非法，须为 ${MIN_STRIP_LEN}–${MAX_STRIP_LEN} 层。`);
      return;
    }
    const end = start + length;
    if (end > half) {
      errors.push(
        `${label}：第 ${start + 1}–${end} 层超出首半（共 ${half} 层），起始层最迟为第 ${half - length + 1} 层。`,
      );
      return;
    }
    const pattern = original.slice(start, end);
    resolved.push({ start, length, end, pattern, order: i + 1 });
  });

  if (errors.length > 0) return { valid: false, errors, strips: [] };
  return { valid: true, errors: [], strips: resolved };
}

/** 条带角度顺序的展示文本 */
export function formatPattern(pattern: readonly Angle[]): string {
  return pattern.map(formatAngle).join(' → ');
}
