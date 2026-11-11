<script lang="ts">
  import type { ChartData } from "../demo/types";

  interface Props {
    data: ChartData;
  }

  let { data }: Props = $props();
  let canvas: HTMLCanvasElement | undefined = $state();

  // A fixed series order, so "High" is the same colour on every chart.
  const PALETTE = ["#60a5fa", "#f59e0b", "#34d399", "#f472b6", "#a78bfa", "#f87171"];

  $effect(() => {
    if (!canvas) return;
    const snapshot = $state.snapshot(data) as ChartData;
    let chart: { destroy(): void } | undefined;
    let cancelled = false;

    // Chart.js is only fetched when a chart is actually on the page.
    import("chart.js/auto").then(({ default: Chart }) => {
      if (cancelled || !canvas) return;
      const round = snapshot.chartType === "pie" || snapshot.chartType === "doughnut";
      const muted = getComputedStyle(canvas).getPropertyValue("--color-fg-muted").trim() || "#94a3b8";
      const grid = getComputedStyle(canvas).getPropertyValue("--color-surface-2").trim() || "#334155";
      chart = new Chart(canvas, {
        type: snapshot.chartType,
        data: {
          labels: snapshot.labels,
          datasets: snapshot.datasets.map((d, i) => ({
            label: d.label,
            data: d.data,
            borderColor: round ? "transparent" : PALETTE[i % PALETTE.length],
            backgroundColor: round ? PALETTE : PALETTE[i % PALETTE.length] + (snapshot.chartType === "line" ? "33" : "cc"),
            borderWidth: 2,
            pointRadius: snapshot.labels.length > 20 ? 0 : 3,
            tension: 0.25,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: round || snapshot.datasets.length > 1, labels: { color: muted, boxWidth: 12 } },
            tooltip: {
              callbacks: {
                label: (ctx) =>
                  `${ctx.dataset.label ? ctx.dataset.label + ": " : ""}${ctx.formattedValue}${snapshot.unit ? " " + snapshot.unit : ""}`,
              },
            },
          },
          scales: round
            ? {}
            : {
                x: { ticks: { color: muted, maxTicksLimit: 10 }, grid: { display: false } },
                y: {
                  ticks: { color: muted, callback: (v) => `${v}${snapshot.unit ? " " + snapshot.unit : ""}` },
                  grid: { color: grid },
                },
              },
        },
      });
    });

    return () => {
      cancelled = true;
      chart?.destroy();
    };
  });
</script>

<sl-card class="gen-figure">
  {#if data.title}
    <div slot="header" data-role="card-title" class="gx-type-heading-02">{data.title}</div>
  {/if}
  <div class="chart-box">
    <canvas bind:this={canvas} aria-label={data.title ?? "Chart"} role="img"></canvas>
  </div>
</sl-card>

<style>
  .chart-box {
    position: relative;
    height: 16rem;
  }
</style>
