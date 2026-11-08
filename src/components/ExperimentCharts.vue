<template>
  <div class="exp-panel">
    <div class="exp-toolbar">
      <div class="exp-groups">
        <button
          v-for="g in groups"
          :key="g.id"
          type="button"
          class="exp-group-btn"
          :class="{ active: activeGroup === g.id }"
          @click="switchGroup(g.id)"
        >
          {{ g.title }}
        </button>
      </div>
      <button
        type="button"
        class="live-btn"
        :class="{ on: liveOn }"
        @click="toggleLive"
      >
        <span class="live-dot"></span>
        {{ liveOn ? '实时 ON' : '实时 OFF' }}
      </button>
    </div>
    <p class="exp-desc">
      {{ currentGroup?.desc }}
      <span v-if="liveOn" class="live-tag">LIVE · 基线±扰动</span>
    </p>

    <div ref="listRef" class="exp-charts">
      <div v-if="loading" class="exp-empty">加载实验数据…</div>
      <template v-else>
        <!-- 所有图常驻 DOM，用 v-show 切换，避免反复销毁导致空白 -->
        <div
          v-for="chartId in allChartIds"
          :key="chartId"
          v-show="visibleIds.has(chartId)"
          class="exp-chart-card"
        >
          <div class="exp-chart-head">
            <span>{{ baseMap[chartId]?.title || chartId }}</span>
            <span class="exp-ylab">{{ baseMap[chartId]?.yLabel }}</span>
          </div>
          <div v-if="(baseMap[chartId]?.kind || 'line') !== 'heatmap'" class="exp-legend">
            <span v-for="name in algoNames(chartId)" :key="name" class="lg">
              <i :style="{ background: ALGO_COLORS[name] }"></i>{{ name }}
            </span>
          </div>
          <div :ref="(el) => bindEl(chartId, el)" class="exp-chart"></div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart, BarChart, HeatmapChart, RadarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  LegendComponent,
  RadarComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { algoMeansFromChapter } from '@/utils/analyticsData'

echarts.use([
  LineChart,
  BarChart,
  HeatmapChart,
  RadarChart,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  LegendComponent,
  RadarComponent,
  CanvasRenderer,
])

const ALGO_COLORS = {
  Dijkstra: '#8b9bb4',
  DQN: '#7aa2ff',
  PPO: '#ffb020',
  'PPO+DP': '#00e8ff',
  SEA: '#ff6b9d',
  能量: '#00e8ff',
  时间: '#ffb020',
  分配: '#2ee59d',
}
const ALGO_ORDER = ['Dijkstra', 'DQN', 'PPO', 'PPO+DP', 'SEA']

const groups = ref([])
const baseMap = ref({})
const liveParams = ref(null)
const activeGroup = ref('fleet')
const loading = ref(true)
const liveOn = ref(true)
const tSec = ref(0)
const listRef = ref(null)

/** @type {Record<string, HTMLElement>} */
const els = {}
/** @type {Record<string, echarts.ECharts>} */
const charts = {}
let timer = null
let t0 = 0
let resizeObs = null

const currentGroup = computed(() => groups.value.find((g) => g.id === activeGroup.value))
const allChartIds = computed(() => Object.keys(baseMap.value))
const visibleIds = computed(() => new Set(currentGroup.value?.charts || []))

function algoNames(chartId) {
  const s = baseMap.value[chartId]?.series || {}
  const known = ALGO_ORDER.filter((n) => s[n])
  if (known.length) return known
  return Object.keys(s)
}

function bindEl(id, el) {
  if (!(el instanceof HTMLElement)) {
    // 真正卸载时才销毁；v-show 不会走到这里
    return
  }
  els[id] = el
  // 若旧实例绑在别的 dom 上，先销毁再建
  const old = charts[id]
  if (old && old.getDom() !== el) {
    old.dispose()
    delete charts[id]
  }
  nextTick(() => ensureChart(id))
}

function liveValue(base, i, algo, t) {
  const p = liveParams.value?.algorithms?.[algo]
  if (!p || !Number.isFinite(base)) return base
  const step = liveParams.value.pointPhaseStep ?? 0.35
  const wave = 1 + p.amp * Math.sin(p.omega * t + p.phase + i * step)
  const noise = p.noise * Math.sin(2.3 * p.omega * t + i)
  const [lo, hi] = liveParams.value.clamp || [0, 1]
  return Math.min(hi, Math.max(lo, base * wave + noise))
}

