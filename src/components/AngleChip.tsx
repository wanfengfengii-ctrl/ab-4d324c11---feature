import { formatAngle, type Angle } from '../solver';

const CHIP_CLASS: Record<Angle, string> = {
  [0]: 'chip a0',
  [45]: 'chip a45',
  [-45]: 'chip am45',
  [90]: 'chip a90',
};

export function AngleChip({ angle, dimmed }: { angle: Angle; dimmed?: boolean }) {
  return (
    <span className={`${CHIP_CLASS[angle]}${dimmed ? ' dimmed' : ''}`}>{formatAngle(angle)}</span>
  );
}
