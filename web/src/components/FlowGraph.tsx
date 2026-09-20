import { useMemo } from 'react'
import { Background, Controls, ReactFlow, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { TwinGraph } from '../api/types'
import { buildFlowElements, type HighlightSpec } from '../lib/graphLayout'

export function FlowGraph({
  graph,
  highlight,
  height = 420,
}: {
  graph: TwinGraph
  highlight?: HighlightSpec
  height?: number
}) {
  const { nodes, edges } = useMemo(() => buildFlowElements(graph, highlight), [graph, highlight])

  return (
    <div style={{ height }} className="overflow-hidden rounded border border-slate-800" data-testid="flow-graph">
      <ReactFlow
        nodes={nodes as Node[]}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={16} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