function seriesFor(chartId, name) {
  const base = baseMap.value[chartId]?.series?.[name]
  if (!base) return []
  if (!liveOn.value || !liveParams.value) return base.slice()
  const t = tSec.value
  return base.map((v, i) => liveValue(v, i, name, t))
}

function lineOption(chartId) {
  const data = baseMap.value[chartId]
  const names = algoNames(chartId)
  return {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,12,22,0.92)',
      borderColor: 'rgba(0,232,255,0.35)',
      textStyle: { color: '#d7f7ff', fontSize: 11 },
      valueFormatter: (v) => (typeof v === 'number' ? v.toFixed(3) : v),
    },
    grid: {
      left: 42,
      right: 10,
      top: 18,
      bottom: 36,
      containLabel: false,
    },
    xAxis: {
      type: 'category',
      data: data.x.map((v) => (Number.isInteger(v) ? String(v) : Number(v).toFixed(1))),
      boundaryGap: false,
      axisLine: { lineStyle: { color: 'rgba(0,232,255,0.28)' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#8fb0c4',
        fontSize: 10,
        interval: 0,
        hideOverlap: true,
      },
      name: data.xLabel || '',
      nameLocation: 'middle',
      nameGap: 22,
      nameTextStyle: { color: '#6f8fa3', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 1,
      splitNumber: 4,
      axisLabel: { color: '#8fb0c4', fontSize: 10, formatter: (v) => v.toFixed(1) },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
      axisLine: { show: false },
    },
    series: names.map((name) => ({
      name,
      type: 'line',
      data: seriesFor(chartId, name),
      smooth: 0.2,
      showSymbol: name === 'PPO+DP',
      symbolSize: 5,
      lineStyle: {
        width: name === 'PPO+DP' ? 2.8 : 1.5,
        color: ALGO_COLORS[name],
      },
      itemStyle: { color: ALGO_COLORS[name] },
      z: name === 'PPO+DP' ? 10 : 2,
    })),
  }
}

function barOption(chartId) {
  const data = baseMap.value[chartId]
  const names = algoNames(chartId)
  return {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,12,22,0.92)',
      borderColor: 'rgba(0,232,255,0.35)',
      textStyle: { color: '#d7f7ff', fontSize: 11 },
    },
    grid: { left: 42, right: 10, top: 18, bottom: 36, containLabel: false },
    xAxis: {
      type: 'category',
      data: data.x.map((v) => String(v)),
      axisLine: { lineStyle: { color: 'rgba(0,232,255,0.28)' } },
      axisLabel: { color: '#8fb0c4', fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      ...(data.yMax === 'auto' ? {} : { max: 1 }),
      axisLabel: { color: '#8fb0c4', fontSize: 10, formatter: (v) => v.toFixed(1) },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
    },
    series: names.map((name) => ({
      name,
      type: 'bar',
      data: seriesFor(chartId, name),
      itemStyle: { color: ALGO_COLORS[name] || '#8fb0c4' },
      barMaxWidth: 10,
    })),
  }
}

function heatOption(chartId) {
  const data = baseMap.value[chartId]
  const names = algoNames(chartId)
  const xs = data.x || []
  const cells = []
  names.forEach((name, yi) => {
    const row = seriesFor(chartId, name)
    row.forEach((v, xi) => cells.push([xi, yi, Number(v) || 0]))
  })
  return {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      backgroundColor: 'rgba(4,12,22,0.92)',
      borderColor: 'rgba(0,232,255,0.35)',
      textStyle: { color: '#d7f7ff', fontSize: 11 },
      formatter: (p) => `${names[p.data[1]]} @ ${xs[p.data[0]]}<br/>${p.data[2].toFixed(3)}`,
    },
    grid: { left: 62, right: 16, top: 12, bottom: 48 },
    xAxis: {
      type: 'category',
      data: xs.map((v) => String(v)),
      axisLabel: { color: '#8fb0c4', fontSize: 10 },
      axisLine: { lineStyle: { color: 'rgba(0,232,255,0.28)' } },
    },
    yAxis: {
      type: 'category',
      data: names,
      axisLabel: { color: '#8fb0c4', fontSize: 10 },
      axisLine: { lineStyle: { color: 'rgba(0,232,255,0.28)' } },
    },
    visualMap: {
      min: 0,
      max: 1,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: ['#071018', '#12485a', '#00e8ff', '#ffb020'] },
      textStyle: { color: '#8fb0c4', fontSize: 10 },
    },
    series: [{ type: 'heatmap', data: cells, itemStyle: { borderColor: '#041018', borderWidth: 1 } }],
  }
}

