/** 站点编号从 1 开始，对应 data.csv 第 N 行（下标 N-1） */

export async function loadStations() {
  const text = await fetch('/zhandain/data.csv').then((r) => r.text())
  const stations = {}
  text
    .trim()
    .split(/\r?\n/)
    .forEach((line, index) => {
      const [latStr, lonStr] = line.split(',')
      const lat = Number(latStr)
      const lon = Number(lonStr)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
      stations[index + 1] = { id: index + 1, lat, lon }
    })
  return stations
}

export async function loadVehicles() {
  const list = await fetch('/cl_data/vehicles.json').then((r) => r.json())
  return list.filter((v) => Array.isArray(v.path) && v.path.length >= 2)
}

/** 100×100 站间速度矩阵（km/h），下标 0 对应站点 1 */
export async function loadSpeedMatrix() {
  const text = await fetch('/zhandain/speed.csv').then((r) => r.text())
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(',').map((x) => Number(x) || 0))
}

/** 取两站点间速度；站点编号从 1 开始。矩阵为 0 时用稳定随机值（约 20–55 km/h） */
const fallbackSpeedCache = new Map()

function fallbackSegmentSpeed(fromId, toId) {
  const key = `${fromId}>${toId}`
  if (!fallbackSpeedCache.has(key)) {
    fallbackSpeedCache.set(key, 20 + Math.random() * 35)
  }
  return fallbackSpeedCache.get(key)
}

export function getSegmentSpeed(matrix, fromId, toId) {
  if (!matrix?.length) return fallbackSegmentSpeed(fromId, toId)
  const a = fromId - 1
  const b = toId - 1
  if (a < 0 || b < 0 || a >= matrix.length || b >= matrix[a].length) {
    return fallbackSegmentSpeed(fromId, toId)
  }
  const v = matrix[a][b]
  if (!Number.isFinite(v) || v <= 0) return fallbackSegmentSpeed(fromId, toId)
  return v
}

export function buildPathSpeeds(matrix, path) {
  const segs = []
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i]
    const to = path[i + 1]
    segs.push({
      from,
      to,
      label: `${from}→${to}`,
      speed: getSegmentSpeed(matrix, from, to),
    })
  }
  return segs
}

function stationCenter(path, stations) {
  let lat = 0
  let lon = 0
  let n = 0
  for (const id of path) {
    const s = stations[id]
    if (!s) continue
    lat += s.lat
    lon += s.lon
    n += 1
  }
  if (!n) return null
  return { lat: lat / n, lon: lon / n }
}

function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function pathSpanKm(path, stations) {
  const pts = path.map((id) => stations[id]).filter(Boolean)
  if (pts.length < 2) return Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity
  for (const p of pts) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLon = Math.min(minLon, p.lon)
    maxLon = Math.max(maxLon, p.lon)
  }
  return haversineKm({ lat: minLat, lon: minLon }, { lat: maxLat, lon: maxLon })
}

function bboxOfIds(ids, stations) {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity
  let n = 0
  for (const id of ids) {
    const s = stations[id]
    if (!s) continue
    minLat = Math.min(minLat, s.lat)
    maxLat = Math.max(maxLat, s.lat)
    minLon = Math.min(minLon, s.lon)
    maxLon = Math.max(maxLon, s.lon)
    n += 1
  }
  if (!n) return null
  return { minLat, maxLat, minLon, maxLon, n }
}

function bboxSpanKm(bbox) {
  if (!bbox) return Infinity
  return haversineKm(
    { lat: bbox.minLat, lon: bbox.minLon },
    { lat: bbox.maxLat, lon: bbox.maxLon },
  )
}

function countOverlap(path, selectedIds) {
  let n = 0
  for (const id of path) {
    if (selectedIds.has(id)) n += 1
  }
  return n
}

function pathSeqKey(path) {
  return path.join('>')
}

function pathSetKey(path) {
  return [...new Set(path)].sort((a, b) => a - b).join(',')
}

function jaccardStations(pathA, pathB) {
  const a = new Set(pathA)
  const b = new Set(pathB)
  let inter = 0
  for (const id of a) {
    if (b.has(id)) inter += 1
  }
  const union = a.size + b.size - inter
  return union ? inter / union : 1
}

