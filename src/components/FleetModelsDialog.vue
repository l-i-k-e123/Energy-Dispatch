<template>
  <div class="mask" @click.self="emit('close')">
    <div class="box panel" role="dialog" aria-modal="true">
      <div class="head">
        <div>
          <span class="tag">FLEET</span>
          <h2>显示全部车辆</h2>
          <p class="count">{{ spawnedCount }} / {{ plans.length }} 辆</p>
        </div>
        <button type="button" class="close" @click="emit('close')">关闭</button>
      </div>
      <div class="stage">
        <div ref="hostRef" class="cesium-host"></div>
        <div
          v-if="hudCard"
          class="car-hud-card"
          :style="{
            left: `${hudCard.x}px`,
            top: `${hudCard.y}px`,
            '--accent': hudCard.color,
          }"
        >
          <div class="hud-top">
            <span class="hud-id">V{{ hudCard.id }}</span>
            <div class="hud-nums">
              <span>{{ hudCard.energy.toFixed(1) }} kWh</span>
              <span class="hud-time">{{ hudCard.time.toFixed(2) }} h left</span>
            </div>
          </div>
          <div class="hud-k">ENERGY</div>
          <div class="hud-bar">
            <i class="hud-fill energy" :style="{ width: `${hudCard.ePct}%` }"></i>
          </div>
          <div class="hud-k">TIME LEFT</div>
          <div class="hud-bar">
            <i class="hud-fill time" :style="{ width: `${hudCard.tPct}%` }"></i>
          </div>
        </div>
      </div>
      <div v-if="spawnPct < 100" class="loadbar">
        <div class="loadbar-fill" :style="{ width: `${spawnPct}%` }"></div>
      </div>
      <div class="hint" v-if="followId != null">跟随中 · V{{ followId }} · 再次点击或右键取消</div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import * as Cesium from 'cesium'
import { sampleVehicleState } from '@/utils/demoVehicles'

const props = defineProps({
  plans: { type: Array, default: () => [] },
})
const emit = defineEmits(['close'])

const MODEL_URI = '/modles/mitsubishi_evo.glb'
const DEMO_SPEED_MPS = 40
const ENERGY_CAP = 100
const CAR_HEIGHT = 1.2

const hostRef = ref(null)
const followId = ref(null)
const spawnPct = ref(0)
const hudCard = ref(null)
const spawnedCount = ref(0)

Cesium.Ion.defaultAccessToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1NjNiYTVhMi0zYWIwLTQ3NWYtYmQyNi02NmQ2OTVhMmVjZTIiLCJpZCI6MzQzMDUxLCJpYXQiOjE3NTgzNDkxOTR9.S1ytE242IAC1WOyFRe1b3YyMdVfpfUxBQ16zHjvDurc'

let viewer = null
let removeTick = null
const runtime = new Map()
const followScratch = {
  pos: new Cesium.Cartesian3(),
  transform: new Cesium.Matrix4(),
  offset: new Cesium.Cartesian3(0, -3600, 2350),
  win: new Cesium.Cartesian2(),
}

function flattenDegreesArray(coordinates) {
  const arr = []
  for (const [lon, lat] of coordinates) arr.push(lon, lat, CAR_HEIGHT)
  return arr
}

/** 去掉无效点、重复点，避免零长度段让车飞出折线 */
function cleanRouteCoords(coordinates) {
  const out = []
  for (const pt of coordinates || []) {
    const lon = Number(pt?.[0])
    const lat = Number(pt?.[1])
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
    if (lon < -78 || lon > -70 || lat < 39 || lat > 42.5) continue
    const prev = out[out.length - 1]
    if (prev && Math.abs(prev[0] - lon) < 1e-6 && Math.abs(prev[1] - lat) < 1e-6) continue
    out.push([lon, lat])
  }
  return out
}

function posAtDist(positions, segLens, totalDist, dist, result) {
  const d = Math.min(totalDist, Math.max(0, dist))
  const i1 = indexAtDist(segLens, d)
  const i0 = Math.max(0, i1 - 1)
  const span = Math.max(segLens[i1] - segLens[i0], 1e-6)
  const t = (d - segLens[i0]) / span
  return Cesium.Cartesian3.lerp(positions[i0], positions[i1], t, result || new Cesium.Cartesian3())
}

