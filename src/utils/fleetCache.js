const CACHE_URL = '/cl_data/fleet_routes.json'
const SAVE_URL = '/__save_fleet_cache'
export const FLEET_CACHE_VERSION = 4

function pointToSegMeters(p, a, b) {
  const lat0 = ((a[1] + b[1]) * 0.5 * Math.PI) / 180
  const mx = Math.cos(lat0) * 111320
  const my = 110540
  const px = (p[0] - a[0]) * mx
  const py = (p[1] - a[1]) * my
  const bx = (b[0] - a[0]) * mx
  const by = (b[1] - a[1]) * my
  const den = bx * bx + by * by
  let t = 0
  if (den > 1e-8) t = Math.max(0, Math.min(1, (px * bx + py * by) / den))
  const dx = px - bx * t
  const dy = py - by * t
  return Math.hypot(dx, dy)
}

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

/** 保形抽稀，避免均匀抽点把弯道拉直、路线交叉乱掉 */
export function packCoords(coords, maxN = 360) {
  if (!coords?.length) return []
  let pts = coords.map(([lon, lat]) => [Number(lon), Number(lat)])
  if (pts.length > maxN) {
    let tol = 2
    let simplified = douglasPeucker(pts, tol)
    while (simplified.length > maxN && tol < 10) {
      tol *= 1.35
      simplified = douglasPeucker(pts, tol)
    }
    pts = simplified
  }
  return pts.map(([lon, lat]) => [
    Math.round(lon * 1e5) / 1e5,
    Math.round(lat * 1e5) / 1e5,
  ])
}

export async function loadFleetRoutes() {
  try {
    const res = await fetch(CACHE_URL, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.v !== 3 && data?.v !== FLEET_CACHE_VERSION) return null
    if (!Array.isArray(data?.items) || !data.items.length) return null
    return data
  } catch {
    return null
  }
}

export function plansFromCache(cache, vehicles) {
  const byId = new Map((vehicles || []).map((v) => [v.vehicle, v]))
  const plans = []
  for (const item of cache.items || []) {
    const v = byId.get(item.id)
    if (!item.coordinates?.length) continue
    const energy = item.energy?.length ? item.energy : v?.energy || []
    const time = item.time?.length ? item.time : v?.time || []
    const path = item.path?.length ? item.path : v?.path || []
    if (!v && !path.length) continue
    plans.push({
      id: item.id,
      color: item.color,
      path,
      energy,
      time,
      coordinates: item.coordinates,
    })
  }
  return plans
}

function packSeries(arr) {
  if (!arr?.length) return []
  return arr.map((x) => Math.round(Number(x) * 1000) / 1000)
}

export async function saveFleetRoutes(payload) {
  const body = JSON.stringify({
    v: FLEET_CACHE_VERSION,
    demoIds: payload.demoIds || [],
    items: (payload.items || []).map((p) => ({
      id: p.id,
      color: p.color,
      path: p.path || [],
      energy: packSeries(p.energy),
      time: packSeries(p.time),
      coordinates: packCoords(p.coordinates, 360),
    })),
  })
  try {
    const res = await fetch(SAVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    return res.ok
  } catch {
    return false
  }
}
