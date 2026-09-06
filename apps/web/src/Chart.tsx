import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { Point } from "./types";
echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);
export function Chart({
  points,
  metric,
}: {
  points: Point[];
  metric: "exposure_index" | "apr_best_rank" | "apr_listing_count";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      animation: false,
      grid: { left: 44, right: 24, top: 20, bottom: 40 },
      tooltip: { trigger: "axis", renderMode: "richText" },
      xAxis: {
        type: "category",
        data: points.map((p) => p.day),
        boundaryGap: false,
        axisLabel: { color: "#62718a" },
      },
      yAxis: {
        type: "value",
        inverse: metric === "apr_best_rank",
        min: metric === "apr_best_rank" ? 1 : 0,
        max: metric === "apr_best_rank" ? 100 : undefined,
        splitLine: { lineStyle: { color: "#e7edf5" } },
      },
      series: [
        {
          name:
            metric === "exposure_index"
              ? "순위 기반 노출지수"
              : metric === "apr_best_rank"
                ? "최고 순위"
                : "APR ASIN 수",
          type: "line",
          data: points.map((p) => p[metric]),
          connectNulls: false,
          symbol: "circle",
          symbolSize: 5,
          lineStyle: { width: 2, color: "#2254df" },
          itemStyle: { color: "#2254df" },
        },
      ],
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [points, metric]);
  return (
    <div
      ref={ref}
      className="chart"
      role="img"
      aria-label="Amazon 시계열. 결측 구간은 연결하지 않습니다."
    />
  );
}