function routePhase(planId) {
  return (((Number(planId) * 17 + 8) % 97) / 97) * 0.9
}

function indexAtDist(segLens, dist) {
  let lo = 0
  let hi = segLens.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (segLens[mid] < dist) lo = mid + 1
    else hi = mid
  }
  return Math.max(1, lo)
}

/** 与主地图相同：在车投影点切开已走/未走折线，路线贴地不穿车身 */
function applySplit(rt, i0, t, mid) {
  const positions = rt.routePositions
  const n = positions.length
  const passed = rt.passedPos
  const remain = rt.remainPos
  passed.length = 0
  remain.length = 0
  if (n < 2) return
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
  const i1 = indexAtDist(rt.segLens, target)
  const i0 = Math.max(0, i1 - 1)
  const span = Math.max(rt.segLens[i1] - rt.segLens[i0], 1e-6)
  const t = Cesium.Math.clamp((target - rt.segLens[i0]) / span, 0, 1)
  Cesium.Cartesian3.lerp(positions[i0], positions[i1], t, rt.midScratch)
  applySplit(rt, i0, t, rt.midScratch)
}

function updateAllRouteSplits() {
  if (!viewer || viewer.isDestroyed()) return
  const now = viewer.clock.currentTime
  for (const rt of runtime.values()) {
    const elapsed = Cesium.JulianDate.secondsDifference(now, rt.start)
    const travel = Math.max(rt.travelSeconds, 1e-3)
    const progress = (elapsed / travel + (rt.phase || 0)) % 1
    updateSplitRoute(rt, progress)
  }
}

function vehicleIdFromPick(picked) {
  const ent = picked?.id
  const sid = typeof ent === 'string' ? ent : ent?.id
  if (typeof sid !== 'string') return null
  const m = sid.match(/^all-(?:car-|hud-)?(\d+)$/)
  return m ? Number(m[1]) : null
}

function getRt(id) {
  if (id == null) return null
  return runtime.get(Number(id)) || runtime.get(id)
}

function stopFollow() {
  followId.value = null
  hudCard.value = null
  if (!viewer || viewer.isDestroyed()) return
  viewer.trackedEntity = undefined
  try {
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
  } catch {
    /* ignore */
  }
}

function updateFollow() {
  if (!viewer || followId.value == null) return
  const rt = getRt(followId.value)
  const entity = rt?.carEntity
  if (!entity?.position) return
  const pos = entity.position.getValue(viewer.clock.currentTime, followScratch.pos)
  if (!Cesium.defined(pos)) return
  Cesium.Transforms.eastNorthUpToFixedFrame(pos, undefined, followScratch.transform)
  viewer.camera.lookAtTransform(followScratch.transform, followScratch.offset)
}

function updateHudCard() {
  const rt = getRt(followId.value)
  if (!rt || !viewer || viewer.isDestroyed()) {
    hudCard.value = null
    return
  }
  const now = viewer.clock.currentTime
  const pos = rt.carEntity?.position?.getValue(now, followScratch.pos)
  if (!Cesium.defined(pos)) return
  const win = viewer.scene.cartesianToCanvasCoordinates(pos, followScratch.win)
  const elapsed = Cesium.JulianDate.secondsDifference(now, rt.start)
  const progress = (elapsed / Math.max(rt.travelSeconds, 1e-3) + (rt.phase || 0)) % 1
  const state = sampleVehicleState(rt.vehicle, progress)
  const energy = state.energy ?? rt.initEnergy ?? 0
  const time = state.time ?? rt.initTime ?? 0
  const eCap = Math.max(ENERGY_CAP, rt.initEnergy || 0, energy)
  const tCap = Math.max(rt.initTime || 0.01, 0.01)
  const host = hostRef.value
  const x = Cesium.defined(win) ? win.x : host?.clientWidth / 2 || 0
  const y = Cesium.defined(win) ? win.y : host?.clientHeight * 0.42 || 0
  hudCard.value = {
    id: rt.id,
    color: rt.color,
    energy,
    time,
    ePct: Math.min(100, (energy / eCap) * 100),
    tPct: Math.min(100, (time / tCap) * 100),
    x,
    y,
  }
}

