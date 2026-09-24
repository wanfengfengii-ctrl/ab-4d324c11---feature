import { MAX_LAYERS, MIN_LAYERS, type Angle } from './angles';

/**
 * 输入合法性校验（区别于"规则是否被违反"——规则违反正是要修复的对象）。
 * 仅当输入无法定义一个合法的修复问题时才报错：层数越界或不是偶数。
 */
export function validateInput(seq: readonly Angle[]): string[] {
  const errors: string[] = [];
  if (seq.length < MIN_LAYERS) {
    errors.push(`层数 ${seq.length} 少于下限 ${MIN_LAYERS} 层。`);
  }
  if (seq.length > MAX_LAYERS) {
    errors.push(`层数 ${seq.length} 超过上限 ${MAX_LAYERS} 层。`);
  }
  if (seq.length % 2 !== 0) {
    errors.push(`层数 ${seq.length} 为奇数，中面对称铺层要求偶数层。`);
  }
  return errors;
}