/** 两车共享的有向/反向边数量，用于避免同路段并行移动 */
function sharedEdgeCount(pathA, pathB) {
  const edges = new Set()
  for (let i = 0; i < pathA.length - 1; i++) {
    edges.add(`${pathA[i]}>${pathA[i + 1]}`)
    edges.add(`${pathA[i + 1]}>${pathA[i]}`)
  }
  let n = 0
  for (let i = 0; i < pathB.length - 1; i++) {
    if (edges.has(`${pathB[i]}>${pathB[i + 1]}`)) n += 1
  }
  return n
}

function maxSharedEdgesWithPicked(path, picked) {
  let max = 0
  for (const v of picked) {
    max = Math.max(max, sharedEdgeCount(path, v.path))
  }
  return max
}

/** 与已选车辆路径过像：完全相同、站点集合相同、Jaccard 过高或共边过多 */
function isPathTooSimilar(path, picked, maxJaccard = 0.5) {
  const seq = pathSeqKey(path)
  const setKey = pathSetKey(path)
  for (const v of picked) {
    if (pathSeqKey(v.path) === seq) return true
    if (pathSetKey(v.path) === setKey) return true
    if (jaccardStations(path, v.path) >= maxJaccard) return true
    if (sharedEdgeCount(path, v.path) >= 2) return true
  }
  return false
}

function countNewStations(path, selectedIds) {
  let n = 0
  for (const id of path) {
    if (!selectedIds.has(id)) n += 1
  }
  return n
}

/**
 * 选取规则：
 * - 站点整体尽量集中
 * - 路径不要太像、少共边（避免叠在一起跑）
 * - 最多 1~2 辆站点数 > 5，其余尽量 < 5
 */
export function pickNearbyVehicles(vehicles, stations, count = 5) {
  const valid = vehicles.filter((v) => v.path.every((id) => stations[id]))
  if (!valid.length) return []
  if (valid.length <= count) return dedupeByPath(valid).slice(0, count)

  const LONG_MIN = 6 // > 5
  const SHORT_MAX = 4 // < 5
  const MAX_LONG = 2

  const ranked = valid
    .map((v) => ({
      v,
      span: pathSpanKm(v.path, stations),
      len: v.path.length,
      center: stationCenter(v.path, stations),
      seq: pathSeqKey(v.path),
      setKey: pathSetKey(v.path),
      isLong: v.path.length >= LONG_MIN,
      isShort: v.path.length <= SHORT_MAX,
    }))
    .sort((a, b) => a.span - b.span || a.len - b.len)

  const seenSeq = new Set()
  const seenSet = new Set()
  const uniqueRanked = []
  for (const item of ranked) {
    if (seenSeq.has(item.seq) || seenSet.has(item.setKey)) continue
    seenSeq.add(item.seq)
    seenSet.add(item.setKey)
    uniqueRanked.push(item)
  }

  const shorts = uniqueRanked.filter((x) => x.isShort)
  const longs = uniqueRanked.filter((x) => x.isLong)
  const mediums = uniqueRanked.filter((x) => !x.isShort && !x.isLong)

  // 种子：优先短路径紧凑车
  const seedPool = (shorts.length ? shorts : uniqueRanked).slice(
    0,
    Math.max(10, Math.ceil((shorts.length || uniqueRanked.length) * 0.45)),
  )
  const seedItem = seedPool[Math.floor(Math.random() * seedPool.length)]

  const picked = [seedItem.v]
  const pickedIds = new Set([seedItem.v.vehicle])
  const selectedStations = new Set(seedItem.v.path)
  let clusterBbox = bboxOfIds(selectedStations, stations)
  let longCount = seedItem.isLong ? 1 : 0
  // 目标：最终 1~2 辆长路径（若数据够）
  const targetLong = Math.min(MAX_LONG, Math.max(1, longs.length ? 1 + (Math.random() < 0.55 ? 1 : 0) : 0))

  const tryPickFrom = (pool, opts = {}) => {
    const { requireNewStation = true, forceLong = null } = opts
    let best = null
    for (const item of pool) {
      if (pickedIds.has(item.v.vehicle)) continue
      if (isPathTooSimilar(item.v.path, picked, 0.5)) continue

      if (forceLong === true && !item.isLong) continue
      if (forceLong === false && item.isLong) continue
      // 长路径名额用尽后禁止再选长路径
      if (item.isLong && longCount >= MAX_LONG) continue
      // 已达目标长路径数后，优先只补短车
      if (item.isLong && longCount >= targetLong && opts.preferShort) continue

      const newCount = countNewStations(item.v.path, selectedStations)
      if (requireNewStation && newCount < 1) continue

      const sharedEdges = maxSharedEdgesWithPicked(item.v.path, picked)
      if (sharedEdges >= 2) continue

      const trialStations = new Set(selectedStations)
      for (const id of item.v.path) trialStations.add(id)
      const trialBbox = bboxOfIds(trialStations, stations)
      const trialSpan = bboxSpanKm(trialBbox)
      const expand = trialSpan - bboxSpanKm(clusterBbox)
      const overlap = countOverlap(item.v.path, selectedStations)
      const overlapRatio = overlap / Math.max(item.v.path.length, 1)
      if (overlapRatio >= 0.65) continue

      const clusterCenter = stationCenter([...selectedStations], stations)
      const centerDist =
        item.center && clusterCenter
          ? haversineKm(item.center, clusterCenter)
          : Infinity

      // 惩罚共边与高重叠，避免叠车；短路径略加分
      const score =
        expand * 3.5 +
        centerDist * 2.4 +
        item.span * 0.25 +
        overlapRatio * 3 +
        sharedEdges * 4 +
        (item.isShort ? -0.8 : 0) +
        (item.isLong ? 0.4 : 0) -
        newCount * 0.7

      if (!best || score < best.score) {
        best = { item, score, trialStations, trialBbox }
      }
    }
    return best
  }

  const commit = (best) => {
    picked.push(best.item.v)
    pickedIds.add(best.item.v.vehicle)
    for (const id of best.trialStations) selectedStations.add(id)
    clusterBbox = best.trialBbox
    if (best.item.isLong) longCount += 1
  }

  while (picked.length < count) {
    const needMoreLong = longCount < targetLong
    const slotsLeft = count - picked.length
    // 若还差长路径且剩余名额允许，先尝试补长路径
    let best = null
    if (needMoreLong && slotsLeft > longCount) {
      best = tryPickFrom(longs, { requireNewStation: true, forceLong: true })
    }
    // 常规：优先短路径
    if (!best) {
      best = tryPickFrom(shorts, { requireNewStation: true, forceLong: false, preferShort: true })
    }
    if (!best) {
      best = tryPickFrom(mediums, { requireNewStation: true, forceLong: false, preferShort: true })
    }
    if (!best && longCount < MAX_LONG) {
      best = tryPickFrom(longs, { requireNewStation: true, forceLong: true })
    }
    if (!best) best = tryPickFrom(uniqueRanked, { requireNewStation: true })
    if (!best) best = tryPickFrom(uniqueRanked, { requireNewStation: false })
    if (!best) break
    commit(best)
  }

  return picked
}

