const RADIAN = Math.PI / 180;
const EXT_LEN = 50;
const MIN_SPACING = 40;
const MAX_LABEL_CHARS = 14;

interface SliceData {
  cx: number;
  cy: number;
  midAngle: number;
  outerRadius: number;
  name: string;
  value: number;
  percent: number;
  color: string;
}

interface LabelItem {
  name: string;
  value: number;
  color: string;
  percent: number;
  cx: number;
  cy: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  isRight: boolean;
  naturalY: number;
  finalY: number;
}

interface OuterLabelsLayerProps {
  sliceData: SliceData[];
  techData: Array<{ name: string; value: number; color: string; _total: number }>;
  width: number;
  height: number;
}

function resolveCollisions(group: LabelItem[], minY: number, maxY: number) {
  group.sort((a, b) => a.naturalY - b.naturalY);
  for (const item of group) {
    item.finalY = Math.max(minY, Math.min(maxY, item.naturalY));
  }

  for (let iter = 0; iter < 10; iter++) {
    let moved = false;
    for (let i = 1; i < group.length; i++) {
      if (group[i].finalY - group[i - 1].finalY < MIN_SPACING) {
        group[i].finalY = group[i - 1].finalY + MIN_SPACING;
        moved = true;
      }
    }
    if (!moved) break;
  }

  if (group.length) {
    if (group[0].finalY < minY) {
      const shift = minY - group[0].finalY;
      for (const item of group) item.finalY += shift;
    }
    if (group[group.length - 1].finalY > maxY) {
      const shift = group[group.length - 1].finalY - maxY;
      for (const item of group) item.finalY -= shift;
    }
  }
}

export function OuterLabelsLayer({ sliceData, techData, width, height }: OuterLabelsLayerProps) {
  if (!sliceData?.length || !techData.length || !width || !height) return null;

  const total = techData.reduce((s, d) => s + d.value, 0) || 1;

  const allItems: LabelItem[] = sliceData
    .filter(s => s && s.cx && s.cy)
    .map((slice, i) => {
      const { cx, cy, midAngle, outerRadius } = slice;
      const td = techData[i];
      const color = td?.color || slice.color;
      const name = td?.name || slice.name;
      const value = td?.value ?? slice.value;

      const startX = cx + outerRadius * Math.cos(-midAngle * RADIAN);
      const startY = cy + outerRadius * Math.sin(-midAngle * RADIAN);
      const endX = cx + (outerRadius + EXT_LEN) * Math.cos(-midAngle * RADIAN);
      const endY = cy + (outerRadius + EXT_LEN) * Math.sin(-midAngle * RADIAN);

      return {
        name, value, color,
        percent: value / total,
        cx, cy,
        startX, startY, endX, endY,
        isRight: endX >= cx,
        naturalY: endY,
        finalY: endY,
      };
    });

  if (!allItems.length) return null;

  const minY = 16;
  const maxY = height - 16;

  const rightGroup = allItems.filter(i => i.isRight);
  const leftGroup = allItems.filter(i => !i.isRight);

  resolveCollisions(rightGroup, minY, maxY);
  resolveCollisions(leftGroup, minY, maxY);

  function renderItem(item: LabelItem, i: number) {
    const { startX, startY, endX, isRight, color, finalY } = item;
    const textAnchor = isRight ? 'start' : 'end';
    const textX = isRight ? endX + 8 : endX - 8;
    const pct = (item.percent * 100).toFixed(0);
    const displayName = item.name.length > MAX_LABEL_CHARS
      ? item.name.slice(0, MAX_LABEL_CHARS) + '…'
      : item.name;

    return (
      <g key={`label-${isRight ? 'r' : 'l'}-${i}`}>
        <line
          x1={startX} y1={startY}
          x2={endX} y2={finalY}
          stroke={color}
          strokeWidth={1.2}
          strokeOpacity={0.7}
        />
        <circle cx={endX} cy={finalY} r={3} fill={color} />
        <text
          x={textX} y={finalY - 6}
          textAnchor={textAnchor}
          dominantBaseline="central"
          fontSize={11}
          fontWeight={600}
          fill="hsl(var(--foreground))"
        >
          {displayName}
        </text>
        <text
          x={textX} y={finalY + 8}
          textAnchor={textAnchor}
          dominantBaseline="central"
          fontSize={10}
          fill="hsl(var(--muted-foreground))"
        >
          {item.value} ({pct}%)
        </text>
      </g>
    );
  }

  return (
    <g className="outer-labels-layer">
      {rightGroup.map((item, i) => renderItem(item, i))}
      {leftGroup.map((item, i) => renderItem(item, i))}
    </g>
  );
}
