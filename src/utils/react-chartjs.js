/*
 * Preact Chart.js wrappers for Line and Pie charts
 */

import { useEffect, useRef } from 'preact/hooks';
import { Chart } from 'chart.js';

function createChartComponent(type) {
  const ChartComponent = ({ data, options }) => {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
      if (!canvasRef.current) return undefined;
      if (chartRef.current) {
        chartRef.current.destroy();
      }
      chartRef.current = new Chart(canvasRef.current, {
        type,
        data: data || { labels: [], datasets: [] },
        options: options || {},
      });
      return () => {
        if (chartRef.current) {
          chartRef.current.destroy();
          chartRef.current = null;
        }
      };
    }, [data, options]);

    return (
      <div className="chart-canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
    );
  };
  return ChartComponent;
}

export const Line = createChartComponent('line');
export const Pie = createChartComponent('pie');