function radarOption(chartId) {
  const data = baseMap.value[chartId]
  return {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      backgroundColor: 'rgba(4,12,22,0.92)',
      borderColor: 'rgba(0,232,255,0.35)',
      textStyle: { color: '#d7f7ff', fontSize: 11 },
    },
    radar: {
      indicator: data.indicators,
      splitLine: { lineStyle: { color: 'rgba(0,232,255,0.18)' } },
      splitArea: { areaStyle: { color: ['rgba(0,232,255,0.04)', 'transparent'] } },
      axisName: { color: '#8fb0c4', fontSize: 10 },
      axisLine: { lineStyle: { color: 'rgba(0,232,255,0.2)' } },
    },
    series: [
      {
        type: 'radar',
        data: (data.radar || []).map((row, i) => {
          const name = ALGO_ORDER[i]
          return {
            name,
            value: row,
            lineStyle: { color: ALGO_COLORS[name], width: name === 'PPO+DP' ? 2.4 : 1.4 },
            itemStyle: { color: ALGO_COLORS[name] },
            areaStyle: { color: name === 'PPO+DP' ? 'rgba(0,232,255,0.16)' : 'rgba(255,255,255,0.02)' },
          }
        }),
      },
    ],
  }
}

function scoreBarOption(chartId) {
  const data = baseMap.value[chartId]
  return {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,12,22,0.92)',
      borderColor: 'rgba(0,232,255,0.35)',
      textStyle: { color: '#d7f7ff', fontSize: 11 },
    },
    grid: { left: 42, right: 10, top: 18, bottom: 28 },
    xAxis: {
      type: 'category',
      data: data.x,
      axisLine: { lineStyle: { color: 'rgba(0,232,255,0.28)' } },
      axisLabel: { color: '#8fb0c4', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 1,
      axisLabel: { color: '#8fb0c4', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
    },
    series: [
      {
        type: 'bar',
        data: data.values.map((v, i) => ({
          value: v,
          itemStyle: { color: ALGO_COLORS[data.x[i]] },
        })),
        barWidth: '42%',
      },
    ],
  }
}

function buildOption(chartId) {
  const data = baseMap.value[chartId]
  if (!data) return {}
  const kind = data.kind || 'line'
  if (kind === 'bar') return barOption(chartId)
  if (kind === 'heatmap') return heatOption(chartId)
  if (kind === 'radar') return radarOption(chartId)
  if (kind === 'scoreBar') return scoreBarOption(chartId)
  return lineOption(chartId)
}

function ensureChart(id) {
  const el = els[id]
  if (!el || !baseMap.value[id]) return null
  // 宽高为 0 时延后（例如父级 v-show 隐藏）
  if (el.clientWidth < 8 || el.clientHeight < 8) return null

  let inst = charts[id]
  if (!inst || inst.isDisposed?.()) {
    const existed = echarts.getInstanceByDom(el)
    if (existed) existed.dispose()
    inst = echarts.init(el, null, { renderer: 'canvas', width: 'auto', height: 'auto' })
    charts[id] = inst
  } else if (inst.getDom() !== el) {
    inst.dispose()
    inst = echarts.init(el, null, { renderer: 'canvas' })
    charts[id] = inst
  }
  inst.setOption(buildOption(id), true)
  inst.resize()
  return inst
}

function refreshVisible(forceResize = false) {
  const ids = [...visibleIds.value]
  for (const id of ids) {
    const inst = ensureChart(id)
    if (forceResize) inst?.resize()
  }
}