function focusCar(id) {
  const nid = Number(id)
  if (followId.value === nid) {
    stopFollow()
    return
  }
  followId.value = nid
  if (viewer) viewer.trackedEntity = undefined
  try {
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
  } catch {
    /* ignore */
  }
  updateFollow()
  updateHudCard()
}

function spawnPlan(plan, startTime, stopTime) {
  const coords = cleanRouteCoords(plan.coordinates)
  if (coords.length < 2) return
  const colorCss = plan.color
  const color = Cesium.Color.fromCssColorString(colorCss)
  const passedColor = color.withAlpha(0.25)
  const remainGlow = color.withAlpha(1)
  const routePositions = Cesium.Cartesian3.fromDegreesArrayHeights(flattenDegreesArray(coords))
  const carPositions = routePositions.map((p) => Cesium.Cartesian3.clone(p))
  if (carPositions.length < 2) return

  let totalDist = 0
  const segLens = [0]
  for (let i = 1; i < carPositions.length; i++) {
    totalDist += Cesium.Cartesian3.distance(carPositions[i - 1], carPositions[i])
    segLens.push(totalDist)
  }
  if (totalDist < 1) totalDist = 1
  const travelSeconds = Math.max(totalDist / DEMO_SPEED_MPS, 20)

  const rt = {
    id: Number(plan.id),
    vehicle: { path: plan.path, energy: plan.energy, time: plan.time },
    start: startTime.clone(),
    travelSeconds,
    phase: routePhase(plan.id),
    color: colorCss,
    initEnergy: plan.energy?.[0] ?? 0,
    initTime: plan.time?.[0] ?? 0,
    routePositions,
    segLens,
    totalDist,
    midScratch: new Cesium.Cartesian3(),
    passedPos: [routePositions[0], routePositions[0]],
    remainPos: routePositions.slice(),
    carEntity: null,
  }

  viewer.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(() => rt.passedPos, false),
      width: 6,
      material: passedColor,
      clampToGround: true,
      arcType: Cesium.ArcType.GEODESIC,
    },
  })
  viewer.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(() => rt.remainPos, false),
      width: 10,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.28,
        color: remainGlow,
      }),
      clampToGround: true,
      arcType: Cesium.ArcType.GEODESIC,
    },
  })

  const positionProperty = new Cesium.SampledPositionProperty()
  positionProperty.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD
  positionProperty.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD
  positionProperty.setInterpolationOptions({
    interpolationDegree: 1,
    interpolationAlgorithm: Cesium.LinearApproximation,
  })
  // 相位错开，避免相同路线/相同起点叠成一辆
  const phase = rt.phase || 0
  const keyed = []
  for (let i = 0; i < carPositions.length; i++) {
    let u = segLens[i] / totalDist - phase
    if (u < 0) u += 1
    keyed.push({ u, pos: carPositions[i] })
  }
  keyed.sort((a, b) => a.u - b.u)
  const startPos = posAtDist(carPositions, segLens, totalDist, phase * totalDist)
  if (!keyed.length || keyed[0].u > 0.002) keyed.unshift({ u: 0, pos: startPos })
  const last = keyed[keyed.length - 1]
  if (!last || last.u < 0.998) keyed.push({ u: 1, pos: Cesium.Cartesian3.clone(startPos) })

  let lastSec = -1
  for (const k of keyed) {
    let sec = k.u * travelSeconds
    if (sec <= lastSec) sec = lastSec + 0.02
    lastSec = sec
    positionProperty.addSample(
      Cesium.JulianDate.addSeconds(startTime, sec, new Cesium.JulianDate()),
      k.pos,
    )
  }
  const carStop = Cesium.JulianDate.addSeconds(startTime, Math.max(lastSec, travelSeconds), new Cesium.JulianDate())
  if (Cesium.JulianDate.lessThan(stopTime, carStop)) Cesium.JulianDate.clone(carStop, stopTime)

  rt.carEntity = viewer.entities.add({
    id: `all-car-${plan.id}`,
    position: positionProperty,
    orientation: new Cesium.VelocityOrientationProperty(positionProperty),
    model: {
      uri: MODEL_URI,
      minimumPixelSize: 32,
      maximumScale: 52,
      scale: 0.32,
      runAnimations: false,
    },
    label: {
      text: `V${plan.id}`,
      font: '12px sans-serif',
      fillColor: color,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -22),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })

  runtime.set(rt.id, rt)
}

