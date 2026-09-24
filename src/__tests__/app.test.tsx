import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import App from '../App';

describe('App 渲染', () => {
  it('工作台骨架可渲染（输入区 + 综合按钮）', () => {
    const html = renderToString(<App />);
    expect(html).toContain('复合材料铺层序列修复工作台');
    expect(html).toContain('启动综合');
    expect(html).toContain('参考铺层');
    expect(html).toContain('不调用任何业务后端');
  });
});
