<template>
  <div class="dash" ref="rootRef">
    <div v-if="loading" class="dash-empty">加载 200 辆车队与实验表…</div>
    <template v-else>
      <div class="kpi-row">
        <div class="kpi" v-for="item in kpis" :key="item.k">
          <span class="k">{{ item.k }}</span>
          <strong class="v">{{ item.v }}</strong>
          <span class="s">{{ item.s }}</span>
        </div>
      </div>

      <div class="chart-grid">
        <div class="card span-2">
          <div class="head">终点电量 × 剩余时间 · 200 辆散点</div>
          <div :ref="(el) => bind('scatter', el)" class="chart h-lg"></div>
        </div>
        <div class="card">
          <div class="head">终点电量分档</div>
          <div :ref="(el) => bind('bands', el)" class="chart"></div>
        </div>
        <div class="card">
          <div class="head">充电 / 耗电路段</div>
          <div :ref="(el) => bind('charge', el)" class="chart"></div>
        </div>

        <div class="card">
          <div class="head">终点电量分布</div>
          <div :ref="(el) => bind('ehist', el)" class="chart"></div>
        </div>
        <div class="card">
          <div class="head">终点剩余时间分布</div>
          <div :ref="(el) => bind('thist', el)" class="chart"></div>
        </div>
        <div class="card">
          <div class="head">路径跳数分布</div>
          <div :ref="(el) => bind('hops', el)" class="chart"></div>
        </div>
        <div class="card">
          <div class="head">净充电量（终点−起点）</div>
          <div :ref="(el) => bind('gain', el)" class="chart"></div>
        </div>

        <div class="card span-2">
          <div class="head">站点访问热力 · 1–100 编号网格</div>
          <div :ref="(el) => bind('heat', el)" class="chart h-md"></div>
        </div>
        <div class="card span-2">
          <div class="head">高频站点 TOP15</div>
          <div :ref="(el) => bind('top', el)" class="chart h-md"></div>
        </div>

        <div class="card span-2">
          <div class="head">表3 样例车 · 沿途电量 e(kWh)</div>
          <div :ref="(el) => bind('demoE', el)" class="chart h-md"></div>
        </div>
        <div class="card span-2">
          <div class="head">表3 样例车 · 沿途剩余时间 t(h)</div>
          <div :ref="(el) => bind('demoT', el)" class="chart h-md"></div>
        </div>

        <div class="card span-2">
          <div class="head">样例车 Rewards / Losses</div>
          <div :ref="(el) => bind('demoR', el)" class="chart h-md"></div>
        </div>
        <div class="card span-2">
          <div class="head">全车队平均 Reward vs |Loss|</div>
          <div :ref="(el) => bind('rl', el)" class="chart h-md"></div>
        </div>

        <div class="card span-2">
          <div class="head">算法雷达 · 七张实验表均值</div>
          <div :ref="(el) => bind('radar', el)" class="chart h-lg"></div>
        </div>
        <div class="card span-2">
          <div class="head">算法综合得分（七维均值）</div>
          <div :ref="(el) => bind('algoBar', el)" class="chart h-lg"></div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import {
  ScatterChart,
  PieChart,
  BarChart,
  LineChart,
  HeatmapChart,
  RadarChart,
} from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  LegendComponent,
  RadarComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { loadVehicles } from '@/utils/demoVehicles'
import {
  buildFleetAnalytics,
  algoMeansFromChapter,
  ALGO_ORDER,
} from '@/utils/analyticsData'

