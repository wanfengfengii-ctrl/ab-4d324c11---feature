// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from '../App';

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<App />);
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const text = () => container.textContent ?? '';
const buttons = () => [...container.querySelectorAll('button')];

function runButton(): HTMLButtonElement {
  const btn = buttons().find((b) => b.textContent?.includes('启动综合'));
  if (!btn) throw new Error('未找到「启动综合」按钮');
  return btn;
}

function clickRun() {
  act(() => {
    runButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function setSequence(next: string) {
  const ta = container.querySelector<HTMLTextAreaElement>('textarea.seq-input');
  if (!ta) throw new Error('未找到序列输入框');
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )!.set!;
  act(() => {
    setter.call(ta, next);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function toggleStripMode() {
  const box = container.querySelector<HTMLInputElement>('.strip-toggle input[type="checkbox"]');
  if (!box) throw new Error('未找到条带模式开关');
  act(() => {
    box.click();
  });
}

function setStripStart(index: number, start: number) {
  const sel = container.querySelector<HTMLSelectElement>(
    `select[aria-label="条带 ${index} 起始层"]`,
  );
  if (!sel) throw new Error(`未找到条带 ${index} 起始层下拉框`);
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(sel, String(start));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function addStrip() {
  const btn = buttons().find((b) => b.textContent?.includes('添加条带'));
  if (!btn) throw new Error('未找到「添加条带」按钮');
  act(() => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('App 条带模式交互', () => {
  it('默认关闭条带模式：综合结果不含条带证据区', () => {
    expect(text()).toContain('启用条带约束');
    clickRun();
    expect(text()).toContain('综合结果 · 两级目标');
    expect(text()).not.toContain('条带落位与逐层证据');
    expect(text()).not.toContain('条带完整连续保留');
  });

  it('启用条带模式并综合：展示原始区间、采用区间、镜像位置与逐层证据', () => {
    // 默认示例「90, +45, -45, 0, 0, -45, +45, 90」+ 默认条带（第 1 层起 2 层 = [90°, +45°]）
    // 手工核算：唯一最优首半为 [-45, 90, 45, 0]，条带落于首半第 2–3 层，镜像第 6–7 层
    toggleStripMode();
    expect(runButton().textContent).toContain('条带约束');
    clickRun();
    expect(text()).toContain('条带落位与逐层证据');
    expect(text()).toContain('原始区间：参考铺层第 1–2 层');
    expect(text()).toContain('采用区间：修复结果首半第 2–3 层');
    expect(text()).toContain('镜像位置：第 6–7 层');
    expect(text()).toContain('条带完整连续保留');
    expect(text()).toContain('条带1');
  });

  it('编辑参考铺层后立即撤下旧综合结果', () => {
    clickRun();
    expect(text()).toContain('综合结果 · 两级目标');
    setSequence('0, +45, 90, -45, -45, 90, +45, 0');
    expect(text()).not.toContain('综合结果 · 两级目标');
    expect(text()).not.toContain('确实无解');
  });

  it('切换条带模式后立即撤下旧综合结果', () => {
    clickRun();
    expect(text()).toContain('综合结果 · 两级目标');
    toggleStripMode();
    expect(text()).not.toContain('综合结果 · 两级目标');
  });

  it('编辑条带后立即撤下旧综合结果', () => {
    toggleStripMode();
    clickRun();
    expect(text()).toContain('条带落位与逐层证据');
    setStripStart(1, 2);
    expect(text()).not.toContain('条带落位与逐层证据');
    expect(text()).not.toContain('综合结果 · 两级目标');
  });

  it('条带无法共同放置时清除旧结论并说明阻断原因', () => {
    // 先得到一个正常结论
    clickRun();
    expect(text()).toContain('综合结果 · 两级目标');
    // 换成「90, 0, 45, -45, -45, 45, 0, 90」：本身可修，但条带 [90°, 0°] 角差超限
    setSequence('90, 0, 45, -45, -45, 45, 0, 90');
    toggleStripMode();
    clickRun();
    expect(text()).toContain('确实无解，已清除旧结果');
    expect(text()).toContain('无法在首半共同落位');
    expect(text()).toContain('完整连续保留所选条带');
    expect(text()).not.toContain('综合结果 · 两级目标');
  });

  it('条带定义非法（重叠）时按输入非法处理并阻止综合', () => {
    toggleStripMode();
    addStrip(); // 条带 2 默认第 3 层起 2 层
    setStripStart(1, 2); // 条带 1 改为第 2–3 层，与条带 2（第 3–4 层）重叠
    expect(text()).toContain('重叠'); // 实时校验提示
    clickRun();
    expect(text()).toContain('输入非法，已清除旧结果');
    expect(text()).not.toContain('综合结果 · 两级目标');
  });

  it('条带模式下参考铺层首半变化会联动条带校验', () => {
    toggleStripMode();
    // 换成 6 层序列：首半仅 3 层，条带（第 1 层起 2 层）仍合法
    setSequence('0, +45, -45, -45, +45, 0');
    clickRun();
    expect(text()).toContain('条带落位与逐层证据');
  });
});
