<template>
  <div class="mini-wrap">
    <div class="hero">
      <div ref="gaugeEl" class="gauge"></div>
      <div class="hero-stats">
        <div class="hero-stat cyan">
          <span>均电量</span>
          <b>{{ avgEnergy.toFixed(1) }}</b>
          <small>kWh</small>
        </div>
        <div class="hero-stat amber">
          <span>均剩余</span>
          <b>{{ avgTime.toFixed(2) }}</b>
          <small>hours</small>
        </div>
      </div>
    </div>
    <div class="mini-card">
      <div class="mini-h">
        <span>在途电量</span>
        <em>kWh</em>
      </div>
      <div ref="barEl" class="mini-chart"></div>
    </div>
    <div class="mini-card">
      <div class="mini-h">
        <span>剩余时间</span>
        <em>h</em>
      </div>
      <div ref="lineEl" class="mini-chart line"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { PieChart, BarChart, LineChart, GaugeChart } from 'echarts/charts'
import { TooltipComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([PieChart, BarChart, LineChart, GaugeChart, TooltipComponent, GridComponent, CanvasRenderer])

const props = defineProps({
  cards: { type: Array, default: () => [] },
  completed: { type: Number, default: 0 },
  running: { type: Number, default: 0 },
  completeRate: { type: Number, default: 0 },
  avgEnergy: { type: Number, default: 0 },
  avgTime: { type: Number, default: 0 },
})

const gaugeEl = ref(null)
const barEl = ref(null)
const lineEl = ref(null)
let gauge
let bar
let line
let ro

const tip = {
  backgroundColor: 'rgba(4,12,22,0.92)',
  borderColor: 'rgba(0,232,255,0.55)',
  textStyle: { color: '#d7f7ff', fontSize: 11 },
}

function axisCommon() {
  return {
    axisLine: { lineStyle: { color: 'rgba(0,232,255,0.35)' } },
    axisLabel: { color: '#9fd4e8', fontSize: 10 },
    splitLine: { lineStyle: { color: 'rgba(0,232,255,0.08)' } },
  }
}

function render() {
  const cards = props.cards || []
  const ids = cards.map((c) => `V${c.id}`)
  const energies = cards.map((c) => Number(c.liveEnergy) || 0)
  const times = cards.map((c) => Number(c.liveTime) || 0)
  const colors = cards.map((c) => c.color || '#00e8ff')
  const rate = Number(props.completeRate) || 0

  gauge?.setOption({
    backgroundColor: 'transparent',
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        radius: '100%',
        center: ['50%', '58%'],
        pointer: { show: false },
        progress: {
          show: true,
          width: 12,
          roundCap: true,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#00e8ff' },
              { offset: 1, color: '#2ee59d' },
            ]),
            shadowBlur: 18,
            shadowColor: '#00e8ff',
          },
        },
        axisLine: {
          roundCap: true,
          lineStyle: { width: 12, color: [[1, 'rgba(0,232,255,0.12)']] },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        title: {
          show: true,
          offsetCenter: [0, '62%'],
          color: '#8fb0c4',
          fontSize: 11,
          fontFamily: 'Rajdhani',
        },
        detail: {
          valueAnimation: true,
          fontSize: 28,
          fontFamily: 'Orbitron',
          color: '#d7f7ff',
          offsetCenter: [0, '8%'],
          formatter: '{value}%',
          textShadowColor: '#00e8ff',
          textShadowBlur: 12,
        },
        data: [{ value: rate, name: '任务完成' }],
      },
    ],
  })

  bar?.setOption({
    backgroundColor: 'transparent',
    tooltip: { ...tip, trigger: 'axis' },
    grid: { left: 6, right: 8, top: 10, bottom: 20, containLabel: true },
    xAxis: { type: 'category', data: ids, ...axisCommon(), axisTick: { show: false } },
    yAxis: { type: 'value', min: 0, max: 100, ...axisCommon(), splitNumber: 2 },
    series: [
      {
        type: 'bar',
        data: energies.map((v, i) => ({
          value: Number(v.toFixed(1)),
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 1, 0, 0, [
              { offset: 0, color: 'rgba(0,40,60,0.2)' },
              { offset: 1, color: colors[i] },
            ]),
            shadowBlur: 12,
            shadowColor: colors[i],
          },
        })),
        barWidth: 14,
        showBackground: true,
        backgroundStyle: { color: 'rgba(0,232,255,0.06)' },
      },
    ],
  })

  line?.setOption({
    backgroundColor: 'transparent',
    tooltip: { ...tip, trigger: 'axis' },
    grid: { left: 6, right: 8, top: 12, bottom: 20, containLabel: true },
    xAxis: { type: 'category', data: ids, ...axisCommon(), axisTick: { show: false } },
    yAxis: { type: 'value', ...axisCommon(), splitNumber: 2 },
    series: [
      {
        type: 'line',
        data: times.map((v) => Number(v.toFixed(2))),
        smooth: 0.35,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { color: '#ffb020', width: 2.4, shadowBlur: 12, shadowColor: '#ffb020' },
        itemStyle: { color: '#ffd27a', borderColor: '#ffb020', borderWidth: 2, shadowBlur: 10, shadowColor: '#ffb020' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255,176,32,0.45)' },
            { offset: 1, color: 'rgba(255,176,32,0.02)' },
          ]),
        },
      },
    ],
  })
}

