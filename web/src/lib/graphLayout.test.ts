import { describe, expect, it } from 'vitest'
import { buildFlowElements, edgeKey } from './graphLayout'
import type { TwinGraph } from '../api/types'

const graph: TwinGraph = {
  nodes: [
    { id: 'internet', kind: 'internet', ports: [], tier: 0, sensitivity: 0, state: 'ok' },
    { id: 'redis', kind: 'datastore', ports: [6379], tier: 2, sensitivity: 2, state: 'ok', bind: '0.0.0.0' },
    { id: 'api', kind: 'service', ports: [3000], tier: 2, sensitivity: 1, state: 'ok' },
  ],
  edges: [
    { src: 'api', dst: 'redis', kind: 'flow', port: 6379, observed: true, dep: 'soft' },
    { src: 'internet', dst: 'redis', kind: 'exposes', port: 6379, observed: true, dep: 'none' },
  ],
}

describe('buildFlowElements', () => {
  it('produces one flow node per twin node with a computed position', () => {
    const { nodes } = buildFlowElements(graph)
    expect(nodes).toHaveLength(3)
    expect(nodes.map((n) => n.id).sort()).toEqual(['api', 'internet', 'redis'])
    for (const n of nodes) {
      expect(typeof n.position.x).toBe('number')
      expect(typeof n.position.y).toBe('number')
    }
  })

  it('produces one flow edge per twin edge, keyed by src->dst', () => {
    const { edges } = buildFlowElements(graph)
    expect(edges.map((e) => e.id).sort()).toEqual([edgeKey('api', 'redis'), edgeKey('internet', 'redis')])
  })

  it('dims nodes/edges not in the highlight set, and labels mitre ids', () => {
    const key = edgeKey('internet', 'redis')
    const { nodes, edges } = buildFlowElements(graph, {
      nodeIds: new Set(['internet', 'redis']),
      edgeKeys: new Set([key]),
      edgeMitre: new Map([[key, ['T1190']]]),
    })

    const apiNode = nodes.find((n) => n.id === 'api')!
    const redisNode = nodes.find((n) => n.id === 'redis')!
    expect((apiNode.style as { opacity: number }).opacity).toBeLessThan(1)
    expect((redisNode.style as { opacity: number }).opacity).toBe(1)

    const highlighted = edges.find((e) => e.id === key)!
    expect(highlighted.label).toBe('T1190')
    expect((highlighted.style as { opacity: number }).opacity).toBe(1)

    const other = edges.find((e) => e.id === edgeKey('api', 'redis'))!
    expect((other.style as { opacity: number }).opacity).toBeLessThan(1)
  })

  it('skips edges whose endpoints are missing from the node set', () => {
    const partial: TwinGraph = {
      nodes: [graph.nodes[1]],
      edges: graph.edges,
    }
    const { edges } = buildFlowElements(partial)
    expect(edges).toHaveLength(0)
  })
})
