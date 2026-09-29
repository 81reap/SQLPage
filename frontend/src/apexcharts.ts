import type { ApexOptions } from "apexcharts";
import ApexCharts from "apexcharts";
import {
  align_series_for,
  type ChartSeries,
  type Series,
  xaxis_type_for,
} from "./chart_series.ts";
import { add_init_fn } from "./init.ts";

const sqlpage_chart = (() => {
  function sqlpage_chart() {
    const charts = document.querySelectorAll<HTMLElement>(
      "[data-pre-init=chart]",
    );
    for (const c of charts) {
      try {
        build_sqlpage_chart(c);
      } catch (e) {
        console.error(e);
      }
    }
  }

  const tblrColors = [
    ["blue", "#1c7ed6", "#339af0"],
    ["red", "#f03e3e", "#ff6b6b"],
    ["green", "#37b24d", "#51cf66"],
    ["pink", "#d6336c", "#f06595"],
    ["purple", "#ae3ec9", "#cc5de8"],
    ["orange", "#f76707", "#ff922b"],
    ["cyan", "#1098ad", "#22b8cf"],
    ["teal", "#0ca678", "#20c997"],
    ["yellow", "#f59f00", "#fcc419"],
    ["indigo", "#4263eb", "#5c7cfa"],
    ["lime", "#74b816", "#94d82d"],
    ["azure", "#339af0", "#339af0"],
    ["gray", "#495057", "#adb5bd"],
    ["black", "#000000", "#000000"],
    ["white", "#ffffff", "#f8f9fa"],
  ];
  const colorNames = new Map(
    tblrColors.flatMap(([name, dark, light]): [string, string][] => [
      [name, dark],
      [`${name}-lt`, light],
    ]),
  );
  const isDarkTheme = document.body?.dataset?.bsTheme === "dark";

  const STACKABLE_CHART_TYPES = ["line", "area", "bar"];
  const STROKE_WIDTHS = new Map([
    ["area", 3],
    ["line", 2],
  ]);
  const APEXCHARTS_TYPE_ALIASES = new Map([["column", "bar"]]);

  const referenceColor = colorNames.get(isDarkTheme ? "gray-lt" : "gray");

  type ReferenceLine = Record<
    "xline" | "xline_end" | "yline" | "yline_end" | "label" | "color",
    string | number | null
  >;

  const named_color = (name: unknown): string | undefined =>
    typeof name === "string" ? colorNames.get(name) : undefined;

  const reference_color = (name: string | number | null) =>
    named_color(name) || referenceColor;

  function reference_lines(
    rows: ReferenceLine[],
    column: "x" | "y",
    axis: "x" | "y",
    to_axis_value: (value: string | number) => unknown,
  ): object[] {
    const on_axis = (value: string | number | null) => {
      if (value == null) return null;
      const placed = to_axis_value(value);
      return Number.isNaN(placed) ? null : placed;
    };
    return rows.flatMap((row) => {
      const from = on_axis(row[`${column}line`]);
      if (from == null) return [];
      const color = reference_color(row.color);
      return [
        {
          [axis]: from,
          [`${axis}2`]: on_axis(row[`${column}line_end`]),
          borderColor: color,
          fillColor: color,
          strokeDashArray: 4,
          label: {
            text: row.label,
            orientation: column === "y" ? "horizontal" : "vertical",
            borderColor: color,
            style: { background: color, color: isDarkTheme ? "#000" : "#fff" },
          },
        },
      ];
    });
  }

  function build_sqlpage_chart(c: HTMLElement) {
    const [data_element] = c.getElementsByTagName("data");
    const data = JSON.parse(data_element.textContent);
    const chartContainer = c.querySelector(".chart") as HTMLElement;
    chartContainer.innerHTML = "";
    const is_timeseries = !!data.time;
    const chart_type =
      APEXCHARTS_TYPE_ALIASES.get(data.type) || data.type || "line";
    const is_stacked =
      !!data.stacked && STACKABLE_CHART_TYPES.includes(chart_type);
    const points = data.points.filter(Array.isArray);
    const reference_rows = data.points.filter((row) => !Array.isArray(row));
    const series_map: Series = new Map();
    for (const [name, old_x, old_y, color, z] of points) {
      const point_series: ChartSeries = series_map.get(name) ?? {
        name,
        data: [],
      };
      series_map.set(name, point_series);
      let x = old_x;
      let y = old_y;
      if (is_timeseries) {
        if (typeof x === "number") x = new Date(x * 1000);
        else if (chart_type === "rangeBar" && Array.isArray(y))
          y = y.map((y) => new Date(y).getTime());
        else x = new Date(x);
      }
      point_series.data.push({ x, y, z, fillColor: named_color(color) });
    }
    if (data.xmin == null) data.xmin = undefined;
    if (data.xmax == null) data.xmax = undefined;
    if (data.ymin == null) data.ymin = undefined;
    if (data.ymax == null) data.ymax = undefined;

    const palette = [
      ...data.colors.map(named_color).filter((c) => c !== undefined),
      ...tblrColors.map(([_, dark, light]) => (isDarkTheme ? dark : light)),
      ...tblrColors.map(([_, dark, light]) => (isDarkTheme ? light : dark)),
    ];
    let colors = palette;

    let series = [...series_map.values()];
    const xaxis_type = xaxis_type_for(
      series,
      chart_type,
      is_timeseries,
      !!data.horizontal,
    );

    let labels: (number | string | Date)[] | undefined;
    if (chart_type === "pie") {
      labels = points.map(([name, x, _y]) => x || name);
      series = points.map(([_name, _x, y]) => Number.parseFloat(y));
      colors = points.map(
        ([, , , color], i) => named_color(color) || palette[i % palette.length],
      );
    } else if (series.length > 1)
      series = align_series_for(series, chart_type, is_stacked);

    const to_timestamp = (v) =>
      (typeof v === "number" ? new Date(v * 1000) : new Date(v)).getTime();
    const dates_are_values = is_timeseries && chart_type === "rangeBar";
    const to_value = dates_are_values ? to_timestamp : Number;
    const to_category =
      is_timeseries && !dates_are_values ? to_timestamp : (v) => v;
    const inverted =
      chart_type === "rangeBar" || (chart_type === "bar" && !!data.horizontal);
    const value_axis = inverted ? "x" : "y";
    const category_axis = inverted ? "y" : "x";
    const options = {
      annotations: {
        [`${value_axis}axis`]: reference_lines(
          reference_rows,
          "y",
          value_axis,
          to_value,
        ),
        [`${category_axis}axis`]: reference_lines(
          reference_rows,
          "x",
          category_axis,
          to_category,
        ),
      },
      chart: {
        type: chart_type,
        fontFamily: "inherit",
        background: "transparent",
        parentHeightOffset: 0,
        height: chartContainer.style.height,
        stacked: is_stacked,
        toolbar: {
          show: !!data.toolbar,
        },
        animations: {
          enabled: false,
        },
        zoom: {
          enabled: false,
        },
      },
      theme: {
        mode: isDarkTheme ? "dark" : "light",
        palette: "palette4",
      },
      legend: {
        show: data.show_legend === null || !!data.show_legend,
      },
      dataLabels: {
        enabled: !!data.labels,
        dropShadow: {
          enabled: true,
          color: "var(--tblr-primary-bg-subtle)",
        },
        formatter:
          chart_type === "rangeBar"
            ? (_val, { seriesIndex, w }) => w.config.series[seriesIndex].name
            : chart_type === "pie"
              ? (value, { seriesIndex, w }) =>
                  `${w.config.labels[seriesIndex]}: ${value.toFixed()}%`
              : (value) => value?.toLocaleString?.() || value,
      },
      fill: {
        type: chart_type === "area" ? "gradient" : "solid",
      },
      stroke: {
        width: STROKE_WIDTHS.get(chart_type) ?? 0,
        lineCap: "round",
        curve: "smooth",
      },
      xaxis: {
        tooltip: {
          enabled: false,
        },
        min: data.xmin,
        max: data.xmax,
        title: {
          text: data.xtitle || undefined,
        },
        type: xaxis_type,
        labels: {
          datetimeUTC: false,
        },
      },
      yaxis: {
        logarithmic: !!data.logarithmic,
        min: data.ymin,
        max: data.ymax,
        stepSize: data.ystep,
        tickAmount: data.yticks,
        title: {
          text: data.ytitle || undefined,
        },
      },
      zaxis: {
        title: {
          text: data.ztitle || undefined,
        },
      },
      markers: {
        size: data.marker || 0,
        strokeWidth: 0,
        hover: {
          sizeOffset: 5,
        },
      },
      tooltip: {
        fillSeriesColor: false,
        custom:
          chart_type === "bubble" || chart_type === "scatter"
            ? bubbleTooltip
            : undefined,
        y: {
          formatter: (value) => {
            if (value == null) return "";
            if (is_timeseries && chart_type === "rangeBar") {
              const d = new Date(value);
              if (d.getHours() === 0 && d.getMinutes() === 0)
                return d.toLocaleDateString();
              return d.toLocaleString();
            }
            return value.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            });
          },
        },
      },
      plotOptions: {
        bar: {
          horizontal: !!data.horizontal || chart_type === "rangeBar",
          borderRadius: 5,
        },
        bubble: { minBubbleRadius: 5 },
      },
      colors,
      series,
    };
    if (labels) (options as { labels?: unknown }).labels = labels;
    // Numeric axes count intervals; category and time axes use tickAmount as a
    // target for label density.
    if (data.xticks)
      (options.xaxis as { tickAmount?: number }).tickAmount = data.xticks;
    const chart = new ApexCharts(chartContainer, options as ApexOptions);
    chart.render().catch(console.error);
    if (window.charts) window.charts.push(chart);
    else window.charts = [chart];
    c.removeAttribute("data-pre-init");
  }

  function bubbleTooltip({ seriesIndex, dataPointIndex, w }) {
    const { name, data } = w.config.series[seriesIndex];
    const point = data[dataPointIndex];

    const tooltip = document.createElement("div");
    tooltip.className = "apexcharts-tooltip-text";
    tooltip.style.fontFamily = "inherit";

    const seriesName = document.createElement("div");
    seriesName.className = "apexcharts-tooltip-y-group";
    seriesName.style.fontWeight = "bold";
    seriesName.innerText = name;
    tooltip.appendChild(seriesName);

    for (const axis of ["x", "y", "z"]) {
      const value = point[axis];
      if (value == null) continue;
      const axisValue = document.createElement("div");
      axisValue.className = "apexcharts-tooltip-y-group";
      let axis_conf = w.config[`${axis}axis`];
      if (axis_conf.length) axis_conf = axis_conf[0];
      const title = axis_conf.title.text || axis;
      const labelSpan = document.createElement("span");
      labelSpan.className = "apexcharts-tooltip-text-y-label";
      labelSpan.innerText = `${title}: `;
      axisValue.appendChild(labelSpan);
      const valueSpan = document.createElement("span");
      valueSpan.className = "apexcharts-tooltip-text-y-value";
      valueSpan.innerText = value;
      axisValue.appendChild(valueSpan);
      tooltip.appendChild(axisValue);
    }
    return tooltip.outerHTML;
  }

  return sqlpage_chart;
})();

add_init_fn(sqlpage_chart);
