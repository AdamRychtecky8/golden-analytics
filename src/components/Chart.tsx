import { useEffect, useRef } from 'react';
import embed, { type Result } from 'vega-embed';
import type { Config, TopLevelSpec } from 'vega-lite';
import { NAVY } from '../chartRules';

// Chart chrome in the same style as the page: hairline axes, mono uppercase titles,
// no border around the plot. Structure is light so the data marks carry the weight.
const THEME: Config = {
  background: 'transparent',
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  view: { stroke: null },
  axis: {
    domainColor: '#d9d3c5',
    tickColor: '#d9d3c5',
    gridColor: '#ece6d8',
    labelColor: '#4a5470',
    labelFontSize: 11,
    // Hide labels that would touch or overlap their neighbor (e.g. "0.000 0.005" on a
    // narrow axis), keeping every other one instead.
    labelOverlap: 'greedy',
    labelSeparation: 6,
    titleColor: NAVY,
    titleFont: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    titleFontSize: 10,
    titleFontWeight: 'normal',
  },
  legend: {
    labelColor: '#4a5470',
    titleFont: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    titleFontSize: 10,
    titleFontWeight: 'normal',
  },
};

const CANVAS_ABOVE = 5000; // data points; below this SVG is fast and stays crisp

interface ChartProps {
  spec: TopLevelSpec;
  label: string; // read out by screen readers in place of the drawing
  onMarkClick?: (key: string) => void;
}

/**
 * Draws a Vega-Lite spec. React owns the <div>; Vega owns everything inside it. The
 * effect hands the spec to Vega whenever it changes and tears the old view down first.
 */
export function Chart({ spec, label, onMarkClick }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the latest click handler in a ref so a new handler doesn't force a redraw.
  const clickRef = useRef(onMarkClick);
  useEffect(() => {
    clickRef.current = onMarkClick;
  }, [onMarkClick]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let result: Result | undefined;
    let cancelled = false;
    const lineClickable = (spec.usermeta as { lineClickable?: boolean } | undefined)?.lineClickable ?? false;
    // SVG adds one page element per mark. A scatter of every row (56,350 points for the
    // Bookshop data) froze the page for seconds, so big charts are drawn on a canvas:
    // same spec, same numbers, same clicks, one element instead of thousands.
    const marks = (spec as { data?: { values?: unknown[] } }).data?.values?.length ?? 0;
    const renderer = marks > CANVAS_ABOVE ? 'canvas' : 'svg';

    embed(el, { ...spec, config: THEME }, { actions: false, renderer }).then((r) => {
      // If the spec changed while Vega was still drawing, throw this view away.
      if (cancelled) {
        r.finalize();
        return;
      }
      result = r;
      r.view.addEventListener('click', (_event, item) => {
        if (!item || !clickRef.current) return;
        if (item.mark.marktype === 'line' && !lineClickable) return;
        const key = (item.datum as { key?: unknown } | undefined)?.key;
        if (key !== undefined) clickRef.current(String(key));
      });
    });

    return () => {
      cancelled = true;
      result?.finalize(); // removes Vega's listeners and timers
    };
  }, [spec]);

  return (
    <div
      ref={containerRef}
      className="chart"
      role="img"
      aria-label={label}
      style={{ cursor: onMarkClick ? 'pointer' : undefined }}
    />
  );
}
