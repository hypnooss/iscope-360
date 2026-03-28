type MiniChartProps = {
  type?: "line" | "bar";
  color?: string;
  data?: { label: string; value: number }[];
  className?: string;
};

export function MiniChart({
  type = "line",
  color = "blue",
  data = [],
  className = "",
}: MiniChartProps) {
  return (
    <div className={className}>
      <p>MiniChart ({type})</p>
      <p>Color: {color}</p>
      <p>Data points: {data.length}</p>
    </div>
  );
}