function dedupeByPath(list) {
  const seen = new Set()
  const out = []
  for (const v of list) {
    const k = pathSetKey(v.path)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(v)
  }
  return out
}

/** 按路径进度插值能量 / 剩余时间 */
export function sampleVehicleState(vehicle, progress01) {
  const energy = vehicle.energy || []
  const time = vehicle.time || []
  const n = Math.max(energy.length, time.length, vehicle.path?.length || 0)
  if (n <= 1) {
    return {
      energy: energy[0] ?? 0,
      time: time[0] ?? 0,
      nodeIndex: 0,
      progress: 0,
    }
  }
  const p = Math.min(1, Math.max(0, progress01)) * (n - 1)
  const i0 = Math.floor(p)
  const i1 = Math.min(i0 + 1, n - 1)
  const t = p - i0
  const lerp = (a, b) => (a ?? 0) + ((b ?? a ?? 0) - (a ?? 0)) * t
  return {
    energy: lerp(energy[i0], energy[i1]),
    time: lerp(time[i0], time[i1]),
    nodeIndex: i0,
    progress: p / (n - 1),
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchOsrmSegment(a, b) {
  const url =
    `/osrm/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}` +
    `?overview=full&geometries=geojson&steps=false&annotations=false`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 429) {
        await sleep(450 * (attempt + 1))
        continue
      }
      if (!res.ok) {
        await sleep(200 * (attempt + 1))
        continue
      }
      const data = await res.json()
      const pts = data.routes?.[0]?.geometry?.coordinates
      if (data.code === 'Ok' && pts?.length >= 2) {
        return {
          coordinates: pts,
          distance: data.routes[0].distance || 0,
          duration: data.routes[0].duration || 0,
        }
      }
    } catch {
      await sleep(200 * (attempt + 1))
    }
  }
  return null
}

