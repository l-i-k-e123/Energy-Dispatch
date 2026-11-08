<template>
  <div
    ref="rootRef"
    class="zig"
    :style="{ width: '100%', height: `${layout.height}px` }"
  >
    <span
      v-for="(seg, i) in layout.segs"
      :key="`s-${i}`"
      class="zig-rail"
      :class="seg.status"
      :style="seg.style"
    />
    <svg
      v-for="(arr, i) in layout.arrows"
      :key="`a-${i}`"
      class="zig-arrow"
      viewBox="0 0 10 10"
      :style="arr.style"
    >
      <polygon points="1.5,1 9,5 1.5,9" />
    </svg>
    <span
      v-for="node in layout.nodes"
      :key="`n-${node.index}`"
      class="zig-node"
      :style="{ left: `${node.x}px`, top: `${node.y}px` }"
    >
      <i class="zig-dot" :class="node.status" />
      <b class="zig-id">{{ node.id }}</b>
    </span>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'

const DOT = 16
const DOT_R = DOT / 2

const props = defineProps({
  stops: { type: Array, default: () => [] },
})

const rootRef = ref(null)
const boxW = ref(248)
let ro = null

onMounted(() => {
  const el = rootRef.value
  if (!el || typeof ResizeObserver === 'undefined') return
  const apply = () => {
    const w = el.clientWidth
    if (w > 0) boxW.value = w
  }
  apply()
  ro = new ResizeObserver(apply)
  ro.observe(el)
})

onUnmounted(() => {
  ro?.disconnect()
  ro = null
})

const layout = computed(() => {
  const stops = props.stops || []
  const n = stops.length
  if (!n) return { width: 0, height: 0, nodes: [], segs: [], arrows: [] }

  const cols = Math.min(4, n)
  const padX = 22
  const padY = 12
  const cellH = 46
  const inner = Math.max(boxW.value - padX * 2, cols * (DOT + 8))
  const cellW = inner / cols

  const nodes = stops.map((s, i) => {
    const row = Math.floor(i / cols)
    const colInRow = i % cols
    const col = row % 2 === 0 ? colInRow : cols - 1 - colInRow
    return {
      ...s,
      x: padX + col * cellW + cellW / 2,
      y: padY + row * cellH + DOT_R,
    }
  })

  const segs = []
  const arrows = []
  for (let i = 0; i < n - 1; i++) {
    const a = nodes[i]
    const b = nodes[i + 1]
    const cut = shorten(a.x, a.y, b.x, b.y, DOT_R + 2)
    segs.push({ status: a.segStatus, style: railStyle(cut.x1, cut.y1, cut.x2, cut.y2) })
    if (a.segStatus === 'transit') {
      arrows.push({
        style: {
          left: `${(cut.x1 + cut.x2) / 2}px`,
          top: `${(cut.y1 + cut.y2) / 2}px`,
          transform: `translate(-50%, -50%) rotate(${Math.atan2(cut.y2 - cut.y1, cut.x2 - cut.x1)}rad)`,
          transformOrigin: 'center center',
        },
      })
    }
  }

  const rows = Math.ceil(n / cols)
  return {
    height: padY + rows * cellH + 18,
    nodes,
    segs,
    arrows,
  }
})

function shorten(x1, y1, x2, y2, gap) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  return {
    x1: x1 + ux * gap,
    y1: y1 + uy * gap,
    x2: x2 - ux * gap,
    y2: y2 - uy * gap,
  }
}

function railStyle(x1, y1, x2, y2) {
  const len = Math.hypot(x2 - x1, y2 - y1)
  const ang = Math.atan2(y2 - y1, x2 - x1)
  return {
    left: `${x1}px`,
    top: `${y1}px`,
    width: `${len}px`,
    transform: `rotate(${ang}rad)`,
  }
}
</script>

<style scoped>
.zig {
  position: relative;
  width: 100%;
  overflow: visible;
}

.zig-node {
  position: absolute;
  width: 36px;
  transform: translate(-50%, -8px);
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}

.zig-rail {
  position: absolute;
  height: 2px;
  margin-top: -1px;
  transform-origin: 0 50%;
  pointer-events: none;
}

.zig-rail.passed {
  background: #2ee59d;
  box-shadow: 0 0 6px rgba(46, 229, 157, 0.85);
}

.zig-rail.transit {
  background: repeating-linear-gradient(
    90deg,
    #00e8ff 0 4px,
    transparent 4px 8px
  );
  box-shadow: 0 0 8px rgba(0, 232, 255, 0.9);
  animation: zigDash 0.7s linear infinite;
}

.zig-rail.future {
  background: rgba(130, 160, 176, 0.35);
}

.zig-arrow {
  position: absolute;
  width: 10px;
  height: 10px;
  overflow: visible;
  pointer-events: none;
  fill: #00e8ff;
  filter: drop-shadow(0 0 4px #00e8ff);
}

.zig-dot {
  display: block;
  width: 16px;
  height: 16px;
  min-width: 16px;
  min-height: 16px;
  max-width: 16px;
  max-height: 16px;
  border-radius: 50%;
  box-sizing: border-box;
  border: 2px solid rgba(130, 160, 176, 0.7);
  background: #08141f;
  flex: 0 0 16px;
}

.zig-dot.arrived {
  border-color: #2ee59d;
  background: #2ee59d;
  box-shadow: 0 0 8px #2ee59d;
}

.zig-dot.current {
  background: #00e8ff;
  border-color: #00e8ff;
  box-shadow: 0 0 10px #00e8ff;
  animation: zigPulse 1.2s ease-in-out infinite;
}

.zig-dot.next {
  border-color: #ffb020;
  box-shadow: 0 0 8px rgba(255, 176, 32, 0.7);
}

.zig-id {
  margin-top: 3px;
  font-family: 'Rajdhani', 'Segoe UI', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: #9eb8c6;
  line-height: 1;
  white-space: nowrap;
}

.zig-dot.current + .zig-id {
  color: #00e8ff;
  text-shadow: 0 0 6px rgba(0, 232, 255, 0.6);
}

.zig-dot.arrived + .zig-id {
  color: #2ee59d;
}

@keyframes zigDash {
  to {
    background-position: 8px 0;
  }
}

@keyframes zigPulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.15);
    opacity: 0.75;
  }
}
</style>
