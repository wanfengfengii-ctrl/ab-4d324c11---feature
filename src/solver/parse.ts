import type { Angle } from './angles';

export interface ParseResult {
  /** 已成功解析的角度（即使存在错误项，也保留可解析部分供预览） */
  sequence: Angle[];
  /** 逐条解析错误，含位置信息，便于工程师定位 */
  errors: string[];
}

/** 单个记号 -> 角度；非法记号返回 null。允许省略正号与度数符号。 */
function tokenToAngle(token: string): Angle | null {
  const t = token.replace(/°/g, '').trim();
  switch (t) {
    case '0':
      return 0;
    case '45':
    case '+45':
      return 45;
    case '-45':
      return -45;
    case '90':
      return 90;
    default:
      return null;
  }
}

/** 归一化常见全角/排版字符：减号、加号、逗号、顿号、分号 */
function normalizeText(raw: string): string {
  return raw
    .replace(/−/g, '-')
    .replace(/＋/g, '+')
    .replace(/，/g, ',')
    .replace(/、/g, ',')
    .replace(/；/g, ';');
}

const ANGLE_HINT = '允许的角度仅为 0、+45、−45、90';

/**
 * 解析参考铺层文本。
 * 支持两种格式：
 *  1. JSON 数组，如 [0, "+45", "-45", 90]
 *  2. 以逗号/空白/分号/竖线分隔的记号串，如 0, +45, -45, 90
 */
export function parseSequence(raw: string): ParseResult {
  const errors: string[] = [];
  const sequence: Angle[] = [];
  const text = normalizeText(raw).trim();

  if (!text) {
    errors.push('输入为空：请提供 4–48 个偶数层角度（0、+45、−45、90）。');
    return { sequence, errors };
  }

  if (text.startsWith('{')) {
    errors.push('输入看似 JSON 对象：请提供角度数组，例如 [0, "+45", "-45", 90]。');
    return { sequence, errors };
  }

  if (text.startsWith('[')) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (e) {
      errors.push(`JSON 解析失败：${e instanceof Error ? e.message : String(e)}`);
      return { sequence, errors };
    }
    if (!Array.isArray(data)) {
      errors.push('JSON 输入必须是角度数组，例如 [0, "+45", "-45", 90]。');
      return { sequence, errors };
    }
    data.forEach((item, i) => {
      const token =
        typeof item === 'number' ? String(item) : typeof item === 'string' ? item : null;
      if (token === null) {
        errors.push(`第 ${i + 1} 项（${JSON.stringify(item)}）不是数字或字符串，${ANGLE_HINT}。`);
        return;
      }
      const angle = tokenToAngle(token);
      if (angle === null) {
        errors.push(`第 ${i + 1} 项 "${token}" 不是合法角度，${ANGLE_HINT}。`);
      } else {
        sequence.push(angle);
      }
    });
    return { sequence, errors };
  }

  const tokens = text.split(/[\s,;|/]+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    errors.push('未解析到任何角度记号。');
    return { sequence, errors };
  }
  tokens.forEach((token, i) => {
    const angle = tokenToAngle(token);
    if (angle === null) {
      errors.push(`第 ${i + 1} 项 "${token}" 不是合法角度，${ANGLE_HINT}。`);
    } else {
      sequence.push(angle);
    }
  });
  return { sequence, errors };
}