function init() {
  if (gaugeEl.value && !gauge) gauge = echarts.init(gaugeEl.value)
  if (barEl.value && !bar) bar = echarts.init(barEl.value)
  if (lineEl.value && !line) line = echarts.init(lineEl.value)
  render()
}

watch(
  () =>
    props.cards.map((c) => `${c.id}:${c.liveEnergy}:${c.liveTime}:${c.progress}`).join('|') +
    `|${props.completed}|${props.running}|${props.completeRate}|${props.avgEnergy}|${props.avgTime}`,
  () => render(),
)

onMounted(async () => {
  await nextTick()
  init()
  ro = new ResizeObserver(() => {
    gauge?.resize()
    bar?.resize()
    line?.resize()
  })
  if (gaugeEl.value) ro.observe(gaugeEl.value)
  if (barEl.value) ro.observe(barEl.value)
  if (lineEl.value) ro.observe(lineEl.value)
})

onUnmounted(() => {
  ro?.disconnect()
  gauge?.dispose()
  bar?.dispose()
  line?.dispose()
})
</script>

<style scoped>
.mini-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px 0;
}

.hero {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 8px;
  border: 1px solid rgba(0, 232, 255, 0.28);
  background:
    radial-gradient(120px 80px at 30% 40%, rgba(0, 232, 255, 0.16), transparent 70%),
    linear-gradient(180deg, rgba(0, 40, 58, 0.55), rgba(0, 10, 18, 0.7));
  box-shadow: 0 0 20px rgba(0, 232, 255, 0.16);
  padding: 4px 6px 6px;
}

.gauge {
  width: 100%;
  height: 148px;
}

.hero-stats {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding-right: 6px;
}

.hero-stat {
  padding: 8px 10px;
  border: 1px solid rgba(0, 232, 255, 0.22);
  background: rgba(0, 8, 16, 0.45);
}

.hero-stat span {
  display: block;
  font-size: 10px;
  letter-spacing: 0.14em;
  color: #8fb0c4;
}

.hero-stat b {
  display: block;
  font-family: 'Orbitron', sans-serif;
  font-size: 22px;
  line-height: 1.1;
  margin-top: 2px;
}

.hero-stat small {
  color: #6f8fa3;
  letter-spacing: 0.08em;
}

.hero-stat.cyan {
  box-shadow: 0 0 14px rgba(0, 232, 255, 0.18);
}

.hero-stat.cyan b {
  color: #00e8ff;
  text-shadow: 0 0 10px rgba(0, 232, 255, 0.7);
}

.hero-stat.amber {
  border-color: rgba(255, 176, 32, 0.4);
  box-shadow: 0 0 14px rgba(255, 176, 32, 0.16);
}

.hero-stat.amber b {
  color: #ffb020;
  text-shadow: 0 0 10px rgba(255, 176, 32, 0.65);
}

.mini-card {
  border: 1px solid rgba(0, 232, 255, 0.22);
  background: linear-gradient(180deg, rgba(0, 32, 48, 0.4), rgba(0, 12, 22, 0.55));
  box-shadow: 0 0 14px rgba(0, 232, 255, 0.08);
  padding: 6px 6px 2px;
}

.mini-h {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: #cfefff;
  padding: 0 4px 2px;
}

.mini-h em {
  font-style: normal;
  color: #6f8fa3;
  font-size: 10px;
}

.mini-chart {
  width: 100%;
  height: 108px;
}

.mini-chart.line {
  height: 100px;
}
</style>
