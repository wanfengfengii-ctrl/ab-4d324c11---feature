import {
  MAX_LAYERS,
  MAX_STRIP_LEN,
  MAX_STRIPS,
  MIN_STRIP_LEN,
  type Angle,
} from '../solver';
import type { StripSpec } from '../solver/strips';
import { AngleChip } from './AngleChip';

interface Props {
  /** 当前已解析的参考铺层（用于预览条带角度顺序） */
  sequence: readonly Angle[];
  /** 参考铺层是否可解析且层数合法为偶数（否则首半无定义） */
  half: number | null;
  enabled: boolean;
  specs: StripSpec[];
  /** 条带配置的实时校验问题（综合时复核同一套规则） */
  problems: string[];
  onToggle(enabled: boolean): void;
  onChange(specs: StripSpec[]): void;
}

/**
 * 工艺条带编辑面板：
 * 工程师在参考铺层首半区间内选定 1–3 条长度 2–4 层的条带。
 * 任何编辑（开关、起点、长度、增删）都由 App 立即撤下旧综合结果。
 */
export function StripEditor({ sequence, half, enabled, specs, problems, onToggle, onChange }: Props) {
  const update = (i: number, patch: Partial<StripSpec>) => {
    onChange(specs.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  };
  const add = () => {
    if (specs.length >= MAX_STRIPS || half === null) return;
    // 默认取尽可能靠首、长度 2 的合法窗口
    const start = 0;
    onChange([...specs, { start, length: MIN_STRIP_LEN }]);
  };
  const remove = (i: number) => onChange(specs.filter((_, k) => k !== i));

  const previewAt = (spec: StripSpec): Angle[] | null => {
    if (half === null) return null;
    if (spec.start < 0 || spec.start >= half) return null;
    if (spec.length < MIN_STRIP_LEN || spec.length > MAX_STRIP_LEN) return null;
    if (spec.start + spec.length > half) return null;
    return sequence.slice(spec.start, spec.start + spec.length);
  };

  return (
    <section className="card" aria-label="工艺条带约束">
      <div className="card-head">
        <h2>{enabled ? '② 工艺条带（返工保留）' : '工艺条带（返工保留）'}</h2>
        <label className="switch">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span>{enabled ? '条带模式：开' : '条带模式：关'}</span>
        </label>
      </div>

      <p className="hint strip-intro">
        返工场景：局部已完成预压的连续铺层尽量作为完整工艺条带保留。开启后可在
        <strong> 参考铺层首半 </strong>
        选定 1–{MAX_STRIPS} 条、长度 {MIN_STRIP_LEN}–{MAX_STRIP_LEN}{' '}
        层的条带；每条条带的角度顺序必须在修复结果首半中完整连续出现，采用位置彼此不得重叠。
        条带落位与两级目标、字典序在<strong>同一次全局搜索</strong>中联合裁决。
      </p>

      {enabled && (
        <>
          {half === null ? (
            <p className="strip-warn">
              参考铺层尚不可用（需 {4}–{MAX_LAYERS} 层且为偶数）：先修正上方参考铺层，再配置条带。
            </p>
          ) : (
            <div className="strip-list">
              {specs.map((spec, i) => {
                const preview = previewAt(spec);
                const startOptions = Array.from(
                  { length: Math.max(0, half - spec.length + 1) },
                  (_, s) => s,
                );
                // 起点当前越界（长度调大后）时保留其值并提示
                const startOutOfRange = spec.start + spec.length > half || spec.start >= half;
                return (
                  <div className="strip-row" key={i}>
                    <div className="strip-fields">
                      <span className="strip-no">第 {i + 1} 条</span>
                      <label>
                        起始层
                        <select
                          aria-label={`第 ${i + 1} 条条带起始层`}
                          value={startOutOfRange ? -1 : spec.start}
                          onChange={(e) => update(i, { start: Number(e.target.value) })}
                        >
                          {startOutOfRange && <option value={-1}>第 {spec.start + 1} 层（越界）</option>}
                          {startOptions.map((s) => (
                            <option key={s} value={s}>
                              第 {s + 1} 层
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        长度
                        <select
                          aria-label={`第 ${i + 1} 条条带长度`}
                          value={spec.length}
                          onChange={(e) => update(i, { length: Number(e.target.value) })}
                        >
                          {[MIN_STRIP_LEN, 3, MAX_STRIP_LEN]
                            .filter((l) => l <= half)
                            .map((l) => (
                              <option key={l} value={l}>
                                {l} 层
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="chip-del"
                        title={`删除第 ${i + 1} 条条带`}
                        onClick={() => remove(i)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="strip-preview">
                      {preview ? (
                        <>
                          <span className="strip-range">
                            原始区间：首半第 {spec.start + 1}–{spec.start + spec.length} 层
                          </span>
                          <span className="strip-pattern">
                            {preview.map((a, t) => (
                              <span key={t} className="strip-pattern-item">
                                {t > 0 && <span className="strip-arrow">→</span>}
                                <AngleChip angle={a} />
                              </span>
                            ))}
                          </span>
                        </>
                      ) : (
                        <span className="strip-warn">区间越界：该条带无法完整落在首半内。</span>
                      )}
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                className="btn ghost add-strip"
                disabled={specs.length >= MAX_STRIPS}
                onClick={add}
              >
                ＋ 添加条带（{specs.length}/{MAX_STRIPS}）
              </button>
            </div>
          )}

          {problems.length > 0 && (
            <ul className="problem-list" aria-label="条带配置问题">
              {problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
