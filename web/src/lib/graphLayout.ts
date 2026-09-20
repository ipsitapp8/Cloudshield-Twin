import dagre from 'dagre'
import type { Edge, Node } from '@xyflow/react'
import type { TwinEdge, TwinGraph, TwinNode } from '../api/types'

const NODE_WIDTH = 168
const NODE_HEIGHT = 56

const KIND_COLOR: Record<string, string> = {
  internet: '#334155', // slate
  host: '#1e3a8a', // blue-900
  service: '#0e7490', // cyan-700
  datastore: '#7e22ce', // purple-700
  imds: '#92400e', // amber-800
  aws_role: '#155e75', // cyan-800
  aws_bucket: '#166534', // green-800
}

const STATE_RING: Record<string, string> = {
  ok: '#334155',
  degraded: '#d97706',
  down: '#dc2626',
  compromised: '#c026d3',
}

export interface FlowElements {
  nodes: Node[]
  edges: Edge[]
}

export interface HighlightSpec {
  nodeIds?: Set<string>
  edgeKeys?: Set<string>
  edgeMitre?: Map<string, string[]>
}

export function edgeKey(src: string, dst: string): string {
  return `${src}->${dst}`
}

function labelForNode(n: TwinNode): string {
  const portSuffix = n.ports.length ? `:${n.ports.join(',')}` : ''
  return `${n.id}${portSuffix}`
}

/** Pure transform: backend TwinGraph JSON -> @xyflow/react elements, dagre-laid-out.
 * Kept separate from the React component so it is unit-testable without mounting xyflow. */
export function buildFlowElements(
  graph: TwinGraph,
  highlight?: HighlightSpec,
  direction: 'LR' | 'TB' = 'LR',
): FlowElements {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: 36, ranksep: 90 })

  graph.nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }))
  const validEdges = graph.edges.filter((e: TwinEdge) => g.hasNode(e.src) && g.hasNode(e.dst))
  validEdges.forEach((e) => g.setEdge(e.src, e.dst))
  dagre.layout(g)

  const dimmed = Boolean(highlight?.nodeIds && highlight.nodeIds.size > 0)

  const nodes: Node[] = graph.nodes.map((n) => {
    const pos = g.node(n.id) ?? { x: 0, y: 0 }
    const isHighlighted = highlight?.nodeIds?.has(n.id) ?? !dimmed
    return {
      id: n.id,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: { label: labelForNode(n), kind: n.kind, state: n.state },
      style: {
        width: NODE_WIDTH,
        background: KIND_COLOR[n.kind] ?? '#1f2937',
        color: '#f1f5f9',
        border: `2px solid ${STATE_RING[n.state] ?? '#334155'}`,
        borderRadius: 8,
        fontSize: 12,
        padding: 6,
        opacity: isHighlighted ? 1 : 0.25,
      },
    }
  })

  const edges: Edge[] = validEdges.map((e) => {
    const key = edgeKey(e.src, e.dst)
    const isHighlighted = highlight?.edgeKeys?.has(key) ?? !dimmed
    const mitre = highlight?.edgeMitre?.get(key)
    return {
      id: key,
      source: e.src,
      target: e.dst,
      animated: e.kind === 'flow' && e.observed,
      label: mitre?.length ? mitre.join(', ') : e.kind === 'grants' ? 'grants' : undefined,
      style: {
        stroke: mitre?.length ? '#dc2626' : '#64748b',
        strokeDasharray: e.observed ? undefined : '4 3',
        opacity: isHighlighted ? 1 : 0.15,
      },
      labelStyle: { fill: '#fca5a5', fontSize: 10 },
    }
  })

  return { nodes, edges }
}
