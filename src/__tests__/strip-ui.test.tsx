// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../App';

// vitest 未启用 globals，RTL 的自动 cleanup 不会注册；每个测试后手动卸载
afterEach(() => cleanup());

const runButton = () => screen.getByRole('button', { name: /启动综合/ });

describe('工艺条带界面', () => {
  it('默认关闭条带模式：编辑面板存在但无条带字段，综合结果无条带证据', () => {
    render(<App />);
    expect(screen.getByText(/工艺条带（返工保留）/)).toBeTruthy();
    expect(screen.getByText('条带模式：关')).toBeTruthy();
    expect(screen.queryByLabelText('第 1 条条带起始层')).toBeNull();

    fireEvent.click(runButton());
    expect(screen.getByText('② 综合结果 · 两级目标')).toBeTruthy();
    expect(screen.queryByText('④ 工艺条带落位证据')).toBeNull();
    cleanup();
  });

  it('开启条带模式 → 配置字段出现；综合后逐条显示原始/采用/镜像区间与逐层角度证据', () => {
    render(<App />);
    // 默认示例 n=8，首半 4 层；默认条带为第 1–2 层 [90°,+45°]
    fireEvent.click(screen.getByText('条带模式：关'));
    expect(screen.getByLabelText('第 1 条条带起始层')).toBeTruthy();
    // 综合按钮旁的联合裁决提示（与条带面板内的说明文案区分）
    expect(screen.getByText(/同一次全局搜索中联合裁决条带落位/)).toBeTruthy();

    fireEvent.click(runButton());

    const evidence = screen.getByText('④ 工艺条带落位证据').closest('section')!;
    expect(within(evidence).getByText(/1 条条带全部完整落位/)).toBeTruthy();
    expect(within(evidence).getByText(/90° → \+45°/)).toBeTruthy();
    // 原始区间：全板第 1–2 层；采用区间：全板第 2–3 层；镜像：全板第 6–7 层
    expect(within(evidence).getByText(/全板第 1–2 层/)).toBeTruthy();
    expect(within(evidence).getByText(/全板第 2–3 层/)).toBeTruthy();
    expect(within(evidence).getByText(/全板第 6–7 层/)).toBeTruthy();
    // 逐层角度证据表
    expect(within(evidence).getAllByText('条带要求').length).toBeGreaterThan(0);
    expect(within(evidence).getAllByText('修复结果').length).toBeGreaterThan(0);
    expect(within(evidence).getByText(/第 2 层 90° ↔ 第 7 层 90°/)).toBeTruthy();
    // 差异表新增条带列（采用区间每层都有标记）
    expect(screen.getAllByText('第 1 条·采用').length).toBe(2);
    expect(screen.getAllByText('镜像').length).toBe(2);
    cleanup();
  });

  it('条带内部角差超限（+45°→−45°）：清除旧结论并说明阻断原因', () => {
    render(<App />);
    fireEvent.click(screen.getByText('条带模式：关'));
    // 长度 3 → 条带 [90,+45,−45]，其中 +45→−45 角差 90°，无法放置
    fireEvent.change(screen.getByLabelText('第 1 条条带长度'), { target: { value: '3' } });
    // 编辑后尚未综合：无结果区
    expect(screen.queryByText('③ 综合结果 · 两级目标')).toBeNull();

    fireEvent.click(runButton());
    // 阻断结论同时出现在卡片标题与原因列表中
    expect(screen.getByRole('heading', { name: /条带无法共同放置/ })).toBeTruthy();
    expect(screen.getByText(/不存在让 1 条条带/)).toBeTruthy();
    // 阻断时给出逐条子原因
    expect(screen.getByText(/首角度为 90°/)).toBeTruthy();
    expect(screen.queryByText('④ 工艺条带落位证据')).toBeNull();
    cleanup();
  });

  it('编辑条带后立即撤下旧综合结果（无需重新综合）', () => {
    render(<App />);
    fireEvent.click(screen.getByText('条带模式：关'));
    fireEvent.click(runButton());
    expect(screen.getByText('④ 工艺条带落位证据')).toBeTruthy();

    // 改长度即撤结果
    fireEvent.change(screen.getByLabelText('第 1 条条带长度'), { target: { value: '4' } });
    expect(screen.queryByText('④ 工艺条带落位证据')).toBeNull();
    expect(screen.queryByText('③ 综合结果 · 两级目标')).toBeNull();
    cleanup();
  });

  it('编辑参考铺层或切换模式后立即撤下旧综合结果', () => {
    render(<App />);
    fireEvent.click(screen.getByText('条带模式：关'));
    fireEvent.click(runButton());
    expect(screen.getByText('④ 工艺条带落位证据')).toBeTruthy();

    // 切回关闭模式
    fireEvent.click(screen.getByText('条带模式：开'));
    expect(screen.queryByText('④ 工艺条带落位证据')).toBeNull();
    fireEvent.click(runButton());
    expect(screen.getByText('② 综合结果 · 两级目标')).toBeTruthy();
    expect(screen.queryByText('④ 工艺条带落位证据')).toBeNull();

    // 编辑参考铺层
    const textarea = screen.getByPlaceholderText(/输入角度序列/);
    fireEvent.change(textarea, { target: { value: '0, +45, -45, 90, 90, -45, +45, 0' } });
    expect(screen.queryByText('② 综合结果 · 两级目标')).toBeNull();
    cleanup();
  });

  it('条带配置非法（0 条）时综合给出输入非法原因，且不展示旧结果', () => {
    render(<App />);
    fireEvent.click(screen.getByText('条带模式：关'));
    // 删除唯一条带
    fireEvent.click(screen.getByTitle('删除第 1 条条带'));
    expect(screen.getByText(/条带模式要求选定 1–3 条条带/)).toBeTruthy();
    fireEvent.click(runButton());
    expect(screen.getByText('✕ 输入非法，已清除旧结果')).toBeTruthy();
    cleanup();
  });

  it('关闭模式后原语义保持不变（无条带列与条带标记）', () => {
    render(<App />);
    // 不开条带直接综合
    fireEvent.click(runButton());
    // 差异表无"条带"列头
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).not.toContain('条带');
    // 结果区编号沿用旧编号
    expect(screen.getByText('④ 规则复核证据（针对修复结果）')).toBeTruthy();
    cleanup();
  });
});