echarts.use([
  ScatterChart,
  PieChart,
  BarChart,
  LineChart,
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
}
const DEMO_COLORS = ['#00e8ff', '#ffb020', '#2ee59d', '#ff6b9d', '#7aa2ff']

const loading = ref(true)
const kpis = ref([])
const rootRef = ref(null)
const els = {}
const charts = {}
let ro = null
let options = {}

const tip = {
  backgroundColor: 'rgba(4,12,22,0.92)',
  borderColor: 'rgba(0,232,255,0.35)',
  textStyle: { color: '#d7f7ff', fontSize: 11 },
}

function axis() {
  return {
    axisLine: { lineStyle: { color: 'rgba(0,232,255,0.28)' } },
    axisTick: { show: false },
    axisLabel: { color: '#8fb0c4', fontSize: 10 },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
  }
}

function bind(id, el) {
  if (!(el instanceof HTMLElement)) return
  els[id] = el
  nextTick(() => ensure(id))
}

function ensure(id) {
  const el = els[id]
  if (!el || !options[id] || el.clientWidth < 8) return
  let inst = charts[id]
  if (!inst || inst.isDisposed?.()) {
    echarts.getInstanceByDom(el)?.dispose()
    inst = echarts.init(el)
    charts[id] = inst
  }
  inst.setOption(options[id], true)
  inst.resize()
}

function reveal() {
  nextTick(() => {
    Object.keys(options).forEach((id) => ensure(id))
    Object.values(charts).forEach((c) => c?.resize())
  })
}

function buildOptions(fa, algo) {
  const scatterData = fa.finals.map((x) => [x.time, x.energy, x.id, x.hops])
  const maxStops = Math.max(2, ...fa.demo.map((v) => v.path?.length || 0), 6)

  options = {
    scatter: {
      backgroundColor: 'transparent',
      tooltip: {
        ...tip,
        formatter: (p) => `V${p.data[2]}<br/>时间 ${p.data[0].toFixed(3)} h<br/>电量 ${p.data[1].toFixed(1)} kWh<br/>跳数 ${p.data[3]}`,
      },
      grid: { left: 48, right: 16, top: 18, bottom: 36 },
      xAxis: { name: '剩余时间 h', nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: '#6f8fa3', fontSize: 10 }, ...axis() },
      yAxis: { name: '电量 kWh', ...axis() },
      series: [
        {
          type: 'scatter',
          data: scatterData,
          symbolSize: (d) => 6 + Math.min(8, d[3]),
          itemStyle: { color: 'rgba(0,232,255,0.7)' },
        },
      ],
    },
    bands: {
      backgroundColor: 'transparent',
      tooltip: { ...tip, trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['42%', '70%'],
          label: { color: '#cfefff', fontSize: 10 },
          data: fa.bands.map((b, i) => ({
            ...b,
            itemStyle: { color: ['#ff6b9d', '#ffb020', '#2ee59d'][i] },
          })),
        },
      ],
    },
    charge: {
      backgroundColor: 'transparent',
      tooltip: { ...tip, trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['42%', '70%'],
          label: { color: '#cfefff', fontSize: 10 },
          data: [
            { name: '充电段', value: fa.chargeSeg, itemStyle: { color: '#2ee59d' } },
            { name: '耗电段', value: fa.drainSeg, itemStyle: { color: '#7aa2ff' } },
          ],
        },
      ],
    },
    ehist: {
      backgroundColor: 'transparent',
      tooltip: { ...tip, trigger: 'axis' },
      grid: { left: 36, right: 10, top: 16, bottom: 28 },
      xAxis: { type: 'category', data: fa.energyHist.labels, ...axis() },
      yAxis: { type: 'value', ...axis() },
      series: [{ type: 'bar', data: fa.energyHist.counts, itemStyle: { color: '#00e8ff' }, barWidth: '58%' }],
    },
    thist: {
      backgroundColor: 'transparent',
      tooltip: { ...tip, trigger: 'axis' },
      grid: { left: 36, right: 10, top: 16, bottom: 28 },
      xAxis: { type: 'category', data: fa.timeHist.labels, ...axis() },
      yAxis: { type: 'value', ...axis() },
      series: [{ type: 'bar', data: fa.timeHist.counts, itemStyle: { color: '#ffb020' }, barWidth: '58%' }],
    },
    hops: {
      backgroundColor: 'transparent',
      tooltip: { ...tip, trigger: 'axis' },
      grid: { left: 36, right: 10, top: 16, bottom: 28 },
      xAxis: { type: 'category', data: fa.hopHist.labels, ...axis() },
      yAxis: { type: 'value', ...axis() },
      series: [{ type: 'bar', data: fa.hopHist.counts, itemStyle: { color: '#7aa2ff' }, barWidth: '58%' }],
    },
    gain: {
      backgroundColor: 'transparent',
      tooltip: {
        ...tip,
        formatter: (p) => `V${p.data[2]}  净充 ${p.data[1].toFixed(1)} kWh`,
      },
      grid: { left: 40, right: 12, top: 16, bottom: 28 },
      xAxis: { type: 'value', name: '车辆序号', ...axis() },
      yAxis: { type: 'value', name: 'kWh', ...axis() },
      series: [
        {
          type: 'bar',
          data: fa.finals.map((x) => [x.id, Number(x.gain.toFixed(2)), x.id]),
          itemStyle: {
            color: (p) => (p.data[1] >= 0 ? 'rgba(46,229,157,0.75)' : 'rgba(255,107,157,0.75)'),
          },
        },
      ],
    },
    heat: {
      backgroundColor: 'transparent',
      tooltip: {
        ...tip,
        formatter: (p) => `站点 ${p.data[3]} · 经过 ${p.data[2]} 次`,
      },
      grid: { left: 36, right: 18, top: 10, bottom: 28 },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 10 }, (_, i) => String(i + 1)),
        ...axis(),
      },
      yAxis: {
        type: 'category',
        data: Array.from({ length: 10 }, (_, i) => {
          const start = (9 - i) * 10 + 1
          return `${start}-${start + 9}`
        }),
        ...axis(),
      },
      visualMap: {
        min: 0,
        max: fa.visitMax,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        inRange: { color: ['#041018', '#0a3a4a', '#00e8ff', '#ffb020'] },
        textStyle: { color: '#8fb0c4', fontSize: 10 },
      },
      series: [{ type: 'heatmap', data: fa.heat10, itemStyle: { borderColor: '#041018', borderWidth: 1 } }],
    },
    top: {
      backgroundColor: 'transparent',
      tooltip: { ...tip, trigger: 'axis' },
      grid: { left: 40, right: 12, top: 12, bottom: 28 },
      xAxis: { type: 'category', data: fa.topStations.map((s) => `#${s.id}`), ...axis() },
      yAxis: { type: 'value', ...axis() },
      series: [
        {
          type: 'bar',
          data: fa.topStations.map((s) => s.n),
          itemStyle: { color: '#00e8ff' },
          barWidth: '52%',
        },
      ],
    },
    demoE: {
      backgroundColor: 'transparent',
      tooltip: { ...tip, trigger: 'axis' },
      legend: { textStyle: { color: '#8fb0c4', fontSize: 10 }, top: 0 },
      grid: { left: 44, right: 12, top: 28, bottom: 28 },
      xAxis: {
        type: 'category',
        data: Array.from({ length: maxStops }, (_, i) => `站${i + 1}`),
        ...axis(),
      },
      yAxis: { type: 'value', ...axis() },
      series: fa.demo.map((v, i) => ({
        name: `V${v.vehicle}`,
        type: 'line',
        data: (v.energy || []).map((x) => Number(x.toFixed(2))),
        smooth: 0.2,
        showSymbol: true,
        symbolSize: 6,
        lineStyle: { width: 2, color: DEMO_COLORS[i] },
        itemStyle: { color: DEMO_COLORS[i] },
      })),
    },
    demoT: {
      backgroundColor: 'transparent',
      tooltip: { ...tip, trigger: 'axis' },
      legend: { textStyle: { color: '#8fb0c4', fontSize: 10 }, top: 0 },
      grid: { left: 44, right: 12, top: 28, bottom: 28 },
      xAxis: {
        type: 'category',
        data: Array.from({ length: maxStops }, (_, i) => `站${i + 1}`),
        ...axis(),
      },
      yAxis: { type: 'value', ...axis() },
      series: fa.demo.map((v, i) => ({
        name: `V${v.vehicle}`,
        type: 'line',
        data: (v.time || []).map((x) => Number(x.toFixed(3))),
        smooth: 0.2,
        showSymbol: true,
        symbolSize: 6,
        lineStyle: { width: 2, color: DEMO_COLORS[i] },
        itemStyle: { color: DEMO_COLORS[i] },
      })),
    },
    demoR: {
      backgroundColor: 'transparent',
      tooltip: { ...tip, trigger: 'axis' },
      legend: { textStyle: { color: '#8fb0c4', fontSize: 10 }, top: 0 },
      grid: { left: 44, right: 12, top: 28, bottom: 28 },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 8 }, (_, i) => `步${i + 1}`),
        ...axis(),
      },
      yAxis: { type: 'value', ...axis() },
      series: fa.demo.flatMap((v, i) => [
        {
          name: `V${v.vehicle} R`,
          type: 'line',
          data: (v.rewards || []).map((x) => Number(x.toFixed(2))),
          lineStyle: { width: 2, color: DEMO_COLORS[i] },
          itemStyle: { color: DEMO_COLORS[i] },
        },
        {
          name: `V${v.vehicle} L`,
          type: 'line',
          data: (v.losses || []).map((x) => Number(x.toFixed(2))),
          lineStyle: { width: 1.4, type: 'dashed', color: DEMO_COLORS[i] },
          itemStyle: { color: DEMO_COLORS[i] },
        },
      ]),
    },
    rl: {
      backgroundColor: 'transparent',
      tooltip: { ...tip, trigger: 'axis' },
      grid: { left: 44, right: 12, top: 16, bottom: 28 },
      xAxis: { type: 'value', name: '车辆 ID', ...axis() },
      yAxis: { type: 'value', ...axis() },
      series: [
        {
          name: 'Reward',
          type: 'line',
          showSymbol: false,
          data: fa.finals.map((x) => [x.id, Number(x.reward.toFixed(2))]),
          lineStyle: { color: '#2ee59d', width: 1.4 },
        },
        {
          name: '|Loss|',
          type: 'line',
          showSymbol: false,
          data: fa.finals.map((x) => [x.id, Number(Math.abs(x.loss).toFixed(2))]),
          lineStyle: { color: '#ff6b9d', width: 1.2 },
        },
      ],
    },
    radar: {
      backgroundColor: 'transparent',
      tooltip: tip,
      legend: { data: ALGO_ORDER, textStyle: { color: '#8fb0c4', fontSize: 10 }, top: 0 },
      radar: {
        indicator: algo.indicators,
        splitLine: { lineStyle: { color: 'rgba(0,232,255,0.18)' } },
        splitArea: { areaStyle: { color: ['rgba(0,232,255,0.04)', 'transparent'] } },
        axisName: { color: '#8fb0c4', fontSize: 10 },
        axisLine: { lineStyle: { color: 'rgba(0,232,255,0.2)' } },
      },
      series: [
        {
          type: 'radar',
          data: ALGO_ORDER.map((name, i) => ({
            name,
            value: algo.radar[i],
            lineStyle: { color: ALGO_COLORS[name], width: name === 'PPO+DP' ? 2.4 : 1.4 },
            itemStyle: { color: ALGO_COLORS[name] },
            areaStyle: { color: name === 'PPO+DP' ? 'rgba(0,232,255,0.18)' : 'rgba(255,255,255,0.02)' },
          })),
        },
      ],
    },
    algoBar: {
      backgroundColor: 'transparent',
      tooltip: { ...tip, trigger: 'axis' },
      grid: { left: 48, right: 16, top: 18, bottom: 28 },
      xAxis: { type: 'category', data: ALGO_ORDER, ...axis() },
      yAxis: { type: 'value', min: 0, max: 1, ...axis() },
      series: [
        {
          type: 'bar',
          data: algo.bar.map((b) => ({
            value: Number(b.value.toFixed(3)),
            itemStyle: { color: ALGO_COLORS[b.name] },
          })),
          barWidth: '42%',
        },
      ],
    },
  }
}

