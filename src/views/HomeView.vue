<template>
  <div class="app-root">
    <div class="scanlines" aria-hidden="true"></div>
    <div class="vignette" aria-hidden="true"></div>

    <header class="hud-top">
      <div class="brand">
        <span class="brand-mark"></span>
        <div>
          <div class="brand-title">营运电动汽车智慧调度与管理系统</div>
          <div class="brand-sub">PPO · NYC Network · Live Playback</div>
        </div>
      </div>
      <button type="button" class="dispatch-center-btn" @click="openDispatch">
        总台调度
      </button>
      <div class="top-stats">
        <div class="chip">
          <span class="chip-k">FLEET</span>
          <span class="chip-v">{{ fleetCards.length }}</span>
        </div>
        <div class="chip">
          <span class="chip-k">AVG ENERGY</span>
          <span class="chip-v">{{ avgEnergy.toFixed(1) }}<small>kWh</small></span>
        </div>
        <div class="chip">
          <span class="chip-k">AVG TIME</span>
          <span class="chip-v">{{ avgTime.toFixed(2) }}<small>h</small></span>
        </div>
        <div class="chip accent">
          <span class="chip-k">STATUS</span>
          <span class="chip-v">{{ statusText }}</span>
        </div>
      </div>
    </header>

    <aside class="hud-left panel">
      <div class="panel-head">
        <span class="panel-tag">01</span>
        <h2>车队到站</h2>
        <p>路径回放 · 实时到站</p>
      </div>

      <div class="fleet-list">
        <div
          v-for="(card, idx) in fleetCards"
          :key="card.id"
          class="fleet-item"
          :class="{
            active: focusedId === card.id,
            following: followingId === card.id,
            done: isTaskDone(card),
          }"
          :style="{ '--accent': card.color }"
          role="button"
          tabindex="0"
          @click="focusVehicle(card.id)"
          @keydown.enter.prevent="focusVehicle(card.id)"
        >
          <span class="fleet-index">{{ String(idx + 1).padStart(2, '0') }}</span>
          <i class="card-frame tl"></i>
          <i class="card-frame tr"></i>
          <i class="card-frame bl"></i>
          <i class="card-frame br"></i>
          <div class="fleet-card">
            <div class="fleet-card-top">
              <span class="vid">V{{ card.id }}</span>
              <span v-if="followingId === card.id" class="follow-tag">FOLLOW</span>
              <span class="path-mini">{{ metroHeadline(card) }}</span>
            </div>
            <div class="fleet-live">
              <div class="fleet-live-nums">
                <b>{{ card.liveEnergy.toFixed(1) }}</b><small>kWh</small>
                <b>{{ card.liveTime.toFixed(2) }}</b><small>h</small>
              </div>
              <div class="fleet-live-bars">
                <div class="ov-meter e">
                  <i :style="{ width: `${cardMeters(card).energy}%` }"></i>
                </div>
                <div class="ov-meter t">
                  <i :style="{ width: `${cardMeters(card).time}%` }"></i>
                </div>
              </div>
            </div>
            <div v-if="focusedId !== card.id" class="metro-mini">
              <MetroZigzag :stops="metroStops(card)" />
            </div>
          </div>

          <div v-if="focusedId === card.id" class="metro-detail">
            <div class="metro-sum">
              <span>{{ card.path.length }} 站</span>
              <span>{{ card.path[0] }} → {{ card.path[card.path.length - 1] }}</span>
            </div>
            <MetroZigzag :stops="metroStops(card)" />
          </div>
        </div>
      </div>
    </aside>

    <main class="map-stage">
      <div ref="cesiumContainer" class="cesiumContainer" id="cesiumContainer"></div>
      <div class="map-frame tl"></div>
      <div class="map-frame tr"></div>
      <div class="map-frame bl"></div>
      <div class="map-frame br"></div>
      <div class="map-hint" v-if="focusedCard">
        <template v-if="followingId === focusedCard.id">
          跟随中 · V{{ focusedCard.id }} · 站点 {{ focusedCard.liveNode }}
          <span class="hint-sub">再次点击取消跟随 · 右键也可取消</span>
        </template>
        <template v-else>
          聚焦 · V{{ focusedCard.id }} · 站点 {{ focusedCard.liveNode }}
        </template>
      </div>
    </main>

    <aside class="hud-right panel">
      <div class="panel-head">
        <span class="panel-tag">02</span>
        <h2>运行态势</h2>
        <p>实时电量 · 任务进度 · 在途状态</p>
      </div>

      <div class="overview-kpis">
        <div class="kpi">
          <span class="kpi-k">FLEET</span>
          <strong class="kpi-v">{{ vehicleTotal }}</strong>
          <span class="kpi-s">在屏车辆</span>
        </div>
        <div class="kpi accent">
          <span class="kpi-k">DONE</span>
          <strong class="kpi-v">{{ completedTasks }}</strong>
          <span class="kpi-s">{{ completeRate }}%</span>
        </div>
        <div class="kpi hot">
          <span class="kpi-k">LIVE</span>
          <strong class="kpi-v">{{ runningTasks }}</strong>
          <span class="kpi-s">执行中</span>
        </div>
      </div>

      <FleetMiniCharts
        :cards="fleetCards"
        :completed="completedTasks"
        :running="runningTasks"
        :complete-rate="completeRate"
        :avg-energy="avgEnergy"
        :avg-time="avgTime"
      />

      <div class="overview-list">
        <button
          v-for="card in fleetCards"
          :key="`ov-${card.id}`"
          type="button"
          class="overview-row"
          :class="{ done: isTaskDone(card), active: focusedId === card.id }"
          :style="{ '--accent': card.color, '--p': `${Math.round((card.progress || 0) * 100)}%` }"
          @click="focusVehicle(card.id)"
        >
          <span class="ov-led"></span>
          <div class="ov-main">
            <div class="ov-top">
              <span class="ov-id">V{{ card.id }}</span>
              <span class="ov-tag">{{ isTaskDone(card) ? 'ARRIVED' : 'EN-ROUTE' }}</span>
            </div>
            <div class="ov-meters">
              <div class="ov-meter-row">
                <span>ENERGY</span>
                <div class="ov-meter e">
                  <i :style="{ width: `${cardMeters(card).energy}%` }"></i>
                </div>
              </div>
              <div class="ov-meter-row">
                <span>TIME LEFT</span>
                <div class="ov-meter t">
                  <i :style="{ width: `${cardMeters(card).time}%` }"></i>
                </div>
              </div>
            </div>
            <div class="ov-nums">
              <span>{{ card.liveEnergy.toFixed(1) }} kWh</span>
              <span>{{ card.liveTime.toFixed(2) }} h left</span>
            </div>
          </div>
        </button>
      </div>
    </aside>

    <div
      v-if="dispatchOpen"
      class="dispatch-mask"
      @click.self="closeDispatch"
    >
      <div class="dispatch-modal panel" role="dialog" aria-modal="true" aria-labelledby="dispatch-title">
        <div class="dispatch-head">
          <div class="panel-head">
            <span class="panel-tag">HQ</span>
            <h2 id="dispatch-title">总台调度</h2>
            <p>算法回放 · 实验结果 · 车队画像</p>
          </div>
          <div class="dispatch-head-actions">
            <button type="button" class="dispatch-close" @click="closeDispatch">关闭</button>
          </div>
        </div>

        <div class="dispatch-pick" v-show="rightTab === 'live'">
          <span class="dispatch-pick-label">车辆选择</span>
          <div class="dispatch-pick-list">
            <button
              v-for="card in fleetCards"
              :key="`pick-${card.id}`"
              type="button"
              class="dispatch-pick-btn"
              :class="{ active: dispatchId === card.id }"
              :style="{ '--accent': card.color }"
              @click="selectDispatchVehicle(card.id)"
            >
              V{{ card.id }}
            </button>
          </div>
        </div>

        <div class="dispatch-fleet-row">
          <button
            type="button"
            class="dispatch-fleet-btn"
            :disabled="!fleetAllReady"
            @click="openFleetModels"
          >
            显示全部车辆
          </button>
          <div v-if="!fleetAllReady" class="fleet-progress">
            <div class="fleet-progress-fill" :style="{ width: `${fleetPrepPercent}%` }"></div>
          </div>
        </div>

        <div class="right-tabs">
          <button
            type="button"
            class="right-tab"
            :class="{ active: rightTab === 'live' }"
            @click="rightTab = 'live'"
          >
            算法调度
          </button>
          <button
            type="button"
            class="right-tab"
            :class="{ active: rightTab === 'exp' }"
            @click="rightTab = 'exp'"
          >
            实验结果
          </button>
          <button
            type="button"
            class="right-tab"
            :class="{ active: rightTab === 'dash' }"
            @click="rightTab = 'dash'"
          >
            数据看板
          </button>
        </div>

        <div v-show="rightTab === 'live'" class="right-pane dispatch-pane">
          <template v-if="dispatchCard">
            <div class="gauge-row">
              <div class="ring-gauge">
                <svg viewBox="0 0 120 120">
                  <circle class="ring-bg" cx="60" cy="60" r="48" />
                  <circle
                    class="ring-fg energy-ring"
                    cx="60"
                    cy="60"
                    r="48"
                    :style="{ strokeDashoffset: energyRingOffset }"
                  />
                </svg>
                <div class="ring-center">
                  <div class="ring-val">{{ dispatchCard.liveEnergy.toFixed(1) }}</div>
                  <div class="ring-unit">kWh</div>
                </div>
                <div class="ring-caption">Energy</div>
              </div>
              <div class="ring-gauge">
                <svg viewBox="0 0 120 120">
                  <circle class="ring-bg" cx="60" cy="60" r="48" />
                  <circle
                    class="ring-fg time-ring"
                    cx="60"
                    cy="60"
                    r="48"
                    :style="{ strokeDashoffset: timeRingOffset }"
                  />
                </svg>
                <div class="ring-center">
                  <div class="ring-val">{{ dispatchCard.liveTime.toFixed(2) }}</div>
                  <div class="ring-unit">hours</div>
                </div>
                <div class="ring-caption">Time Left</div>
              </div>
            </div>

            <div class="block">
              <div class="block-title">
                <span>Rewards / Losses</span>
                <span class="block-meta">ΣR {{ rewardSum.toFixed(1) }}</span>
              </div>
              <svg class="spark" viewBox="0 0 320 90" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="rgba(46,229,157,0.45)" />
                    <stop offset="100%" stop-color="rgba(46,229,157,0)" />
                  </linearGradient>
                  <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="rgba(255,77,109,0)" />
                    <stop offset="100%" stop-color="rgba(255,77,109,0.4)" />
                  </linearGradient>
                </defs>
                <path :d="rewardArea" fill="url(#rg)" />
                <path :d="rewardLine" class="spark-line reward" fill="none" />
                <path :d="lossLine" class="spark-line loss" fill="none" />
                <line x1="0" y1="45" x2="320" y2="45" class="spark-zero" />
              </svg>
              <div class="legend">
                <span class="lg-r">Rewards</span>
                <span class="lg-l">Losses</span>
              </div>
            </div>

            <div class="block grow">
              <div class="block-title">
                <span>站间速度</span>
                <span class="block-meta">V{{ dispatchCard.id }} · speed.csv</span>
              </div>
              <div class="speed-list">
                <div
                  v-for="(seg, i) in focusedSpeeds"
                  :key="seg.label"
                  class="speed-row"
                  :class="{ hot: i === dispatchCard.liveNodeIndex }"
                >
                  <span class="seg-label">{{ seg.label }}</span>
                  <div class="seg-bar-wrap">
                    <div
                      class="seg-bar"
                      :style="{ width: `${(seg.speed / maxSpeed) * 100}%` }"
                    ></div>
                  </div>
                  <span class="seg-val">{{ seg.speed.toFixed(1) }} <small>km/h</small></span>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="empty-right">等待车辆数据…</div>
        </div>

        <div v-show="rightTab === 'exp'" class="right-pane dispatch-pane">
          <ExperimentCharts ref="expChartsRef" />
        </div>

        <div v-show="rightTab === 'dash'" class="right-pane dispatch-pane">
          <AnalyticsDashboard ref="dashRef" />
        </div>
      </div>
    </div>

    <FleetModelsDialog
      v-if="fleetModelsOpen"
      :plans="fleetPlans"
      @close="fleetModelsOpen = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import {
  loadStations,
  loadVehicles,
  loadSpeedMatrix,
  pickNearbyVehicles,
  pickAroundDemo,
  fetchRouteOrFallback,
  buildPathSpeeds,
  sampleVehicleState,
} from '@/utils/demoVehicles'
import { createStationHaloCanvas, paintStationHalo } from '@/utils/stationHalo'
import { createVehicleHudCanvas, paintVehicleHud, hudMeterPercents } from '@/utils/vehicleHud'
import { loadFleetRoutes, plansFromCache, saveFleetRoutes } from '@/utils/fleetCache'
import ExperimentCharts from '@/components/ExperimentCharts.vue'
import MetroZigzag from '@/components/MetroZigzag.vue'
import FleetModelsDialog from '@/components/FleetModelsDialog.vue'
import FleetMiniCharts from '@/components/FleetMiniCharts.vue'
import AnalyticsDashboard from '@/components/AnalyticsDashboard.vue'

