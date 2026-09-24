import { useRef } from 'react';
import {
  ANGLES,
  MAX_LAYERS,
  MIN_LAYERS,
  formatAngle,
  serializeSequence,
  type Angle,
} from '../solver';
import type { ParseResult } from '../solver/parse';
import { AngleChip } from './AngleChip';

export const EXAMPLES: { label: string; text: string; note: string }[] = [
  {
    label: '需修复示例',
    note: '表面为 90° 且 +45°/−45° 相邻，需全局重排',
    text: '90, +45, -45, 0, 0, -45, +45, 90',
  },
  {
    label: '已合法示例',
    note: '本身满足全部规则，最优解即原序列',
    text: '0, +45, 90, -45, -45, 90, +45, 0',
  },
  {
    label: '无解示例',
    note: '0° 与 90° 数量为奇数，无法构成对称序列',
    text: '0, 0, 0, +45, +45, -45, -45, 90',
  },
  {
    label: '非法输入示例',
    note: '含非法角度记号，且层数不足',
    text: '0, +30, -45, 90, 0',
  },
];

interface Props {
  text: string;
  parsed: ParseResult;
  onTextChange(text: string): void;
}

export function SequenceEditor({ text, parsed, onTextChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = parsed.sequence;
  const parseOk = parsed.errors.length === 0;

  const commit = (next: Angle[]) => onTextChange(serializeSequence(next));

  const setLayer = (i: number, a: Angle) => {
    const next = [...seq];
    next[i] = a;
    commit(next);
  };
  const removeLayer = (i: number) => commit(seq.filter((_, k) => k !== i));
  const addLayer = () => {
    if (seq.length < MAX_LAYERS) commit([...seq, 0]);
  };

  const onImportFile = (file: File | undefined) => {
    if (!file) return;
    file
      .text()
      .then(onTextChange)
      .catch(() => onTextChange(`（读取文件 ${file.name} 失败）`));
  };

  return (
    <section className="card" aria-label="参考铺层输入">
      <div className="card-head">
        <h2>① 参考铺层</h2>
        <span className={`badge ${parseOk ? 'ok' : 'bad'}`}>
          {parseOk ? `已解析 ${seq.length} 层` : `${parsed.errors.length} 处解析问题`}
        </span>
      </div>

      <textarea
        className="seq-input"
        rows={3}
        spellCheck={false}
        value={text}
        placeholder={'输入角度序列，例如：\n0, +45, -45, 90, 90, -45, +45, 0\n或 JSON：[0, "+45", "-45", 90]'}
        onChange={(e) => onTextChange(e.target.value)}
      />

      <div className="toolbar">
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          导入文件…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.txt,.csv,text/plain,application/json"
          hidden
          onChange={(e) => {
            onImportFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            className="btn ghost"
            title={ex.note}
            onClick={() => onTextChange(ex.text)}
          >
            {ex.label}
          </button>
        ))}
        <button type="button" className="btn ghost" onClick={() => onTextChange('')}>
          清空
        </button>
      </div>

      {parsed.errors.length > 0 && (
        <ul className="problem-list" aria-label="解析错误">
          {parsed.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      {seq.length > 0 && (
        <>
          <div className="chip-editor" role="list" aria-label="逐层编辑">
            {seq.map((a, i) => (
              <div className="chip-cell" role="listitem" key={i}>
                <span className="layer-no">{i + 1}</span>
                <select
                  aria-label={`第 ${i + 1} 层角度`}
                  value={String(a)}
                  onChange={(e) => setLayer(i, Number(e.target.value) as Angle)}
                >
                  {ANGLES.map((ang) => (
                    <option key={ang} value={String(ang)}>
                      {formatAngle(ang)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="chip-del"
                  title={`删除第 ${i + 1} 层`}
                  onClick={() => removeLayer(i)}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn add-layer"
              disabled={seq.length >= MAX_LAYERS}
              onClick={addLayer}
            >
              ＋ 添加层
            </button>
          </div>
          <p className="hint">
            层数 {seq.length}（要求 {MIN_LAYERS}–{MAX_LAYERS} 且为偶数）
            {seq.length > 0 && (
              <>
                ；当前角度构成：
                {ANGLES.map((ang) => (
                  <span key={ang} className="count-item">
                    <AngleChip angle={ang} />× {seq.filter((x) => x === ang).length}
                  </span>
                ))}
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
}