async function loadAll() {
  loading.value = true
  try {
    const files = [
      'fleet_energy',
      'fleet_time',
      'fleet_alloc',
      'init_energy',
      'init_time',
      'deadline_energy',
      'deadline_time',
    ]
    const [vehicles, ...tables] = await Promise.all([
      loadVehicles(),
      ...files.map((f) => fetch(`/cl_data/chapter2/${f}.json`).then((r) => r.json())),
    ])
    const baseMap = Object.fromEntries(files.map((f, i) => [f, tables[i]]))
    const fa = buildFleetAnalytics(vehicles)
    const algo = algoMeansFromChapter(baseMap)
    kpis.value = [
      { k: '样本车辆', v: String(fa.n), s: 'vehicles.json' },
      { k: '均终点电量', v: `${fa.avgEnergy.toFixed(1)}`, s: 'kWh' },
      { k: '均剩余时间', v: `${fa.avgTime.toFixed(2)}`, s: 'hours' },
      { k: '均净充电', v: `${fa.avgGain.toFixed(1)}`, s: 'kWh' },
      { k: '均路径跳数', v: fa.avgHops.toFixed(1), s: 'hops' },
      { k: '均 Reward', v: fa.avgReward.toFixed(1), s: 'PPO 回放' },
    ]
    buildOptions(fa, algo)
    await nextTick()
    reveal()
  } catch (e) {
    console.error('加载数据看板失败', e)
  } finally {
    loading.value = false
    await nextTick()
    reveal()
  }
}