const cesiumContainer = ref(null)
const statusText = ref('初始化…')
const fleetCards = ref([])
const focusedId = ref(null)
const followingId = ref(null)
const dispatchId = ref(null)
const speedMatrix = ref([])
const rightTab = ref('live')
const expChartsRef = ref(null)
const dashRef = ref(null)
const dispatchOpen = ref(false)
const fleetModelsOpen = ref(false)
const fleetPlans = ref([])
const fleetPrepTotal = ref(50)
const fleetAllReady = computed(() => fleetPrepTotal.value > 0 && fleetPlans.value.length >= fleetPrepTotal.value)
const fleetPrepPercent = computed(() => {
  if (!fleetPrepTotal.value) return 0
  return Math.min(100, Math.round((fleetPlans.value.length / fleetPrepTotal.value) * 100))
})

let removeResizeObserver = null
let viewer = null

function mapSizeOk() {
  const el = cesiumContainer.value
  return !!(el && el.clientWidth >= 2 && el.clientHeight >= 2)
}

function safeViewerResize() {
  if (!viewer || viewer.isDestroyed() || !mapSizeOk()) return
  viewer.resize()
}

function recoverCesiumRender() {
  if (!viewer || viewer.isDestroyed() || !mapSizeOk()) return
  try {
    safeViewerResize()
    viewer.useDefaultRenderLoop = true
    const panel = cesiumContainer.value?.querySelector?.('.cesium-widget-errorPanel')
    if (panel) panel.style.display = 'none'
  } catch {
    /* ignore */
  }
}
/** @type {{ entity: any, canvas: HTMLCanvasElement, stationId: number }[]} */
let stationHalos = []
let removeHaloTick = null
let removeClockTick = null
let removeFollowTick = null
/** @type {Map<number, { vehicle: any, start: any, travelSeconds: number, color: string }>} */
const runtimeMap = new Map()
const addedStationIds = new Set()
const followScratch = {
  pos: new Cesium.Cartesian3(),
  transform: new Cesium.Matrix4(),
  // 接近原先高视角，仅略降（原：北偏后 4200、上 2800）
  offset: new Cesium.Cartesian3(0, -3600, 2350),
}
const FOLLOW_FLY_OFFSET = new Cesium.HeadingPitchRange(
  0,
  Cesium.Math.toRadians(-53),
  4500,
)

Cesium.Ion.defaultAccessToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1NjNiYTVhMi0zYWIwLTQ3NWYtYmQyNi02NmQ2OTVhMmVjZTIiLCJpZCI6MzQzMDUxLCJpYXQiOjE3NTgzNDkxOTR9.S1ytE242IAC1WOyFRe1b3YyMdVfpfUxBQ16zHjvDurc'

const VEHICLE_COLORS = ['#00e8ff', '#ffb020', '#2ee59d', '#ff6b9d', '#7aa2ff']
const MODEL_URI = '/modles/mitsubishi_evo.glb'
const DEMO_SPEED_MPS = 40
const RING_C = 2 * Math.PI * 48

const focusedCard = computed(() => fleetCards.value.find((c) => c.id === focusedId.value) || null)
const dispatchCard = computed(() => fleetCards.value.find((c) => c.id === dispatchId.value) || null)

watch([dispatchOpen, rightTab], ([open, tab]) => {
  if (!open) return
  requestAnimationFrame(() => {
    if (tab === 'exp') expChartsRef.value?.reveal?.()
    if (tab === 'dash') dashRef.value?.reveal?.()
  })
})

watch(fleetModelsOpen, (open) => {
  if (!viewer || viewer.isDestroyed()) return
  if (open) {
    viewer.useDefaultRenderLoop = false
    viewer.clock.shouldAnimate = false
  } else {
    viewer.clock.shouldAnimate = true
    viewer.useDefaultRenderLoop = true
  }
})

function isTaskDone(card) {
  return (card?.progress ?? 0) >= 0.995
}

function cardMeters(card) {
  return hudMeterPercents(card?.liveEnergy, card?.initEnergy, card?.liveTime, card?.initTime)
}

const vehicleTotal = computed(() => fleetCards.value.length)

const completedTasks = computed(
  () => fleetCards.value.filter((c) => isTaskDone(c)).length,
)

const runningTasks = computed(() => Math.max(0, vehicleTotal.value - completedTasks.value))

const completeRate = computed(() => {
  if (!vehicleTotal.value) return 0
  return Math.round((completedTasks.value / vehicleTotal.value) * 100)
})

function openDispatch() {
  dispatchId.value = focusedId.value
  dispatchOpen.value = true
}

function openFleetModels() {
  if (!fleetAllReady.value) return
  fleetModelsOpen.value = true
}

function closeDispatch() {
  dispatchOpen.value = false
}

function selectDispatchVehicle(id) {
  dispatchId.value = id
}

function onDispatchKey(e) {
  if (e.key !== 'Escape') return
  if (fleetModelsOpen.value) {
    fleetModelsOpen.value = false
    return
  }
  if (dispatchOpen.value) closeDispatch()
}

const avgEnergy = computed(() => {
  if (!fleetCards.value.length) return 0
  return fleetCards.value.reduce((s, c) => s + c.liveEnergy, 0) / fleetCards.value.length
})

const avgTime = computed(() => {
  if (!fleetCards.value.length) return 0
  return fleetCards.value.reduce((s, c) => s + c.liveTime, 0) / fleetCards.value.length
})

const focusedSpeeds = computed(() => {
  const id = dispatchId.value
  const card = fleetCards.value.find((c) => c.id === id)
  if (!card) return []
  return buildPathSpeeds(speedMatrix.value, card.path)
})

