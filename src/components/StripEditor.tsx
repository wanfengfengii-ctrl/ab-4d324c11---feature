import {
  STRIP_MAX_COUNT,
  STRIP_MAX_LEN,
  STRIP_MIN_LEN,
  type Angle,
} from '../solver';
import { AngleChip } from './AngleChip';

/** 条带编辑草稿（起始层为 1 基层号，相对参考铺层首半） */
export interface StripDraft {
  /** 起始层号（1 基） */
  start: number;
  /** 条带长度（层数） */
  length: number;
}

const LENGTH_OPTIONS = Array.from(
  { length: STRIP_MAX_LEN - STRIP_MIN_LEN + 1 },
  (_, k) => k + STRIP_MIN_LEN,
);

interface Props {
  /** 是否启用条带约束 */
  enabled: boolean;
  /** 条带草稿（1–3 条） */
  drafts: StripDraft[];
  /** 已解析的参考铺层；解析失败时为 null（条带预览不可用） */
  sequence: Angle[] | null;
  /** 条带定义的实时校验问题（由父组件计算） */
  problems: string[];
  onToggle(enabled: boolean): void;
  onDraftsChange(drafts: StripDraft[]): void;
}

/**
 * 条带约束编辑卡：开关条带模式，并在参考铺层首半选定 1–3 条、每条 2–4 层的
 * 已预压连续铺层。任何编辑都会通过回调通知父组件撤下旧综合结果。
 */
export function StripEditor({
  enabled,
  drafts,
  sequence,
  problems,
  onToggle,
  onDraftsChange,
}: Props) {
  const half = sequence ? Math.floor(sequence.length / 2) : 0;

  const update = (i: number, patch: Partial<StripDraft>) => {
    onDraftsChange(drafts.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  };
  const remove = (i: number) => onDraftsChange(drafts.filter((_, k) => k !== i));
  const add = () => {
    if (drafts.length >= STRIP_MAX_COUNT) return;
    // 默认接在上一条之后，尽量避免初始即重叠
    const last = drafts[drafts.length - 1];
    const start = Math.min(last ? last.start + last.length : 1, Math.max(half, 1));
    onDraftsChange([...drafts, { start, length: STRIP_MIN_LEN }]);
  };

  return (
    <section className="card" aria-label="条带约束">
      <div className="card-head">
        <h2>② 条带约束（返工保留）</h2>
        <label className="strip-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          启用条带约束
        </label>
      </div>

      {!enabled ? (
        <p className="hint">
          未启用：综合结果与不设条带时完全一致。启用后，可在参考铺层首半选定 1–{STRIP_MAX_COUNT}{' '}
          条、每条 {STRIP_MIN_LEN}–{STRIP_MAX_LEN}{' '}
          层的已预压连续铺层；每条条带的角度序列将完整连续地保留在修复结果首半中，
          各条带落位互不重叠，落位位置与两级目标在同一全局搜索中同时裁决。
        </p>
      ) : (
        <>
          {sequence === null || half < 1 ? (
            <p className="hint">参考铺层尚未成功解析，条带内容预览不可用；请先修正输入。</p>
          ) : (
            <div className="strip-rows">
              {drafts.map((d, i) => {
                const preview = sequence.slice(d.start - 1, d.start - 1 + d.length);
                const inRange =
                  d.start >= 1 && d.start - 1 + d.length <= half && preview.length === d.length;
                return (
                  <div className="strip-row" key={i}>
                    <span className="strip-label">条带 {i + 1}</span>
                    <label>
                      起始层
                      <select
                        aria-label={`条带 ${i + 1} 起始层`}
                        value={d.start}
                        onChange={(e) => update(i, { start: Number(e.target.value) })}
                      >
                        {Array.from({ length: half }, (_, k) => (
                          <option key={k + 1} value={k + 1}>
                            第 {k + 1} 层
                          </option>
                        ))}
                        {(d.start < 1 || d.start > half) && (
                          <option value={d.start}>第 {d.start} 层（越界）</option>
                        )}
                      </select>
                    </label>
                    <label>
                      长度
                      <select
                        aria-label={`条带 ${i + 1} 长度`}
                        value={d.length}
                        onChange={(e) => update(i, { length: Number(e.target.value) })}
                      >
                        {LENGTH_OPTIONS.map((l) => (
                          <option key={l} value={l}>
                            {l} 层
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="strip-preview" aria-label={`条带 ${i + 1} 角度预览`}>
                      {inRange ? preview.map((a, k) => <AngleChip key={k} angle={a} />) : '—'}
                    </span>
                    <button
                      type="button"
                      className="chip-del"
                      title={`删除条带 ${i + 1}`}
                      disabled={drafts.length <= 1}
                      onClick={() => remove(i)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="btn ghost add-strip"
                disabled={drafts.length >= STRIP_MAX_COUNT}
                onClick={add}
              >
                ＋ 添加条带（{drafts.length}/{STRIP_MAX_COUNT}）
              </button>
            </div>
          )}

          {problems.length > 0 && (
            <ul className="problem-list" aria-label="条带定义问题">
              {problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}

          <p className="hint">
            条带取自参考铺层首半（第 1–{half} 层），区间彼此不得重叠；启动综合后，
            求解器在同一全局搜索中裁决条带落位与两级目标，而不是先生成原修复方案再筛选。
          </p>
        </>
      )}
    </section>
  );
}