onMounted(() => {
  loadAll()
  ro = new ResizeObserver(() => reveal())
  nextTick(() => {
    if (rootRef.value) ro.observe(rootRef.value)
  })
})

onUnmounted(() => {
  ro?.disconnect()
  Object.values(charts).forEach((c) => {
    try {
      c?.dispose()
    } catch {
      /* ignore */
    }
  })
})

defineExpose({ reveal })
</script>

<style scoped>
.dash {
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 8px 12px 16px;
}

.dash-empty {
  padding: 40px 12px;
  text-align: center;
  color: #6f8fa3;
  letter-spacing: 0.1em;
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.kpi {
  border: 1px solid rgba(0, 232, 255, 0.16);
  background: rgba(0, 16, 28, 0.5);
  padding: 8px 10px;
}

.kpi .k {
  display: block;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: #6f8fa3;
}

.kpi .v {
  display: block;
  margin-top: 2px;
  font-family: 'Orbitron', sans-serif;
  font-size: 18px;
  color: #00e8ff;
}

.kpi .s {
  font-size: 10px;
  color: #8fb0c4;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.card {
  border: 1px solid rgba(0, 232, 255, 0.14);
  background: rgba(0, 12, 22, 0.45);
  padding: 8px 8px 4px;
  min-width: 0;
}

.span-2 {
  grid-column: span 2;
}

.head {
  font-size: 12px;
  letter-spacing: 0.06em;
  color: #d7f7ff;
  padding: 0 4px 4px;
}

.chart {
  width: 100%;
  height: 200px;
}

.h-md {
  height: 240px;
}

.h-lg {
  height: 280px;
}

@media (max-width: 1100px) {
  .kpi-row {
    grid-template-columns: repeat(3, 1fr);
  }
  .chart-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