function updateLiveSeriesOnly() {
  for (const id of visibleIds.value) {
    const inst = charts[id]
    if (!inst || inst.isDisposed?.()) {
      ensureChart(id)
      continue
    }
    const data = baseMap.value[id]
    if (!data) continue
    const kind = data.kind || 'line'
    if (kind === 'radar' || kind === 'scoreBar') continue
    inst.setOption(buildOption(id), false)
  }
}

function tickLive() {
  if (!liveOn.value) return
  tSec.value = (performance.now() - t0) / 1000
  updateLiveSeriesOnly()
}

function startTimer() {
  stopTimer()
  if (!liveOn.value) return
  const ms = liveParams.value?.updateIntervalMs || 1000
  timer = window.setInterval(tickLive, ms)
  tickLive()
}

function stopTimer() {
  if (timer != null) {
    clearInterval(timer)
    timer = null
  }
}

function switchGroup(id) {
  if (activeGroup.value === id) return
  activeGroup.value = id
}

function toggleLive() {
  liveOn.value = !liveOn.value
  if (liveOn.value) {
    t0 = performance.now() - tSec.value * 1000
    startTimer()
  } else {
    stopTimer()
    refreshVisible()
  }
}

function onResize() {
  for (const id of visibleIds.value) {
    charts[id]?.resize()
  }
}

/** 供父组件在 Tab 显示时调用 */
function reveal() {
  nextTick(() => {
    refreshVisible(true)
    onResize()
  })
}

function disposeAll() {
  stopTimer()
  resizeObs?.disconnect()
  resizeObs = null
  for (const id of Object.keys(charts)) {
    try {
      charts[id]?.dispose()
    } catch {
      /* ignore */
    }
    delete charts[id]
  }
}

async function loadData() {
  loading.value = true
  try {
    const [index, params] = await Promise.all([
      fetch('/cl_data/chapter2/index.json').then((r) => r.json()),
      fetch('/cl_data/chapter2/live_params.json').then((r) => r.json()),
    ])
    liveParams.value = params
    groups.value = index.groups || []
    if (groups.value.length) activeGroup.value = groups.value[0].id

    const entries = await Promise.all(
      (index.charts || []).map(async (c) => {
        const data = await fetch(`/cl_data/chapter2/${c.file}`).then((r) => r.json())
        return [c.id, data]
      }),
    )
    const map = Object.fromEntries(entries)
    const means = algoMeansFromChapter(map)
    map.algo_radar = {
      kind: 'radar',
      title: '算法七维雷达',
      yLabel: '均值',
      series: Object.fromEntries(ALGO_ORDER.map((n) => [n, [1]])),
      indicators: means.indicators,
      radar: means.radar,
    }
    map.algo_score = {
      kind: 'scoreBar',
      title: '算法综合得分',
      yLabel: '七表均值',
      x: ALGO_ORDER,
      values: means.bar.map((b) => Number(b.value.toFixed(3))),
      series: Object.fromEntries(ALGO_ORDER.map((n) => [n, [1]])),
    }
    for (const src of ['fleet_energy', 'fleet_time', 'fleet_alloc']) {
      if (!map[src]) continue
      map[`${src}_heat`] = {
        ...map[src],
        kind: 'heatmap',
        title: `${map[src].title} · 热力`,
      }
      map[`${src}_bar`] = {
        ...map[src],
        kind: 'bar',
        title: `${map[src].title} · 柱状`,
      }
    }
    map.delta_ppodp = {
      kind: 'bar',
      title: 'PPO+DP 相对 Dijkstra 增益',
      xLabel: '实验点',
      yLabel: '差值',
      yMax: 'auto',
      x: map.fleet_energy?.x || [],
      series: {
        能量: (map.fleet_energy?.series?.['PPO+DP'] || []).map(
          (v, i) => v - (map.fleet_energy?.series?.Dijkstra?.[i] || 0),
        ),
        时间: (map.fleet_time?.series?.['PPO+DP'] || []).map(
          (v, i) => v - (map.fleet_time?.series?.Dijkstra?.[i] || 0),
        ),
        分配: (map.fleet_alloc?.series?.['PPO+DP'] || []).map(
          (v, i) => v - (map.fleet_alloc?.series?.Dijkstra?.[i] || 0),
        ),
      },
    }
    baseMap.value = map
    groups.value = [
      ...(index.groups || []),
      {
        id: 'compare',
        title: '算法综合对比',
        desc: '由表4–10 七组曲线取均值：雷达 + 综合得分',
        charts: ['algo_radar', 'algo_score'],
      },
      {
        id: 'heatmap',
        title: '实验热力 / 柱状',
        desc: '同一批论文表改用热力图与分组柱状，便于看规模效应',
        charts: [
          'fleet_energy_heat',
          'fleet_time_heat',
          'fleet_alloc_heat',
          'fleet_energy_bar',
          'fleet_time_bar',
        ],
      },
      {
        id: 'gain',
        title: 'PPO+DP 增益',
        desc: '相对 Dijkstra 的能量/时间/分配率差值',
        charts: ['delta_ppodp'],
      },
    ]
    t0 = performance.now()
    await nextTick()
    refreshVisible(true)
    startTimer()
  } catch (e) {
    console.error('加载实验图表失败', e)
  } finally {
    loading.value = false
    await nextTick()
    refreshVisible(true)
  }
}