const maxSpeed = computed(() => {
  const speeds = focusedSpeeds.value.map((s) => s.speed).filter((x) => x > 0)
  return Math.max(60, ...(speeds.length ? speeds : [60]))
})

const energyRingOffset = computed(() => {
  const e = dispatchCard.value?.liveEnergy ?? 0
  return RING_C * (1 - Math.min(1, e / 100))
})

const timeRingOffset = computed(() => {
  const card = dispatchCard.value
  if (!card) return RING_C
  const ratio = Math.min(1, card.liveTime / Math.max(card.initTime, 0.01))
  return RING_C * (1 - ratio)
})

const rewardSum = computed(() => {
  const r = dispatchCard.value?.rewards || []
  return r.reduce((a, b) => a + b, 0)
})

function sparkPaths(values) {
  if (!values?.length) return { line: '', area: '' }
  const w = 320
  const h = 90
  const mid = h / 2
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)))
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w
    const y = mid - (v / maxAbs) * (mid - 6)
    return [x, y]
  })
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${w},${mid} L0,${mid} Z`
  return { line, area }
}

const rewardLine = computed(() => sparkPaths(dispatchCard.value?.rewards || []).line)
const rewardArea = computed(() => sparkPaths(dispatchCard.value?.rewards || []).area)
const lossLine = computed(() => sparkPaths(dispatchCard.value?.losses || []).line)

function metroStops(card) {
  const path = card?.path || []
  const nodeIndex = Math.min(card?.liveNodeIndex ?? 0, Math.max(0, path.length - 1))
  const done = (card?.progress ?? 0) >= 0.995
  return path.map((id, i) => {
    let status = 'upcoming'
    let tag = '未到'
    let segStatus = 'future'
    if (done || i < nodeIndex) {
      status = 'arrived'
      tag = i === path.length - 1 && done ? '终点' : '已到'
    } else if (i === nodeIndex) {
      status = i === path.length - 1 ? 'arrived' : 'current'
      tag = i === path.length - 1 ? '终点' : '本站'
    } else if (i === nodeIndex + 1) {
      status = 'next'
      tag = '下一站'
    }
    if (i < path.length - 1) {
      if (done || i < nodeIndex) segStatus = 'passed'
      else if (i === nodeIndex) segStatus = 'transit'
      else segStatus = 'future'
    }
    return { id, index: i, status, tag, segStatus }
  })
}

function metroHeadline(card) {
  const stops = metroStops(card)
  const transit = stops.find((s) => s.segStatus === 'transit')
  const current = stops.find((s) => s.status === 'current') || stops.find((s) => s.status === 'arrived')
  const next = stops.find((s) => s.status === 'next')
  if ((card?.progress ?? 0) >= 0.995) return '全程已到站'
  if (transit && current && next) return `${current.id} → ${next.id} 在途`
  if (current) return `停靠站 ${current.id}`
  return '待发车'
}

function getCarEntity(id) {
  if (!viewer) return null
  return (
    viewer.entities.getById(`car-${id}`) ||
    viewer.entities.values.find((e) => e.name === `car-${id}`) ||
    null
  )
}

function stopFollowCamera() {
  followingId.value = null
  if (Cesium.RequestScheduler) {
    Cesium.RequestScheduler.throttleRequests = true
  }
  if (!viewer || viewer.isDestroyed()) return
  viewer.trackedEntity = undefined
  try {
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
  } catch {
    /* ignore */
  }
}

function updateFollowCamera() {
  if (!viewer || followingId.value == null) return
  const entity = getCarEntity(followingId.value)
  if (!entity?.position) return
  const time = viewer.clock.currentTime
  const pos = entity.position.getValue(time, followScratch.pos)
  if (!Cesium.defined(pos)) return

  Cesium.Transforms.eastNorthUpToFixedFrame(pos, undefined, followScratch.transform)
  viewer.camera.lookAtTransform(followScratch.transform, followScratch.offset)
}

function focusVehicle(id) {
  focusedId.value = id

  // 再次点击同一辆：取消跟随
  if (followingId.value === id) {
    stopFollowCamera()
    const entity = getCarEntity(id)
    if (entity) {
      viewer.flyTo(entity, {
        duration: 0.55,
        offset: FOLLOW_FLY_OFFSET,
      })
    }
    return
  }

  const entity = getCarEntity(id)
  if (!viewer || !entity) return

  followingId.value = id
  viewer.trackedEntity = undefined
  stopLookAtOnly()
  if (Cesium.RequestScheduler) {
    Cesium.RequestScheduler.throttleRequests = false
  }
  updateFollowCamera()
}

function stopLookAtOnly() {
  if (!viewer || viewer.isDestroyed()) return
  try {
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
  } catch {
    /* ignore */
  }
}

function flattenDegreesArray(coordinates) {
  const arr = []
  for (const [lon, lat] of coordinates) {
    arr.push(lon, lat, 1.2)
  }
  return arr
}

/** 点到线段距离（米，局部平面近似） */
function pointToSegMeters(p, a, b) {
  const lat0 = ((a[1] + b[1]) * 0.5 * Math.PI) / 180
  const mx = Math.cos(lat0) * 111320
  const my = 110540
  const ax = 0
  const ay = 0
  const bx = (b[0] - a[0]) * mx
  const by = (b[1] - a[1]) * my
  const px = (p[0] - a[0]) * mx
  const py = (p[1] - a[1]) * my
  const den = bx * bx + by * by
  if (den < 1e-6) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * bx + (py - ay) * by) / den
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * bx), py - (ay + t * by))
}

/** Douglas-Peucker：保形抽稀，避免均匀抽点把弯道拉直穿楼 */
function douglasPeucker(coords, toleranceM) {
  const n = coords.length
  if (n <= 2) return coords.slice()
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  const stack = [[0, n - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()
    let maxDist = 0
    let idx = -1
    const a = coords[start]
    const b = coords[end]
    for (let i = start + 1; i < end; i++) {
      const d = pointToSegMeters(coords[i], a, b)
      if (d > maxDist) {
        maxDist = d
        idx = i
      }
    }
    if (idx >= 0 && maxDist > toleranceM) {
      keep[idx] = 1
      stack.push([start, idx], [idx, end])
    }
  }
  const out = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(coords[i])
  return out
}

/**
 * 路线抽稀：优先保形；仅当仍过密时再略增容差。
 * 比等距抽样更贴路。
 */
function simplifyRouteCoordinates(coordinates, maxPoints = 520) {
  if (!coordinates?.length) return []
  if (coordinates.length <= maxPoints) return coordinates

  let tol = 2.5
  let simplified = douglasPeucker(coordinates, tol)
  while (simplified.length > maxPoints && tol < 18) {
    tol *= 1.45
    simplified = douglasPeucker(coordinates, tol)
  }
  if (simplified.length > maxPoints) {
    // 最后兜底：仍过密则轻度均匀抽，但上限更高
    const out = []
    const step = (simplified.length - 1) / (maxPoints - 1)
    for (let i = 0; i < maxPoints - 1; i++) out.push(simplified[Math.round(i * step)])
    out.push(simplified[simplified.length - 1])
    return out
  }
  return simplified
}

function startStationHaloAnimation() {
  let lastPaint = 0
  let cursor = 0
  removeHaloTick = viewer.scene.preRender.addEventListener(() => {
    if (!stationHalos.length) return
    const now = performance.now()
    if (now - lastPaint < 250) return
    lastPaint = now
    const item = stationHalos[cursor % stationHalos.length]
    cursor += 1
    paintStationHalo(item.canvas, item.stationId, now)
    item.entity.billboard.image = item.canvas
  })
}

let lastHudSyncMs = 0

function syncFleetLiveState() {
  if (!viewer) return
  const wall = performance.now()
  const now = viewer.clock.currentTime
  const doHud = wall - lastHudSyncMs >= 200
  if (doHud) lastHudSyncMs = wall

  for (const card of fleetCards.value) {
    const rt = runtimeMap.get(card.id)
    if (!rt) continue
    const elapsed = Cesium.JulianDate.secondsDifference(now, rt.start)
    const progress = Math.min(1, Math.max(0, elapsed / Math.max(rt.travelSeconds, 1e-3)))

    if (doHud) {
      const state = sampleVehicleState(rt.vehicle, progress)
      if (Math.abs(card.liveEnergy - state.energy) > 0.05) card.liveEnergy = state.energy
      if (Math.abs(card.liveTime - state.time) > 0.002) card.liveTime = state.time
      const node = rt.vehicle.path[Math.min(state.nodeIndex, rt.vehicle.path.length - 1)]
      if (card.liveNode !== node) card.liveNode = node
      if (card.liveNodeIndex !== state.nodeIndex) card.liveNodeIndex = state.nodeIndex
      card.progress = state.progress
      if (rt.hudCanvases?.length && rt.hudEntity) {
        rt.hudFlip = rt.hudFlip ? 0 : 1
        const canvas = rt.hudCanvases[rt.hudFlip]
        paintVehicleHud(canvas, {
          id: card.id,
          color: rt.color,
          energy: state.energy,
          initEnergy: card.initEnergy,
          time: state.time,
          initTime: card.initTime,
        })
        rt.hudEntity.billboard.image = canvas
      }
    }

    if (rt.routePositions?.length) {
      const car = getCarEntity(card.id)
      const carPos = car?.position?.getValue(now, rt.carPosScratch)
      if (Cesium.defined(carPos)) {
        updateSplitRouteAtCar(rt, carPos)
      } else {
        updateSplitRoute(rt, progress)
      }
    }
  }
}

function closestOnSegment(p, a, b, out) {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const abz = b.z - a.z
  const den = abx * abx + aby * aby + abz * abz
  let t = 0
  if (den > 1e-8) {
    t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / den
    t = Cesium.Math.clamp(t, 0, 1)
  }
  out.x = a.x + abx * t
  out.y = a.y + aby * t
  out.z = a.z + abz * t
  const dx = p.x - out.x
  const dy = p.y - out.y
  const dz = p.z - out.z
  return { t, d2: dx * dx + dy * dy + dz * dz }
}

/** 以车身中心投影到路线上的点切开：身后立即变淡 */
function updateSplitRouteAtCar(rt, carPos) {
  const positions = rt.routePositions
  const n = positions.length
  if (n < 2) return

  const hint = rt._splitI0 ?? 0
  let bestI = hint
  let bestT = 0
  let bestD2 = Infinity
  const out = rt.segClosestScratch

  const scan = (from, to) => {
    const lo = Math.max(0, from)
    const hi = Math.min(n - 2, to)
    for (let i = lo; i <= hi; i++) {
      const hit = closestOnSegment(carPos, positions[i], positions[i + 1], out)
      if (hit.d2 < bestD2) {
        bestD2 = hit.d2
        bestI = i
        bestT = hit.t
        Cesium.Cartesian3.clone(out, rt.midScratch)
      }
    }
  }

  scan(hint - 4, hint + 16)
  if (bestD2 > 80 * 80) scan(0, n - 2)

  rt._splitI0 = bestI
  applySplit(rt, bestI, bestT, rt.midScratch)
}

/** 就地更新已走/未走折线，复用坐标引用，避免每帧全量 clone */
function updateSplitRoute(rt, progress01) {
  const positions = rt.routePositions
  const n = positions.length
  if (n < 2) return

  const p = Math.min(1, Math.max(0, progress01))
  if (p <= 0.0001) {
    applySplit(rt, 0, 0, positions[0])
    return
  }
  if (p >= 0.9999) {
    applySplit(rt, n - 2, 1, positions[n - 1])
    return
  }

  const target = p * rt.totalDist
  const segLens = rt.segLens
  let i = 1
  while (i < segLens.length && segLens[i] < target) i += 1
  const i0 = Math.max(0, i - 1)
  const i1 = Math.min(n - 1, i)
  const segLen = Math.max(segLens[i1] - segLens[i0], 1e-6)
  const t = Cesium.Math.clamp((target - segLens[i0]) / segLen, 0, 1)
  Cesium.Cartesian3.lerp(positions[i0], positions[i1], t, rt.midScratch)
  applySplit(rt, i0, t, rt.midScratch)
}

function applySplit(rt, i0, t, mid) {
  const positions = rt.routePositions
  const n = positions.length
  const passed = rt.passedPos
  const remain = rt.remainPos
  passed.length = 0
  remain.length = 0

  if (i0 <= 0 && t <= 0.0001) {
    passed.push(positions[0], positions[0])
    for (let i = 0; i < n; i++) remain.push(positions[i])
    return
  }
  if (i0 >= n - 2 && t >= 0.999) {
    for (let i = 0; i < n; i++) passed.push(positions[i])
    remain.push(positions[n - 1], positions[n - 1])
    return
  }

  for (let k = 0; k <= i0; k++) passed.push(positions[k])
  passed.push(mid)
  remain.push(mid)
  for (let k = i0 + 1; k < n; k++) remain.push(positions[k])
}

function vehicleIdFromPick(picked) {
  const ent = picked?.id
  const sid = typeof ent === 'string' ? ent : ent?.id
  if (typeof sid !== 'string') return null
  const m = sid.match(/^car-(?:hud-)?(\d+)$/)
  return m ? Number(m[1]) : null
}

function makeCard(vehicle, color, initE, initT) {
  return {
    id: vehicle.vehicle,
    color,
    path: vehicle.path,
    pathLabel: vehicle.path.join('→'),
    energy: vehicle.energy || [],
    time: vehicle.time || [],
    rewards: vehicle.rewards || [],
    losses: vehicle.losses || [],
    initEnergy: initE || vehicle.energy?.[0] || 0,
    initTime: initT || vehicle.time?.[0] || 1,
    liveEnergy: vehicle.energy?.[0] || 0,
    liveTime: vehicle.time?.[0] || 0,
    liveNode: vehicle.path[0],
    liveNodeIndex: 0,
    progress: 0,
  }
}

function pickRandomVehicles(pool, count, byId) {
  const copy = pool.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  const out = []
  for (const item of copy) {
    if (out.length >= count) break
    const v = item?.vehicle ? item : byId.get(item.id ?? item)
    if (v) out.push(v)
  }
  return out
}

async function computePlan(vehicle, color, stations) {
  const pathStations = vehicle.path.map((id) => stations[id]).filter(Boolean)
  if (pathStations.length < 2) return null
  const route = await fetchRouteOrFallback(pathStations)
  if (!route?.coordinates?.length) return null
  const coordinates = simplifyRouteCoordinates(route.coordinates, 520)
  const plan = {
    id: vehicle.vehicle,
    color,
    path: vehicle.path,
    energy: vehicle.energy || [],
    time: vehicle.time || [],
    coordinates,
  }
  fleetPlans.value = [...fleetPlans.value.filter((p) => p.id !== plan.id), plan]
  return plan
}

async function mountFromPlan(plan, vehicle, stations, startTime, stopTime) {
  if (runtimeMap.has(vehicle.vehicle)) return null
  addStationPoints(vehicle.path, stations, addedStationIds)
  const { initE, initT } = addRouteAndCar(vehicle, plan.coordinates, plan.color, startTime, stopTime)
  return makeCard(vehicle, plan.color, initE, initT)
}

async function runPool(items, limit, worker) {
  const results = []
  let cursor = 0
  const n = Math.min(Math.max(1, limit), items.length)
  if (!items.length) return results
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (cursor < items.length) {
        const i = cursor
        cursor += 1
        results[i] = await worker(items[i], i)
      }
    }),
  )
  return results
}

function syncClockToFleet(startTime) {
  let maxTravel = 30
  for (const id of runtimeMap.keys()) {
    maxTravel = Math.max(maxTravel, runtimeMap.get(id).travelSeconds)
  }
  const loopStop = Cesium.JulianDate.addSeconds(startTime, maxTravel + 2, new Cesium.JulianDate())
  if (Cesium.JulianDate.lessThan(viewer.clock.stopTime, loopStop)) {
    viewer.clock.stopTime = loopStop
  }
}

function bindMapPicks() {
  viewer.screenSpaceEventHandler.setInputAction((click) => {
    const drilled = viewer.scene.drillPick(click.position, 10)
    let id = null
    for (const picked of drilled) {
      id = vehicleIdFromPick(picked)
      if (id != null) break
    }
    if (id == null) id = vehicleIdFromPick(viewer.scene.pick(click.position))
    if (id != null) focusVehicle(id)
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  viewer.screenSpaceEventHandler.setInputAction(() => {
    if (followingId.value != null) stopFollowCamera()
  }, Cesium.ScreenSpaceEventType.RIGHT_DOWN)
}

function addStationPoints(stationIds, stations, addedIds) {
  for (const id of stationIds) {
    if (addedIds.has(id)) continue
    const s = stations[id]
    if (!s) continue
    addedIds.add(id)

    const canvas = createStationHaloCanvas(id)
    const entity = viewer.entities.add({
      name: `station-${id}`,
      position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 3),
      billboard: {
        image: canvas,
        width: 48,
        height: 48,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    stationHalos.push({ entity, canvas, stationId: id })
  }
}

function addRouteAndCar(vehicle, coordinates, colorCss, startTime, stopTime) {
  const passedColor = Cesium.Color.fromCssColorString(colorCss).withAlpha(0.25)
  const remainGlow = Cesium.Color.fromCssColorString(colorCss).withAlpha(1.0)

  const slim = simplifyRouteCoordinates(coordinates, 520)
  const flat = flattenDegreesArray(slim)
  // 路线与车辆各用独立坐标，避免贴地改写互相影响
  const routePositions = Cesium.Cartesian3.fromDegreesArrayHeights(flat)
  const carPositions = routePositions.map((p) => Cesium.Cartesian3.clone(p))

  let totalDist = 0
  const segLens = [0]
  for (let i = 1; i < carPositions.length; i++) {
    totalDist += Cesium.Cartesian3.distance(carPositions[i - 1], carPositions[i])
    segLens.push(totalDist)
  }
  if (totalDist < 1) totalDist = 1

  const rt = {
    vehicle,
    start: startTime.clone(),
    travelSeconds: Math.max(totalDist / DEMO_SPEED_MPS, 20),
    color: colorCss,
    routePositions,
    segLens,
    totalDist,
    midScratch: new Cesium.Cartesian3(),
    carPosScratch: new Cesium.Cartesian3(),
    segClosestScratch: new Cesium.Cartesian3(),
    _splitI0: 0,
    passedPos: [routePositions[0], routePositions[0]],
    remainPos: routePositions.slice(),
  }

  // 每车仅 2 条折线；贴地绘制，减少“浮空/看起来不在路上”
  viewer.entities.add({
    name: `route-passed-${vehicle.vehicle}`,
    polyline: {
      positions: new Cesium.CallbackProperty(() => rt.passedPos, false),
      width: 9,
      material: passedColor,
      clampToGround: true,
      arcType: Cesium.ArcType.GEODESIC,
    },
  })
  viewer.entities.add({
    name: `route-remain-${vehicle.vehicle}`,
    polyline: {
      positions: new Cesium.CallbackProperty(() => rt.remainPos, false),
      width: 16,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.28,
        color: remainGlow,
      }),
      clampToGround: true,
      arcType: Cesium.ArcType.GEODESIC,
    },
  })

  const travelSeconds = rt.travelSeconds
  const positionProperty = new Cesium.SampledPositionProperty()
  // 超出采样区间仍保持端点位置，避免车“消失”、跟随中断
  positionProperty.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD
  positionProperty.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD

  const sampleStep = Math.max(1, Math.floor(carPositions.length / 80))
  for (let i = 0; i < carPositions.length; i += sampleStep) {
    const t = Cesium.JulianDate.addSeconds(
      startTime,
      (segLens[i] / totalDist) * travelSeconds,
      new Cesium.JulianDate(),
    )
    positionProperty.addSample(t, carPositions[i])
  }
  const last = carPositions.length - 1
  if (last % sampleStep !== 0) {
    const t = Cesium.JulianDate.addSeconds(startTime, travelSeconds, new Cesium.JulianDate())
    positionProperty.addSample(t, carPositions[last])
  }

  const carStop = Cesium.JulianDate.addSeconds(startTime, travelSeconds, new Cesium.JulianDate())
  if (Cesium.JulianDate.lessThan(stopTime, carStop)) {
    Cesium.JulianDate.clone(carStop, stopTime)
  }

  const initE = vehicle.energy?.[0] ?? 0
  const initT = vehicle.time?.[0] ?? 0

  const hudPayload = {
    id: vehicle.vehicle,
    color: colorCss,
    energy: initE,
    initEnergy: initE,
    time: initT,
    initTime: initT,
  }
  const hudA = createVehicleHudCanvas(hudPayload)
  const hudB = createVehicleHudCanvas(hudPayload)

  viewer.entities.add({
    id: `car-${vehicle.vehicle}`,
    name: `car-${vehicle.vehicle}`,
    // 不设 availability，保证任何时刻/高度都显示车辆
    position: positionProperty,
    orientation: new Cesium.VelocityOrientationProperty(positionProperty),
    model: {
      uri: MODEL_URI,
      minimumPixelSize: 28,
      maximumScale: 48,
      scale: 0.32,
      runAnimations: false,
    },
  })

  const hudEntity = viewer.entities.add({
    id: `car-hud-${vehicle.vehicle}`,
    name: `car-hud-${vehicle.vehicle}`,
    position: positionProperty,
    billboard: {
      image: hudA,
      width: 168,
      height: 74,
      pixelOffset: new Cesium.Cartesian2(0, -56),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })

  rt.hudCanvases = [hudA, hudB]
  rt.hudFlip = 0
  rt.hudEntity = hudEntity
  runtimeMap.set(vehicle.vehicle, rt)
  return { travelSeconds, initE, initT }
}

async function runDemo() {
  statusText.value = '加载数据…'
  const [stations, vehicles, matrix, cache] = await Promise.all([
    loadStations(),
    loadVehicles(),
    loadSpeedMatrix(),
    loadFleetRoutes(),
  ])
  speedMatrix.value = matrix
  addedStationIds.clear()
  fleetPlans.value = []

  const byId = new Map(vehicles.map((v) => [v.vehicle, v]))
  const startTime = Cesium.JulianDate.now()
  const stopTime = Cesium.JulianDate.addHours(startTime, 1, new Cesium.JulianDate())
  const cards = []
  let demoList = []

  const mountDemo = async (list) => {
    for (const vehicle of list) {
      const plan = fleetPlans.value.find((p) => p.id === vehicle.vehicle)
      if (!plan) continue
      try {
        const card = await mountFromPlan(plan, vehicle, stations, startTime, stopTime)
        if (card) cards.push(card)
      } catch (err) {
        console.error(`车辆 ${vehicle.vehicle} 启动失败`, err)
      }
    }
  }

  const startPlayback = async () => {
    if (!cards.length) {
      statusText.value = '无可用车辆'
      return false
    }
    statusText.value = 'LIVE'
    fleetCards.value = cards
    focusedId.value = cards[0]?.id ?? null
    if (dispatchId.value == null) dispatchId.value = focusedId.value
    viewer.clock.startTime = startTime.clone()
    viewer.clock.stopTime = startTime.clone()
    viewer.clock.currentTime = startTime.clone()
    viewer.clock.clockRange = Cesium.ClockRange.LOOP
    viewer.clock.multiplier = 2
    viewer.clock.shouldAnimate = true
    syncClockToFleet(startTime)
    if (removeClockTick) {
      removeClockTick()
      removeClockTick = null
    }
    removeClockTick = viewer.clock.onTick.addEventListener(() => {
      syncFleetLiveState()
      if (followingId.value != null) updateFollowCamera()
    })
    syncFleetLiveState()
    bindMapPicks()
    if (viewer.entities.values.length) await viewer.zoomTo(viewer.entities)
    startStationHaloAnimation()
    return true
  }

  if (cache?.items?.length) {
    fleetPlans.value = plansFromCache(cache, vehicles)
    fleetPrepTotal.value = fleetPlans.value.length
    demoList = pickRandomVehicles(fleetPlans.value, 5, byId)
    await mountDemo(demoList)
    await startPlayback()
    if (!cache.items?.[0]?.energy) {
      saveFleetRoutes({
        demoIds: demoList.map((v) => v.vehicle),
        items: fleetPlans.value,
      }).catch(() => {})
    }
    return
  }

  const seed = pickNearbyVehicles(vehicles, stations, 5)
  if (!seed.length) {
    statusText.value = '无可用车辆'
    return
  }
  const fleet50 = pickAroundDemo(vehicles, stations, seed, 50)
  fleetPrepTotal.value = fleet50.length
  const colorById = new Map(fleet50.map((v, i) => [v.vehicle, VEHICLE_COLORS[i % VEHICLE_COLORS.length]]))
  demoList = pickRandomVehicles(fleet50, 5, byId)
  const demoIds = new Set(demoList.map((v) => v.vehicle))

  for (const vehicle of demoList) {
    const color = colorById.get(vehicle.vehicle) || VEHICLE_COLORS[0]
    try {
      await computePlan(vehicle, color, stations)
    } catch (err) {
      console.error(`车辆 ${vehicle.vehicle} 路径规划失败`, err)
    }
  }
  await mountDemo(demoList)
  const playing = await startPlayback()
  if (!playing) return

  const rest = fleet50.filter((v) => !demoIds.has(v.vehicle))
  runPool(rest, 2, async (vehicle) => {
    try {
      const color = colorById.get(vehicle.vehicle) || VEHICLE_COLORS[0]
      await computePlan(vehicle, color, stations)
    } catch (err) {
      console.error(`车辆 ${vehicle.vehicle} 预计算失败`, err)
    }
  })
    .catch((err) => console.error(err))
    .finally(async () => {
      fleetPrepTotal.value = Math.max(fleetPlans.value.length, 1)
      await saveFleetRoutes({
        demoIds: demoList.map((v) => v.vehicle),
        items: fleetPlans.value,
      })
    })
}

onMounted(async () => {
  window.addEventListener('keydown', onDispatchKey)
  const layerOpts = {
    minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
    magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
  }
  let baseLayer
  try {
    const ionProvider = await Cesium.createWorldImageryAsync({
      style: Cesium.IonWorldImageryStyle.ROAD,
    })
    baseLayer = new Cesium.ImageryLayer(ionProvider, layerOpts)
  } catch (err) {
    console.warn('Ion 路网底图不可用，回退 OSM', err)
    const osm = new Cesium.UrlTemplateImageryProvider({
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: ['a', 'b', 'c'],
      maximumLevel: 19,
      enablePickFeatures: false,
    })
    baseLayer = new Cesium.ImageryLayer(osm, layerOpts)
  }
  viewer = new Cesium.Viewer(cesiumContainer.value, {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    baseLayer,
    useBrowserRecommendedResolution: true,
    msaaSamples: 2,
    contextOptions: {
      webgl: {
        antialias: true,
      },
    },
  })

  viewer.scene.globe.depthTestAgainstTerrain = false
  viewer.scene.fog.enabled = false
  viewer.scene.skyAtmosphere.show = true
  viewer.scene.globe.enableLighting = false
  viewer.scene.globe.maximumScreenSpaceError = 2
  viewer.scene.globe.tileCacheSize = 2000
  viewer.scene.globe.preloadSiblings = true
  viewer.scene.globe.preloadAncestors = true
  viewer.scene.globe.loadingDescendantLimit = 20
  if (Cesium.RequestScheduler) {
    Cesium.RequestScheduler.maximumRequests = 64
    Cesium.RequestScheduler.maximumRequestsPerServer = 12
  }
  viewer.shadows = false
  viewer.terrainShadows = Cesium.ShadowMode.DISABLED
  if (viewer.scene.postProcessStages?.fxaa) {
    viewer.scene.postProcessStages.fxaa.enabled = false
  }
  viewer.useBrowserRecommendedResolution = true
  viewer.resolutionScale = 1
  viewer.targetFrameRate = 60
  viewer.scene.requestRenderMode = false
  viewer.scene.rethrowRenderErrors = false

  const widget = viewer.cesiumWidget
  if (widget?.resize) {
    const origResize = widget.resize.bind(widget)
    widget.resize = () => {
      if (!mapSizeOk()) return
      origResize()
    }
  }
  const origSceneRender = viewer.scene.render.bind(viewer.scene)
  viewer.scene.render = (time) => {
    if (!mapSizeOk()) return
    origSceneRender(time)
  }
  viewer.scene.renderError.addEventListener(() => {
    requestAnimationFrame(recoverCesiumRender)
  })

  if (typeof ResizeObserver !== 'undefined' && cesiumContainer.value) {
    const ro = new ResizeObserver(() => {
      safeViewerResize()
      recoverCesiumRender()
    })
    ro.observe(cesiumContainer.value)
    removeResizeObserver = () => ro.disconnect()
  }
  window.addEventListener('resize', safeViewerResize)
  safeViewerResize()
  requestAnimationFrame(safeViewerResize)

  // 去掉右下角 Cesium / ion 标志与版权文字
  if (viewer.cesiumWidget?.creditContainer) {
    viewer.cesiumWidget.creditContainer.style.display = 'none'
  }
  const creditHost = cesiumContainer.value?.querySelector?.('.cesium-viewer-bottom')
  if (creditHost) creditHost.style.display = 'none'

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-73.974867, 40.609883, 1029.2),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-45),
      roll: 0,
    },
  })

  try {
    await runDemo()
  } catch (error) {
    console.error('演示加载失败:', error)
    statusText.value = '加载失败'
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onDispatchKey)
  window.removeEventListener('resize', safeViewerResize)
  if (removeResizeObserver) {
    removeResizeObserver()
    removeResizeObserver = null
  }
  if (removeHaloTick) {
    removeHaloTick()
    removeHaloTick = null
  }
  if (removeClockTick) {
    removeClockTick()
    removeClockTick = null
  }
  if (removeFollowTick) {
    removeFollowTick()
    removeFollowTick = null
  }
  followingId.value = null
  stationHalos = []
  runtimeMap.clear()
  if (viewer && !viewer.isDestroyed()) {
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
    viewer.destroy()
  }
  viewer = null
})
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Rajdhani:wght@500;600;700&display=swap');

html,
body,
#app {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #04080f;
}

.app-root {
  --cyan: #00e8ff;
  --amber: #ffb020;
  --green: #2ee59d;
  --pink: #ff6b9d;
  --panel: rgba(6, 14, 28, 0.78);
  --line: rgba(0, 232, 255, 0.28);
  --text: #d7f7ff;
  --muted: #6f8fa3;
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 360px 1fr 372px;
  grid-template-rows: 72px 1fr;
  grid-template-areas:
    'top top top'
    'left map right';
  gap: 10px;
  padding: 10px;
  box-sizing: border-box;
  background:
    radial-gradient(1200px 600px at 50% -10%, rgba(0, 120, 160, 0.18), transparent 60%),
    radial-gradient(800px 500px at 10% 100%, rgba(255, 176, 32, 0.08), transparent 50%),
    linear-gradient(160deg, #03070e 0%, #07131f 45%, #050b14 100%);
  font-family: 'Rajdhani', 'Segoe UI', sans-serif;
  color: var(--text);
}

.scanlines {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 30;
  opacity: 0.18;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent 3px,
    rgba(0, 0, 0, 0.12) 4px
  );
  /* 去掉 mix-blend-mode，减少每帧合成开销 */
}

.vignette {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 25;
  background: radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.55) 100%);
}

.hud-top {
  grid-area: top;
  z-index: 20;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 18px;
  border: 1px solid var(--line);
  background: linear-gradient(90deg, rgba(0, 40, 55, 0.65), rgba(8, 18, 32, 0.75));
  box-shadow: 0 0 24px rgba(0, 232, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px));
  animation: panelIn 0.7s ease both;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-self: start;
}

.brand-mark {
  width: 14px;
  height: 38px;
  background: linear-gradient(180deg, var(--cyan), transparent);
  box-shadow: 0 0 18px var(--cyan);
  animation: pulseBar 2.2s ease-in-out infinite;
}

.brand-title {
  font-family: 'Rajdhani', 'Microsoft YaHei', 'PingFang SC', sans-serif;
  font-size: 16px;
  letter-spacing: 0.06em;
  color: #fff;
  text-shadow: 0 0 18px rgba(0, 232, 255, 0.55);
  line-height: 1.25;
}

.brand-sub {
  font-size: 12px;
  color: var(--muted);
  letter-spacing: 0.12em;
}

.top-stats {
  display: flex;
  gap: 10px;
  justify-self: end;
}

.dispatch-center-btn {
  justify-self: center;
  min-width: 148px;
  padding: 8px 22px;
  border: 1px solid rgba(255, 176, 32, 0.55);
  background: rgba(40, 28, 8, 0.55);
  color: var(--amber);
  font-family: 'Orbitron', sans-serif;
  font-size: 15px;
  letter-spacing: 0.18em;
  cursor: pointer;
}

.dispatch-center-btn:hover {
  box-shadow: 0 0 18px rgba(255, 176, 32, 0.35);
  color: #ffd27a;
}

.chip {
  min-width: 96px;
  padding: 6px 12px;
  border: 1px solid rgba(0, 232, 255, 0.2);
  background: rgba(0, 20, 30, 0.55);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chip.accent {
  border-color: rgba(46, 229, 157, 0.45);
  box-shadow: 0 0 16px rgba(46, 229, 157, 0.15);
}

.chip-k {
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--muted);
}

.chip-v {
  font-family: 'Orbitron', sans-serif;
  font-size: 14px;
  color: var(--cyan);
}

.chip-v small {
  font-size: 10px;
  margin-left: 3px;
  color: var(--muted);
}

.panel {
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--line);
  background: rgba(6, 14, 28, 0.92);
  box-shadow: inset 0 0 40px rgba(0, 232, 255, 0.04);
  position: relative;
  overflow: hidden;
}

.panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: -40%;
  width: 40%;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--cyan), transparent);
  animation: sweep 3.5s linear infinite;
}

.hud-left {
  grid-area: left;
  animation: slideLeft 0.75s ease both;
  overflow: hidden;
  box-shadow:
    0 0 28px rgba(0, 232, 255, 0.14),
    inset 0 0 40px rgba(0, 232, 255, 0.06);
}

.hud-left,
.hud-left .fleet-list,
.hud-left .metro-mini,
.hud-left .metro-detail {
  scrollbar-width: none;
}

.hud-left::-webkit-scrollbar,
.hud-left *::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.hud-right {
  grid-area: right;
  animation: slideRight 0.75s ease both;
  overflow-x: hidden;
  overflow-y: auto;
  box-shadow:
    0 0 28px rgba(0, 232, 255, 0.14),
    inset 0 0 40px rgba(0, 232, 255, 0.06);
  scrollbar-width: none;
}

.hud-right::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.overview-kpis {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  padding: 10px 12px 0;
}

.kpi {
  padding: 8px 8px 7px;
  border: 1px solid rgba(0, 232, 255, 0.28);
  background: linear-gradient(180deg, rgba(0, 60, 80, 0.35), rgba(0, 16, 28, 0.55));
  text-align: center;
  box-shadow: 0 0 16px rgba(0, 232, 255, 0.12);
}

.kpi.accent {
  border-color: rgba(46, 229, 157, 0.55);
  box-shadow: 0 0 18px rgba(46, 229, 157, 0.22);
}

.kpi.hot {
  border-color: rgba(255, 176, 32, 0.5);
  box-shadow: 0 0 18px rgba(255, 176, 32, 0.18);
}

.kpi-k {
  display: block;
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--muted);
}

.kpi-v {
  display: block;
  margin-top: 2px;
  font-family: 'Orbitron', sans-serif;
  font-size: 26px;
  color: var(--cyan);
  line-height: 1.05;
  text-shadow: 0 0 12px rgba(0, 232, 255, 0.65);
}

.kpi.accent .kpi-v {
  color: var(--green);
  text-shadow: 0 0 12px rgba(46, 229, 157, 0.7);
}

.kpi.hot .kpi-v {
  color: var(--amber);
  text-shadow: 0 0 12px rgba(255, 176, 32, 0.65);
}

.kpi-s {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: var(--muted);
}

.overview-list {
  flex: 0 0 auto;
  overflow: visible;
  padding: 6px 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.overview-row {
  display: grid;
  grid-template-columns: 8px 1fr;
  gap: 8px;
  align-items: stretch;
  width: 100%;
  text-align: left;
  border: 1px solid rgba(0, 232, 255, 0.2);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--accent, var(--cyan)) 16%, transparent),
    rgba(0, 12, 22, 0.55)
  );
  color: inherit;
  padding: 8px 10px;
  cursor: pointer;
  font: inherit;
}

.overview-row.active {
  border-color: var(--accent, var(--cyan));
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent, var(--cyan)) 40%, transparent);
}

.overview-row.done {
  border-color: rgba(46, 229, 157, 0.4);
}

.ov-led {
  width: 6px;
  border-radius: 99px;
  background: var(--amber);
  box-shadow: 0 0 10px var(--amber);
  animation: ledPulse 1.4s ease-in-out infinite;
}

.overview-row.done .ov-led {
  background: var(--green);
  box-shadow: 0 0 10px var(--green);
  animation: none;
}

.overview-row.active .ov-led {
  background: var(--cyan);
  box-shadow: 0 0 12px var(--cyan);
}

@keyframes ledPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.ov-main {
  min-width: 0;
}

.ov-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.ov-id {
  font-family: 'Orbitron', sans-serif;
  color: var(--accent, var(--cyan));
  font-size: 14px;
  text-shadow: 0 0 8px color-mix(in srgb, var(--accent, var(--cyan)) 50%, transparent);
}

.ov-tag {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--amber);
}

.overview-row.done .ov-tag {
  color: var(--green);
}

.ov-meters {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
}

.ov-meter-row {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 6px;
  align-items: center;
}

.ov-meter-row span {
  font-size: 9px;
  letter-spacing: 0.08em;
  color: #6f8fa3;
}

.ov-meter {
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.ov-meter i {
  display: block;
  height: 100%;
  width: 0;
  transition: width 0.35s ease;
}

.ov-meter.e i {
  background: linear-gradient(90deg, #00667a, var(--cyan));
  box-shadow: 0 0 8px rgba(0, 232, 255, 0.8);
}

.ov-meter.t i {
  background: linear-gradient(90deg, #7a5200, var(--amber));
  box-shadow: 0 0 8px rgba(255, 176, 32, 0.7);
}

.ov-nums {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 11px;
  color: #9fd4e8;
  letter-spacing: 0.04em;
}

.dispatch-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: rgba(2, 6, 12, 0.72);
  box-sizing: border-box;
}

.dispatch-modal {
  width: min(1280px, 100%);
  height: min(880px, 100%);
  z-index: 81;
  animation: none;
}

.dispatch-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.dispatch-head .panel-head {
  border-bottom: 0;
  flex: 1;
}

.dispatch-head-actions {
  display: flex;
  gap: 8px;
  margin: 14px 16px 0 0;
}

.dispatch-close {
  margin: 0;
  padding: 6px 12px;
  border: 1px solid rgba(0, 232, 255, 0.35);
  background: transparent;
  color: var(--cyan);
  cursor: pointer;
  font-family: 'Rajdhani', sans-serif;
  letter-spacing: 0.12em;
}

.dispatch-pick {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px 8px;
}

.dispatch-pick-label {
  flex-shrink: 0;
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--muted);
}

.dispatch-pick-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dispatch-pick-btn {
  min-width: 56px;
  padding: 6px 10px;
  border: 1px solid rgba(0, 232, 255, 0.22);
  background: rgba(0, 16, 28, 0.55);
  color: #8fb0c4;
  font-family: 'Orbitron', sans-serif;
  font-size: 12px;
  letter-spacing: 0.06em;
  cursor: pointer;
}

.dispatch-pick-btn:hover,
.dispatch-pick-btn.active {
  color: var(--accent, var(--cyan));
  border-color: var(--accent, var(--cyan));
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent, var(--cyan)) 35%, transparent);
}

.dispatch-fleet-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px 10px;
}

.dispatch-fleet-btn {
  padding: 7px 14px;
  border: 1px solid rgba(255, 176, 32, 0.5);
  background: rgba(40, 28, 8, 0.45);
  color: var(--amber);
  font-family: 'Rajdhani', sans-serif;
  letter-spacing: 0.12em;
  cursor: pointer;
}

.dispatch-fleet-btn:hover:not(:disabled) {
  color: #ffd27a;
  box-shadow: 0 0 14px rgba(255, 176, 32, 0.28);
}

.dispatch-fleet-btn:disabled {
  opacity: 0.55;
  cursor: default;
  color: var(--muted);
  border-color: rgba(111, 143, 163, 0.35);
}

.fleet-progress {
  flex: 1;
  height: 6px;
  border: 1px solid rgba(255, 176, 32, 0.28);
  background: rgba(0, 12, 22, 0.55);
  overflow: hidden;
}

.fleet-progress-fill {
  height: 100%;
  width: 0;
  background: linear-gradient(90deg, #7a5200, var(--amber));
  transition: width 0.25s ease;
}

.dispatch-pane {
  min-height: 0;
}

.hud-right .block {
  flex: 0 0 auto;
}

.right-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
  padding: 10px 12px 0;
}

.right-tab {
  border: 1px solid rgba(0, 232, 255, 0.22);
  background: rgba(0, 16, 28, 0.55);
  color: #6f8fa3;
  font-family: 'Rajdhani', 'Segoe UI', sans-serif;
  font-size: 13px;
  letter-spacing: 0.1em;
  padding: 7px 8px;
  cursor: pointer;
  transition: 0.2s ease;
}

.right-tab:hover,
.right-tab.active {
  color: #00e8ff;
  border-color: rgba(0, 232, 255, 0.55);
  box-shadow: 0 0 14px rgba(0, 232, 255, 0.16);
  background: rgba(0, 40, 55, 0.45);
}

.right-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-head {
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(0, 232, 255, 0.15);
}

.panel-tag {
  font-family: 'Orbitron', sans-serif;
  font-size: 11px;
  color: var(--amber);
  letter-spacing: 0.2em;
}

.panel-head h2 {
  margin: 4px 0 0;
  font-family: 'Orbitron', sans-serif;
  font-size: 15px;
  letter-spacing: 0.08em;
}

.panel-head p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--muted);
  letter-spacing: 0.12em;
}

.fleet-list {
  flex: 1;
  overflow: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fleet-item {
  position: relative;
  border: 1px solid color-mix(in srgb, var(--accent, var(--cyan)) 38%, rgba(0, 232, 255, 0.18));
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent, var(--cyan)) 22%, transparent), transparent 28%),
    radial-gradient(140px 50px at 100% 0%, color-mix(in srgb, var(--accent, var(--cyan)) 18%, transparent), transparent 70%),
    linear-gradient(180deg, rgba(0, 28, 42, 0.78), rgba(8, 16, 28, 0.92));
  overflow: visible;
  cursor: pointer;
  box-shadow: 0 0 14px color-mix(in srgb, var(--accent, var(--cyan)) 16%, transparent);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.fleet-item:hover {
  box-shadow: 0 0 20px color-mix(in srgb, var(--accent, var(--cyan)) 32%, transparent);
}

.fleet-item.active,
.fleet-item.following {
  border-color: var(--accent, var(--cyan));
  box-shadow: 0 0 22px color-mix(in srgb, var(--accent, var(--cyan)) 42%, transparent);
}

.fleet-item.done {
  border-color: rgba(46, 229, 157, 0.45);
}

.card-frame {
  position: absolute;
  width: 12px;
  height: 12px;
  pointer-events: none;
  z-index: 2;
  border: 1.5px solid var(--accent, var(--cyan));
  filter: drop-shadow(0 0 4px var(--accent, var(--cyan)));
}

.card-frame.tl {
  top: 4px;
  left: 4px;
  border-right: none;
  border-bottom: none;
}

.card-frame.tr {
  top: 4px;
  right: 4px;
  border-left: none;
  border-bottom: none;
}

.card-frame.bl {
  bottom: 4px;
  left: 4px;
  border-right: none;
  border-top: none;
}

.card-frame.br {
  bottom: 4px;
  right: 4px;
  border-left: none;
  border-top: none;
}

.fleet-item.following .follow-tag {
  flex: 0 0 auto;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--amber);
  text-shadow: 0 0 8px rgba(255, 176, 32, 0.7);
}

.fleet-card {
  position: relative;
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 10px 14px 10px 14px;
  box-sizing: border-box;
}

.fleet-item.active .fleet-card {
  padding-bottom: 6px;
}

.fleet-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent, var(--cyan));
  box-shadow: 0 0 10px var(--accent, var(--cyan));
}

.fleet-live {
  margin: 8px 14px 0;
  padding: 6px 8px;
  width: auto;
  max-width: none;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent, var(--cyan)) 28%, transparent);
  background: rgba(0, 8, 16, 0.35);
}

.fleet-live-nums {
  display: flex;
  align-items: baseline;
  gap: 4px 8px;
  margin-bottom: 5px;
  font-family: 'Orbitron', sans-serif;
}

.fleet-live-nums b {
  font-size: 13px;
  color: var(--cyan);
  text-shadow: 0 0 8px rgba(0, 232, 255, 0.55);
}

.fleet-live-nums b:nth-of-type(2) {
  color: var(--amber);
  text-shadow: 0 0 8px rgba(255, 176, 32, 0.5);
}

.fleet-live-nums small {
  font-size: 10px;
  color: var(--muted);
  letter-spacing: 0.06em;
}

.fleet-live-bars {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
}

.fleet-card-top {
  display: flex;
  justify-content: flex-start;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 10px;
  padding-right: 28px;
}

.metro-mini {
  margin-top: 8px;
  overflow: visible;
  padding: 4px 2px 0;
  background: radial-gradient(180px 40px at 50% 0%, color-mix(in srgb, var(--accent, var(--cyan)) 12%, transparent), transparent 70%);
}

.metro-detail {
  padding: 6px 12px 14px 12px;
  border-top: 1px dashed color-mix(in srgb, var(--accent, var(--cyan)) 40%, rgba(0, 232, 255, 0.16));
  overflow: visible;
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent, var(--cyan)) 10%, transparent), transparent 50%);
}

.metro-sum {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--cyan);
  letter-spacing: 0.06em;
  text-shadow: 0 0 8px rgba(0, 232, 255, 0.35);
}

.metro-legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 8px;
  font-size: 10px;
  color: var(--muted);
}

.lg-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.lg-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-sizing: border-box;
  border: 2px solid rgba(130, 160, 176, 0.7);
  background: #08141f;
  flex: 0 0 auto;
}

.lg-dot.arrived {
  border-color: var(--green);
}

.lg-dot.current {
  background: var(--cyan);
  border-color: var(--cyan);
}

.lg-dot.next {
  border-color: var(--amber);
}

.metro-line {
  display: flex;
  flex-direction: column;
}

.metro-stop {
  display: grid;
  grid-template-columns: 14px 1fr;
  column-gap: 10px;
  align-items: center;
  min-height: 24px;
}

.metro-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid rgba(111, 143, 163, 0.5);
  background: transparent;
  justify-self: center;
}

.metro-stop.arrived .metro-dot {
  background: var(--green);
  border-color: var(--green);
}

.metro-stop.current .metro-dot {
  background: var(--cyan);
  border-color: var(--cyan);
}

.metro-stop.next .metro-dot {
  background: var(--amber);
  border-color: var(--amber);
}

.metro-stop-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.metro-stop-meta b {
  font-size: 12px;
  font-weight: 600;
}

.metro-stop-meta small {
  font-size: 11px;
  color: var(--muted);
}

.metro-stop.arrived .metro-stop-meta small {
  color: var(--green);
}

.metro-stop.current .metro-stop-meta small {
  color: var(--cyan);
}

.metro-stop.next .metro-stop-meta small {
  color: var(--amber);
}

.metro-seg {
  width: 2px;
  height: 12px;
  margin: 0 0 0 6px;
  background: rgba(111, 143, 163, 0.28);
}

.metro-seg.passed {
  background: var(--green);
}

.metro-seg.transit {
  width: 16px;
  height: 14px;
  margin-left: 0;
  background: transparent;
}

.metro-arrows {
  display: flex;
  gap: 2px;
  align-items: center;
  height: 14px;
}

.metro-arrows i {
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 4px 0 4px 6px;
  border-color: transparent transparent transparent var(--cyan);
  opacity: 0.25;
  animation: metroFlow 0.9s linear infinite;
}

.metro-arrows i:nth-child(2) {
  animation-delay: 0.15s;
}

.metro-arrows i:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes metroFlow {
  0%,
  100% {
    opacity: 0.15;
    transform: translateX(-2px);
  }
  50% {
    opacity: 1;
    transform: translateX(2px);
  }
}

.vid {
  font-family: 'Orbitron', sans-serif;
  color: var(--accent, var(--cyan));
  font-size: 16px;
  text-shadow: 0 0 10px color-mix(in srgb, var(--accent, var(--cyan)) 70%, transparent);
}

.path-mini {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: #9fd4e8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meter + .meter {
  margin-top: 8px;
}

.meter-label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-bottom: 4px;
  color: var(--muted);
}

.meter-label b {
  color: var(--text);
  font-weight: 600;
}

.meter-track {
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.meter-fill {
  height: 100%;
  width: 0;
  transition: width 0.35s ease;
  position: relative;
}

.meter-fill.energy {
  background: linear-gradient(90deg, #00667a, var(--cyan));
  box-shadow: 0 0 10px rgba(0, 232, 255, 0.55);
}

.meter-fill.time {
  background: linear-gradient(90deg, #7a5200, var(--amber));
  box-shadow: 0 0 10px rgba(255, 176, 32, 0.45);
}

.fleet-index {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  font-family: 'Orbitron', sans-serif;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--accent, var(--cyan));
  opacity: 0.85;
  pointer-events: none;
  line-height: 1;
  text-shadow: 0 0 8px color-mix(in srgb, var(--accent, var(--cyan)) 55%, transparent);
}

.map-stage {
  grid-area: map;
  position: relative;
  z-index: 5;
  min-width: 240px;
  min-height: 200px;
  border: 1px solid rgba(0, 232, 255, 0.22);
  overflow: hidden;
  box-shadow: 0 0 40px rgba(0, 232, 255, 0.08);
  animation: mapIn 0.9s ease both;
}

.cesiumContainer {
  width: 100%;
  height: 100%;
  outline: none;
}

.cesiumContainer :deep(canvas) {
  outline: none;
  image-rendering: auto;
}

.cesiumContainer :deep(.cesium-viewer-bottom),
.cesiumContainer :deep(.cesium-viewer-toolbar),
.cesiumContainer :deep(.cesium-credit-logoContainer),
.cesiumContainer :deep(.cesium-credit-textContainer),
.cesiumContainer :deep(.cesium-widget-credits) {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

.map-frame {
  position: absolute;
  width: 28px;
  height: 28px;
  z-index: 6;
  pointer-events: none;
  border: 2px solid var(--cyan);
  box-shadow: 0 0 12px rgba(0, 232, 255, 0.45);
}

.map-frame.tl {
  top: 10px;
  left: 10px;
  border-right: none;
  border-bottom: none;
}

.map-frame.tr {
  top: 10px;
  right: 10px;
  border-left: none;
  border-bottom: none;
}

.map-frame.bl {
  bottom: 10px;
  left: 10px;
  border-right: none;
  border-top: none;
}

.map-frame.br {
  bottom: 10px;
  right: 10px;
  border-left: none;
  border-top: none;
}

.map-hint {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  z-index: 7;
  padding: 8px 16px;
  font-size: 12px;
  letter-spacing: 0.14em;
  color: var(--cyan);
  background: rgba(0, 10, 20, 0.72);
  border: 1px solid rgba(0, 232, 255, 0.35);
  pointer-events: none;
  text-align: center;
  animation: hintPulse 2.4s ease-in-out infinite;
}

.hint-sub {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--muted);
}

.gauge-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 12px 12px 4px;
}

.ring-gauge {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.ring-gauge svg {
  width: 110px;
  height: 110px;
  transform: rotate(-90deg);
}

.ring-bg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 8;
}

.ring-fg {
  fill: none;
  stroke-width: 8;
  stroke-linecap: round;
  stroke-dasharray: 301.6;
  transition: stroke-dashoffset 0.35s ease;
  filter: drop-shadow(0 0 6px currentColor);
}

.energy-ring {
  stroke: var(--cyan);
}

.time-ring {
  stroke: var(--amber);
}

.ring-center {
  position: absolute;
  top: 34px;
  text-align: center;
}

.ring-val {
  font-family: 'Orbitron', sans-serif;
  font-size: 16px;
}

.ring-unit {
  font-size: 10px;
  color: var(--muted);
  letter-spacing: 0.1em;
}

.ring-caption {
  margin-top: 2px;
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--muted);
  text-transform: uppercase;
}

.block {
  margin: 8px 12px;
  padding: 10px;
  border: 1px solid rgba(0, 232, 255, 0.14);
  background: rgba(0, 12, 22, 0.45);
}

.block.grow {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
}

.block-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 8px;
  color: var(--text);
}

.block-meta {
  color: var(--muted);
  font-size: 11px;
}

.spark {
  width: 100%;
  height: 90px;
  display: block;
}

.spark-line {
  stroke-width: 2;
  filter: drop-shadow(0 0 4px currentColor);
}

.spark-line.reward {
  stroke: var(--green);
}

.spark-line.loss {
  stroke: var(--pink);
}

.spark-zero {
  stroke: rgba(255, 255, 255, 0.12);
  stroke-dasharray: 4 4;
}

.legend {
  display: flex;
  gap: 14px;
  margin-top: 6px;
  font-size: 11px;
  letter-spacing: 0.1em;
}

.lg-r {
  color: var(--green);
}

.lg-l {
  color: var(--pink);
}

.speed-list {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-right: 2px;
}

.speed-row {
  display: grid;
  grid-template-columns: 56px 1fr 72px;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background 0.25s ease;
}

.speed-row.hot {
  background: rgba(0, 232, 255, 0.08);
  box-shadow: inset 3px 0 0 var(--cyan);
}

.seg-label {
  color: var(--muted);
  font-family: 'Orbitron', sans-serif;
  font-size: 10px;
}

.seg-bar-wrap {
  height: 7px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.seg-bar {
  height: 100%;
  background: linear-gradient(90deg, #1a4d7a, var(--cyan));
  box-shadow: 0 0 8px rgba(0, 232, 255, 0.5);
  transition: width 0.4s ease;
  animation: barGlow 2s ease-in-out infinite;
}

.seg-val {
  text-align: right;
  font-family: 'Orbitron', sans-serif;
  font-size: 11px;
  color: var(--cyan);
}

.seg-val small {
  color: var(--muted);
  font-size: 9px;
}

.empty-right {
  padding: 40px 16px;
  text-align: center;
  color: var(--muted);
  letter-spacing: 0.12em;
}

@keyframes sweep {
  0% {
    left: -40%;
  }
  100% {
    left: 120%;
  }
}

@keyframes pulseBar {
  0%,
  100% {
    opacity: 0.55;
    transform: scaleY(0.85);
  }
  50% {
    opacity: 1;
    transform: scaleY(1);
  }
}

@keyframes hintPulse {
  0%,
  100% {
    opacity: 0.7;
  }
  50% {
    opacity: 1;
  }
}

@keyframes barGlow {
  0%,
  100% {
    filter: brightness(1);
  }
  50% {
    filter: brightness(1.25);
  }
}

@keyframes panelIn {
  from {
    opacity: 0;
    transform: translateY(-12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes slideLeft {
  from {
    opacity: 0;
    transform: translateX(-24px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes slideRight {
  from {
    opacity: 0;
    transform: translateX(24px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes mapIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (max-width: 1200px) {
  .app-root {
    grid-template-columns: 240px 1fr 280px;
  }

  .top-stats .chip:nth-child(2),
  .top-stats .chip:nth-child(3) {
    display: none;
  }
}

@media (max-width: 900px) {
  .app-root {
    grid-template-columns: 1fr;
    grid-template-rows: 64px 180px 1fr 220px;
    grid-template-areas:
      'top'
      'left'
      'map'
      'right';
  }
}
</style>
