import { motion } from 'framer-motion';

interface BarChartProps {
  type: 'bar';
  data: { label: string; value: number }[];
  highlightLast?: boolean;
  color?: string;
}

interface LineChartProps {
  type: 'line';
  data: { label: string; value: number }[];
  color?: string;
}

type MiniChartProps = BarChartProps | LineChartProps;

const W = 280;
const H = 88;
const PAD = { top: 4, bottom: 20, left: 10, right: 10 };

export function MiniChart(props: MiniChartProps) {
  const { type, data, color = 'hsl(var(--primary))' } = props;
  const values = data.map(d => d.value);
  const min = Math.min(...values) * 0.85;
  const max = Math.max(...values) * 1.05;

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const normalize = (v: number) => chartH - ((v - min) / (max - min)) * chartH;

  if (type === 'bar') {
    const barGap = 3;
    const barW = (chartW - barGap * (data.length - 1)) / data.length;
    const highlightLast = (props as BarChartProps).highlightLast ?? true;

    return (
      <motion.svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto mt-4 max-w-[280px]"
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        {data.map((d, i) => {
          const x = PAD.left + i * (barW + barGap);
          const barH = normalize(min) - normalize(d.value);
          const y = PAD.top + normalize(d.value);
          const isLast = i === data.length - 1;
          const opacity = highlightLast ? (isLast ? 1 : 0.35) : 1;

          return (
            <g key={d.label}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(barH, 1)}
                rx={2}
                fill={color}
                opacity={opacity}
              />
              <text
                x={x + barW / 2}
                y={H - 3}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="8"
                fontFamily="var(--font-sans)"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </motion.svg>
    );
  }

  // Line chart
  const stepX = chartW / (data.length - 1);
  const points = data.map((d, i) => ({
    x: PAD.left + i * stepX,
    y: PAD.top + normalize(d.value),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${PAD.top + chartH} L ${points[0].x} ${PAD.top + chartH} Z`;
  const lastPoint = points[points.length - 1];

  return (
    <motion.svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto mt-4 max-w-[280px]"
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <defs>
        <linearGradient id={`gradient-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={areaPath}
        fill={`url(#gradient-${color.replace(/[^a-z0-9]/gi, '')})`}
      />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastPoint.x} cy={lastPoint.y} r="3.5" fill={color} />
      <circle cx={lastPoint.x} cy={lastPoint.y} r="6" fill={color} opacity="0.2" />
      {data.map((d, i) => (
        <text
          key={d.label}
          x={points[i].x}
          y={H - 3}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize="8"
          fontFamily="var(--font-sans)"
        >
          {d.label}
        </text>
      ))}
    </motion.svg>
  );
}