onMounted(async () => {
  const el = hostRef.value
  if (!el) return

  let baseLayer
  try {
    const ionProvider = await Cesium.createWorldImageryAsync({
      style: Cesium.IonWorldImageryStyle.ROAD,
    })
    baseLayer = new Cesium.ImageryLayer(ionProvider)
  } catch {
    baseLayer = new Cesium.ImageryLayer(
      new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c'],
        maximumLevel: 16,
        enablePickFeatures: false,
      }),
    )
  }

  viewer = new Cesium.Viewer(el, {
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
    msaaSamples: 1,
    requestRenderMode: false,
    targetFrameRate: 30,
  })
  viewer.resolutionScale = 1
  viewer.scene.globe.enableLighting = false
  viewer.scene.fog.enabled = false
  viewer.scene.skyAtmosphere.show = true
  viewer.scene.globe.depthTestAgainstTerrain = false
  viewer.scene.globe.maximumScreenSpaceError = 3
  viewer.scene.globe.tileCacheSize = 800
  viewer.shadows = false
  viewer.targetFrameRate = 40
  if (viewer.scene.postProcessStages?.fxaa) {
    viewer.scene.postProcessStages.fxaa.enabled = false
  }
  if (viewer.cesiumWidget?.creditContainer) {
    viewer.cesiumWidget.creditContainer.style.display = 'none'
  }

  try {
    await fetch(MODEL_URI, { cache: 'force-cache' })
  } catch {
    /* 预热车模 */
  }

  const startTime = Cesium.JulianDate.now()
  const stopTime = Cesium.JulianDate.addHours(startTime, 1, new Cesium.JulianDate())
  const total = Math.max(1, props.plans.length)
  spawnPct.value = 0

  const batch = 16
  for (let i = 0; i < props.plans.length; i += batch) {
    const slice = props.plans.slice(i, i + batch)
    for (const plan of slice) {
      try {
        spawnPlan(plan, startTime, stopTime)
      } catch (err) {
        console.error(err)
      }
    }
    spawnPct.value = Math.min(99, Math.round(((i + slice.length) / total) * 100))
    await new Promise((r) => requestAnimationFrame(r))
    if (!viewer || viewer.isDestroyed()) return
  }
  spawnPct.value = 100
  spawnedCount.value = runtime.size

  viewer.clock.startTime = startTime.clone()
  viewer.clock.stopTime = stopTime
  viewer.clock.currentTime = startTime.clone()
  viewer.clock.clockRange = Cesium.ClockRange.LOOP
  viewer.clock.multiplier = 2
  viewer.clock.shouldAnimate = true

  removeTick = viewer.clock.onTick.addEventListener(() => {
    updateAllRouteSplits()
    if (followId.value != null) {
      updateFollow()
      updateHudCard()
    }
  })

  viewer.screenSpaceEventHandler.setInputAction((click) => {
    const drilled = viewer.scene.drillPick(click.position, 8)
    let id = null
    for (const picked of drilled) {
      id = vehicleIdFromPick(picked)
      if (id != null) break
    }
    if (id == null) id = vehicleIdFromPick(viewer.scene.pick(click.position))
    if (id != null) focusCar(id)
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
  viewer.screenSpaceEventHandler.setInputAction(() => {
    if (followId.value != null) stopFollow()
  }, Cesium.ScreenSpaceEventType.RIGHT_DOWN)

  requestAnimationFrame(() => {
    if (viewer && !viewer.isDestroyed()) viewer.resize()
  })
  setTimeout(() => {
    if (viewer && !viewer.isDestroyed()) {
      viewer.resize()
      frameAllCars()
    }
  }, 80)
  frameAllCars()
})