watch(activeGroup, async () => {
  await nextTick()
  refreshVisible(true)
})

onMounted(() => {
  loadData()
  window.addEventListener('resize', onResize)
  // 监听面板尺寸变化（右侧 Tab 显示/隐藏）
  resizeObs = new ResizeObserver(() => onResize())
  nextTick(() => {
    if (listRef.value) resizeObs.observe(listRef.value)
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  disposeAll()
})

defineExpose({ reveal, resize: onResize })
</script>

<style scoped>
.exp-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  height: 100%;
}

.exp-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px 0;
}

.exp-groups {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
}

.exp-group-btn {
  border: 1px solid rgba(0, 232, 255, 0.22);
  background: rgba(0, 20, 32, 0.55);
  color: #8fb0c4;
  font-family: 'Rajdhani', 'Segoe UI', sans-serif;
  font-size: 12px;
  letter-spacing: 0.06em;
  padding: 5px 10px;
  cursor: pointer;
  transition: 0.2s ease;
}

.exp-group-btn:hover,
.exp-group-btn.active {
  color: #00e8ff;
  border-color: rgba(0, 232, 255, 0.55);
  box-shadow: 0 0 12px rgba(0, 232, 255, 0.18);
}

.live-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(46, 229, 157, 0.35);
  background: rgba(0, 30, 24, 0.55);
  color: #6f8fa3;
  font-family: 'Orbitron', 'Segoe UI', sans-serif;
  font-size: 10px;
  letter-spacing: 0.08em;
  padding: 6px 10px;
  cursor: pointer;
}

.live-btn.on {
  color: #2ee59d;
  border-color: rgba(46, 229, 157, 0.65);
  box-shadow: 0 0 12px rgba(46, 229, 157, 0.2);
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #556;
}

.live-btn.on .live-dot {
  background: #2ee59d;
  box-shadow: 0 0 8px #2ee59d;
  animation: blink 1.2s ease-in-out infinite;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.exp-desc {
  margin: 8px 12px 4px;
  font-size: 11px;
  color: #6f8fa3;
  letter-spacing: 0.08em;
}

.live-tag {
  margin-left: 8px;
  color: #2ee59d;
  font-family: 'Orbitron', sans-serif;
  font-size: 10px;
}

.exp-charts {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.exp-chart-card {
  border: 1px solid rgba(0, 232, 255, 0.14);
  background: rgba(0, 12, 22, 0.45);
  padding: 10px 8px 8px;
  flex-shrink: 0;
}

.exp-chart-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: #d7f7ff;
  padding: 0 2px 6px;
}

.exp-ylab {
  color: #6f8fa3;
  font-size: 10px;
}

.exp-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
  padding: 0 2px 8px;
  font-size: 10px;
  color: #8fb0c4;
}

.exp-legend .lg {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.exp-legend i {
  width: 8px;
  height: 8px;
  display: inline-block;
  border-radius: 1px;
}

.exp-chart {
  width: 100%;
  height: 220px;
}

.exp-empty {
  padding: 28px 12px;
  text-align: center;
  color: #6f8fa3;
  letter-spacing: 0.1em;
  font-size: 12px;
}
</style>
