/** 车辆上方 HUD：电量 + 剩余时间（Canvas Billboard） */

export const HUD_W = 336
export const HUD_H = 148
export const ENERGY_CAP = 100

export function hudMeterPercents(energy, initEnergy, time, initTime) {
  const e = Number(energy) || 0
  const t = Number(time) || 0
  const eCap = Math.max(ENERGY_CAP, Number(initEnergy) || 0, e)
  const tCap = Math.max(Number(initTime) || 0.01, 0.01)
  return {
    energy: Math.min(100, Math.max(0, (e / eCap) * 100)),
    time: Math.min(100, Math.max(0, (t / tCap) * 100)),
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function bar(ctx, x, y, w, h, ratio, from, to) {
  const r = Math.min(1, Math.max(0, ratio))
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  roundRect(ctx, x, y, w, h, 4)
  ctx.fill()
  if (r <= 0.001) return
  const bw = Math.max(4, w * r)
  const g = ctx.createLinearGradient(x, y, x + w, y)
  g.addColorStop(0, from)
  g.addColorStop(1, to)
  ctx.save()
  roundRect(ctx, x, y, w, h, 4)
  ctx.clip()
  ctx.fillStyle = g
  ctx.fillRect(x, y, bw, h)
  ctx.restore()
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ id: number, color: string, energy: number, initEnergy: number, time: number, initTime: number }} data
 */
export function paintVehicleHud(canvas, data) {
  if (canvas.width !== HUD_W) canvas.width = HUD_W
  if (canvas.height !== HUD_H) canvas.height = HUD_H
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, HUD_W, HUD_H)

  const accent = data.color || '#00e8ff'
  const energy = data.energy ?? 0
  const time = data.time ?? 0
  const meters = hudMeterPercents(energy, data.initEnergy, time, data.initTime)
  const eRatio = meters.energy / 100
  const tRatio = meters.time / 100

  roundRect(ctx, 8, 8, HUD_W - 16, HUD_H - 16, 14)
  ctx.fillStyle = 'rgba(4, 12, 24, 0.82)'
  ctx.fill()
  ctx.strokeStyle = accent
  ctx.globalAlpha = 0.85
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.globalAlpha = 1

  ctx.font = 'bold 22px Segoe UI, sans-serif'
  ctx.fillStyle = accent
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`V${data.id}`, 24, 18)

  ctx.font = '600 18px Segoe UI, sans-serif'
  ctx.fillStyle = '#d7f7ff'
  ctx.textAlign = 'right'
  ctx.fillText(`${energy.toFixed(1)} kWh`, HUD_W - 24, 18)
  ctx.font = '600 16px Segoe UI, sans-serif'
  ctx.fillStyle = '#ffb020'
  ctx.fillText(`${time.toFixed(2)} h left`, HUD_W - 24, 42)

  ctx.font = '12px Segoe UI, sans-serif'
  ctx.fillStyle = '#6f8fa3'
  ctx.textAlign = 'left'
  ctx.fillText('ENERGY', 24, 72)
  bar(ctx, 24, 88, HUD_W - 48, 12, eRatio, '#00667a', '#00e8ff')

  ctx.fillText('TIME LEFT', 24, 108)
  bar(ctx, 24, 124, HUD_W - 48, 12, tRatio, '#7a5200', '#ffb020')
}

export function createVehicleHudCanvas(data) {
  const canvas = document.createElement('canvas')
  paintVehicleHud(canvas, data)
  return canvas
}