function frameAllCars() {
  if (!viewer || viewer.isDestroyed()) return
  const pts = []
  const t = viewer.clock.currentTime
  for (const rt of runtime.values()) {
    const p = rt.carEntity?.position?.getValue(t)
    if (Cesium.defined(p)) pts.push(p)
  }
  const pitch = Cesium.Math.toRadians(-70)
  if (pts.length >= 2) {
    const bs = Cesium.BoundingSphere.fromPoints(pts)
    const range = Math.max(bs.radius * 4.8, 18000)
    viewer.camera.flyToBoundingSphere(bs, {
      duration: 0.5,
      offset: new Cesium.HeadingPitchRange(0, pitch, range),
    })
    return
  }
  if (viewer.entities.values.length) {
    viewer.zoomTo(viewer.entities, new Cesium.HeadingPitchRange(0, pitch, 20000))
  }
}

onUnmounted(() => {
  if (removeTick) removeTick()
  removeTick = null
  runtime.clear()
  hudCard.value = null
  if (viewer && !viewer.isDestroyed()) viewer.destroy()
  viewer = null
})
</script>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(6, 16, 28, 0.28);
  box-sizing: border-box;
}

.box {
  position: relative;
  width: min(1280px, 100%);
  height: min(900px, 100%);
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(0, 232, 255, 0.32);
  background: rgba(8, 18, 32, 0.42);
  backdrop-filter: blur(10px);
  overflow: hidden;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(0, 232, 255, 0.16);
  background: rgba(6, 14, 28, 0.28);
}

.tag {
  font-size: 11px;
  letter-spacing: 0.16em;
  color: #ffb020;
}

.head h2 {
  margin: 4px 0 0;
  font-size: 16px;
  letter-spacing: 0.08em;
}

.count {
  margin: 4px 0 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: #8fd8e8;
}

.close {
  margin-top: 4px;
  padding: 6px 12px;
  border: 1px solid rgba(0, 232, 255, 0.35);
  background: transparent;
  color: #00e8ff;
  cursor: pointer;
}

.stage {
  position: relative;
  flex: 1;
  min-height: 0;
}

.cesium-host {
  width: 100%;
  height: 100%;
}

.car-hud-card {
  position: absolute;
  z-index: 8;
  width: 220px;
  padding: 10px 12px 12px;
  transform: translate(-50%, calc(-100% - 18px));
  pointer-events: none;
  border: 1px solid var(--accent, #00e8ff);
  border-radius: 10px;
  background: rgba(4, 12, 24, 0.92);
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent, #00e8ff) 28%, transparent);
  color: #d7f7ff;
}

.hud-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

.hud-id {
  font-weight: 700;
  color: var(--accent, #00e8ff);
  font-size: 15px;
}

.hud-nums {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 13px;
}

.hud-time {
  color: #ffb020;
  font-size: 12px;
  margin-top: 2px;
}

.hud-k {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: #6f8fa3;
  margin-bottom: 3px;
}

.hud-bar {
  height: 8px;
  margin-bottom: 7px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.hud-fill {
  display: block;
  height: 100%;
}

.hud-fill.energy {
  background: linear-gradient(90deg, #00667a, #00e8ff);
}

.hud-fill.time {
  background: linear-gradient(90deg, #7a5200, #ffb020);
}

.loadbar {
  position: absolute;
  left: 24px;
  right: 24px;
  bottom: 48px;
  height: 6px;
  background: rgba(0, 12, 22, 0.7);
  border: 1px solid rgba(0, 232, 255, 0.28);
  z-index: 4;
}

.loadbar-fill {
  height: 100%;
  background: linear-gradient(90deg, #00667a, #00e8ff);
}

.hint {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  font-size: 12px;
  letter-spacing: 0.12em;
  color: #00e8ff;
  background: rgba(0, 10, 20, 0.72);
  border: 1px solid rgba(0, 232, 255, 0.28);
  padding: 6px 12px;
  pointer-events: none;
}

.stage :deep(.cesium-viewer-bottom),
.stage :deep(.cesium-widget-credits) {
  display: none !important;
}
</style>
