const DEMO_IDS = [5, 11, 23, 40, 48]
const ALGO_ORDER = ['Dijkstra', 'DQN', 'PPO', 'PPO+DP', 'SEA']

export { DEMO_IDS, ALGO_ORDER }

export function mean(arr) {
  const xs = (arr || []).filter((v) => Number.isFinite(v))
  if (!xs.length) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function lastOf(arr) {
  const xs = arr || []
  return xs.length ? xs[xs.length - 1] : 0
}

export function histogram(values, edges) {
  const counts = Array(edges.length - 1).fill(0)
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    let i = 0
    while (i < edges.length - 2 && v >= edges[i + 1]) i += 1
    counts[i] += 1
  }
  const labels = []
  for (let i = 0; i < edges.length - 1; i++) {
    labels.push(`${edges[i]}–${edges[i + 1]}`)
  }
  return { labels, counts }
}

export function buildFleetAnalytics(vehicles) {
  const list = Array.isArray(vehicles) ? vehicles : []
  const finals = list.map((v) => ({
    id: v.vehicle,
    energy: lastOf(v.energy),
    time: lastOf(v.time),
    startEnergy: v.energy?.[0] ?? 0,
    startTime: v.time?.[0] ?? 0,
    hops: Math.max(0, (v.path?.length || 1) - 1),
    stops: v.path?.length || 0,
    reward: mean(v.rewards),
    loss: mean(v.losses),
    gain: lastOf(v.energy) - (v.energy?.[0] ?? 0),
    consumedTime: (v.time?.[0] ?? 0) - lastOf(v.time),
  }))

  const energies = finals.map((x) => x.energy)
  const times = finals.map((x) => x.time)
  const hops = finals.map((x) => x.hops)
  const gains = finals.map((x) => x.gain)
  const rewards = finals.map((x) => x.reward)

  const visit = Array(100).fill(0)
  const startCount = Array(100).fill(0)
  const endCount = Array(100).fill(0)
  const chargeHits = Array(100).fill(0)
  let chargeSeg = 0
  let drainSeg = 0
  for (const v of list) {
    const path = v.path || []
    path.forEach((id, i) => {
      if (id >= 1 && id <= 100) visit[id - 1] += 1
      if (i === 0 && id >= 1 && id <= 100) startCount[id - 1] += 1
      if (i === path.length - 1 && id >= 1 && id <= 100) endCount[id - 1] += 1
    })
    const energy = v.energy || []
    for (let i = 1; i < energy.length; i++) {
      const d = energy[i] - energy[i - 1]
      if (d >= 0) {
        chargeSeg += 1
        const sid = path[i]
        if (sid >= 1 && sid <= 100) chargeHits[sid - 1] += 1
      } else {
        drainSeg += 1
      }
    }
  }

  const heat10 = []
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const id = r * 10 + c + 1
      heat10.push([c, 9 - r, visit[id - 1], id])
    }
  }

  const topStations = visit
    .map((n, i) => ({ id: i + 1, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 15)

  const demo = DEMO_IDS.map((id) => list.find((v) => v.vehicle === id)).filter(Boolean)

  const bands = [
    { name: '<50 kWh', value: energies.filter((e) => e < 50).length },
    { name: '50–80 kWh', value: energies.filter((e) => e >= 50 && e < 80).length },
    { name: '≥80 kWh', value: energies.filter((e) => e >= 80).length },
  ]

  const hopHist = histogram(
    hops,
    [1, 2, 3, 4, 5, 6, 7, 8, 10],
  )
  hopHist.labels[hopHist.labels.length - 1] = '8+'

  const energyHist = histogram(energies, [20, 40, 50, 60, 70, 80, 90, 100])
  const timeHist = histogram(times, [0, 0.4, 0.7, 1.0, 1.3, 1.6, 2.0])

  return {
    n: list.length,
    avgEnergy: mean(energies),
    avgTime: mean(times),
    avgHops: mean(hops),
    avgGain: mean(gains),
    avgReward: mean(rewards),
    avgStartEnergy: mean(finals.map((x) => x.startEnergy)),
    avgConsumedTime: mean(finals.map((x) => x.consumedTime)),
    chargeSeg,
    drainSeg,
    finals,
    bands,
    hopHist,
    energyHist,
    timeHist,
    heat10,
    topStations,
    demo,
    visitMax: Math.max(1, ...visit),
    startCount,
    endCount,
    chargeHits,
  }
}

export function algoMeansFromChapter(baseMap) {
  const names = ALGO_ORDER
  const keys = [
    ['fleet_energy', '能量·车规模'],
    ['fleet_time', '时间·车规模'],
    ['fleet_alloc', '路径分配率'],
    ['init_energy', '能量·初电'],
    ['init_time', '时间·初电'],
    ['deadline_energy', '能量·截止'],
    ['deadline_time', '时间·截止'],
  ]
  const indicators = keys.map(([, name]) => ({ name, max: 1 }))
  const radar = names.map((algo) =>
    keys.map(([id]) => mean(baseMap[id]?.series?.[algo] || [])),
  )
  const bar = names.map((algo) => ({
    name: algo,
    value: mean(radar[names.indexOf(algo)]),
  }))
  return { names, indicators, radar, bar, keys }
}
