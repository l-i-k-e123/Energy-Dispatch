/**
 * 站点圆形光环（Canvas 绘制，供 Cesium Billboard 使用）
 * 轻量版：降低 shadow / 避免每帧重置 canvas 尺寸
 */

const SIZE = 72

function drawDashedRing(ctx, cx, cy, radius, lineWidth, phase, segmentCount, gapRatio, color) {
  const step = (Math.PI * 2) / segmentCount
  const segAngle = step * (1 - gapRatio)
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'

  for (let i = 0; i < segmentCount; i++) {
    const start = phase + i * step
    ctx.beginPath()
    ctx.arc(cx, cy, radius, start, start + segAngle)
    ctx.stroke()
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number|string} stationId
 * @param {number} timeMs
 */
export function paintStationHalo(canvas, stationId, timeMs = 0) {
  if (canvas.width !== SIZE) canvas.width = SIZE
  if (canvas.height !== SIZE) canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  const cx = SIZE / 2
  const cy = SIZE / 2
  const t = timeMs * 0.001

  ctx.clearRect(0, 0, SIZE, SIZE)

  const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, 32)
  glow.addColorStop(0, 'rgba(0, 230, 255, 0.16)')
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(cx, cy, 32, 0, Math.PI * 2)
  ctx.fill()

  drawDashedRing(ctx, cx, cy, 28, 1.8, t * 0.9, 12, 0.4, 'rgba(0, 245, 255, 0.9)')
  drawDashedRing(ctx, cx, cy, 20, 1.5, -t * 1.1, 10, 0.35, 'rgba(80, 220, 255, 0.55)')

  // 站点编号：高亮白字 + 青色外发光，提高可读性
  const text = String(stationId)
  ctx.font = `bold ${text.length > 2 ? 16 : 18}px Segoe UI, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0, 255, 255, 1)'
  ctx.shadowBlur = 12
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(0, 20, 30, 0.85)'
  ctx.strokeText(text, cx, cy)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, cx, cy)
  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(180, 255, 255, 1)'
  ctx.fillText(text, cx, cy)
}

export function createStationHaloCanvas(stationId) {
  const canvas = document.createElement('canvas')
  paintStationHalo(canvas, stationId, 0)
  return canvas
}
