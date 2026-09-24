import { describe, expect, it } from 'vitest';
import { parseSequence } from '../parse';
import { validateInput } from '../validate';

describe('parseSequence', () => {
  it('解析 JSON 数字数组', () => {
    const r = parseSequence('[0, 45, -45, 90]');
    expect(r.errors).toEqual([]);
    expect(r.sequence).toEqual([0, 45, -45, 90]);
  });

  it('解析 JSON 字符串数组（含符号）', () => {
    const r = parseSequence('["0", "+45", "-45", "90"]');
    expect(r.errors).toEqual([]);
    expect(r.sequence).toEqual([0, 45, -45, 90]);
  });

  it('解析逗号/空白/换行分隔的记号串', () => {
    const r = parseSequence('0, +45\n-45  90;0');
    expect(r.errors).toEqual([]);
    expect(r.sequence).toEqual([0, 45, -45, 90, 0]);
  });

  it('省略正号的 45 视为 +45', () => {
    const r = parseSequence('45, 0');
    expect(r.errors).toEqual([]);
    expect(r.sequence).toEqual([45, 0]);
  });

  it('兼容全角字符与排版减号', () => {
    const r = parseSequence('0，＋45、−45；90°');
    expect(r.errors).toEqual([]);
    expect(r.sequence).toEqual([0, 45, -45, 90]);
  });

  it('非法记号给出位置信息', () => {
    const r = parseSequence('0, abc, 90, 30');
    expect(r.sequence).toEqual([0, 90]);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toContain('第 2 项');
    expect(r.errors[0]).toContain('abc');
    expect(r.errors[1]).toContain('第 4 项');
  });

  it('空输入报错', () => {
    expect(parseSequence('   ').errors.length).toBeGreaterThan(0);
  });

  it('非法 JSON 报错', () => {
    const r = parseSequence('[0, 45');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('JSON');
  });

  it('JSON 非数组报错', () => {
    const r = parseSequence('{"a": 1}');
    expect(r.errors).toHaveLength(1);
  });
});

describe('validateInput', () => {
  it('层数下限', () => {
    expect(validateInput([0, 0])).toHaveLength(1);
    expect(validateInput([0, 0, 0, 0])).toEqual([]);
  });

  it('层数上限', () => {
    expect(validateInput(new Array(48).fill(0))).toEqual([]);
    expect(validateInput(new Array(50).fill(0))).toHaveLength(1);
  });

  it('奇数层报错', () => {
    const errs = validateInput([0, 0, 0, 0, 0]);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('奇数');
  });
});