export async function fetchOsrmRoute(stationsPath) {
  if (!stationsPath || stationsPath.length < 2) {
    throw new Error('OSRM 需要至少 2 个站点')
  }

  const coordinates = []
  let distance = 0
  let duration = 0

  for (let i = 0; i < stationsPath.length - 1; i++) {
    const a = stationsPath[i]
    const b = stationsPath[i + 1]
    const seg = await fetchOsrmSegment(a, b)
    const pts = seg?.coordinates?.length ? seg.coordinates : fallbackStationRoute([a, b]).coordinates
    if (seg) {
      distance += seg.distance
      duration += seg.duration
    }
    if (coordinates.length) coordinates.push(...pts.slice(1))
    else coordinates.push(...pts)
  }

  if (coordinates.length < 2) {
    throw new Error('OSRM 未返回有效路线')
  }

  return { coordinates, distance, duration }
}

/** 站间直线加密，OSRM 失败时仍能移动 */
export function fallbackStationRoute(stationsPath) {
  const coordinates = []
  for (let i = 0; i < stationsPath.length - 1; i++) {
    const a = stationsPath[i]
    const b = stationsPath[i + 1]
    const km = haversineKm(a, b)
    const steps = Math.max(2, Math.ceil((km * 1000) / 40))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      coordinates.push([a.lon + (b.lon - a.lon) * t, a.lat + (b.lat - a.lat) * t])
    }
  }
  const last = stationsPath[stationsPath.length - 1]
  if (last) coordinates.push([last.lon, last.lat])
  return { coordinates, distance: 0, duration: 0 }
}

export async function fetchRouteOrFallback(stationsPath) {
  try {
    return await fetchOsrmRoute(stationsPath)
  } catch (err) {
    console.warn('OSRM 不可用，改用站间连线', err)
    return fallbackStationRoute(stationsPath)
  }
}

/** 在演示 5 车附近选紧凑车队，避免跨城超长站跳把路线拉乱 */
export function pickAroundDemo(vehicles, stations, demo, count = 50) {
  const demoList = (demo || []).filter((v) => v?.path?.every((id) => stations[id]))
  const picked = []
  const seen = new Set()
  const push = (v) => {
    if (!v || picked.length >= count || seen.has(v.vehicle)) return
    if (!v.path?.every((id) => stations[id])) return
    seen.add(v.vehicle)
    picked.push(v)
  }
  for (const v of demoList) push(v)

  const demoStations = demoList.flatMap((v) => v.path)
  const center = stationCenter(demoStations, stations)
  const rest = vehicles
    .filter((v) => !seen.has(v.vehicle) && v.path?.every((id) => stations[id]))
    .map((v) => {
      let maxHop = 0
      for (let i = 0; i < v.path.length - 1; i++) {
        const a = stations[v.path[i]]
        const b = stations[v.path[i + 1]]
        if (a && b) maxHop = Math.max(maxHop, haversineKm(a, b))
      }
      const c = stationCenter(v.path, stations)
      const dist = center && c ? haversineKm(center, c) : 999
      return { v, maxHop, dist, span: pathSpanKm(v.path, stations), len: v.path.length }
    })
    .filter((x) => x.maxHop <= 7.5 && x.span <= 14 && x.len >= 2)
    .sort((a, b) => a.dist - b.dist || a.span - b.span)

  for (const item of rest) {
    if (picked.length >= count) break
    push(item.v)
  }
  if (picked.length < count) {
    const extra = vehicles
      .filter((v) => !seen.has(v.vehicle) && v.path?.every((id) => stations[id]))
      .map((v) => ({
        v,
        span: pathSpanKm(v.path, stations),
      }))
      .sort((a, b) => a.span - b.span)
    for (const item of extra) {
      if (picked.length >= count) break
      push(item.v)
    }
  }
  return picked
}

/** 优先保留已选车辆，再补足到 count */
export function pickFleetSlice(vehicles, stations, count, preferIds = []) {
  const valid = vehicles.filter((v) => v.path.every((id) => stations[id]))
  const byId = new Map(valid.map((v) => [v.vehicle, v]))
  const out = []
  const seen = new Set()
  const push = (v) => {
    if (!v || out.length >= count || seen.has(v.vehicle)) return
    seen.add(v.vehicle)
    out.push(v)
  }
  for (const id of preferIds) push(byId.get(id))
  for (const v of valid) push(v)
  return out
}
