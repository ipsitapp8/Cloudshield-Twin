import { createContext, useContext, type ReactNode } from 'react'
import { useLiveSocket, type ConnectionState, type LiveMessage } from './useLiveSocket'

interface LiveContextValue {
  connectionState: ConnectionState
  lastMessage: LiveMessage | null
  messageCount: number
}

const LiveContext = createContext<LiveContextValue | null>(null)

export function LiveProvider({ children }: { children: ReactNode }) {
  const value = useLiveSocket()
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}

export function useLive(): LiveContextValue {
  const ctx = useContext(LiveContext)
  if (!ctx) throw new Error('useLive must be used within a LiveProvider')
  return ctx
}
