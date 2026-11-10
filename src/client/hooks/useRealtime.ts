import { useCallback, useEffect, useRef, useState } from 'react'

import { RealtimeClient, type ConnectionState, type RealtimeHandlers } from '../realtime.js'

/** 建立并维持与后端的实时连接；回调通过 ref 保持最新，避免重连风暴。 */
export function useRealtime(handlers: RealtimeHandlers) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const clientRef = useRef<RealtimeClient | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('connecting')

  useEffect(() => {
    const client = new RealtimeClient({
      onHello: (message) => handlersRef.current.onHello?.(message),
      onStatus: (message) => handlersRef.current.onStatus?.(message),
      onEvents: (message) => handlersRef.current.onEvents?.(message),
      onError: (message) => handlersRef.current.onError?.(message),
      onConnection: (state) => setConnection(state),
      onAuthExpired: () => handlersRef.current.onAuthExpired?.(),
    })
    clientRef.current = client
    client.connect()
    return () => {
      client.close()
      clientRef.current = null
    }
  }, [])

  const subscribe = useCallback((roomId: number) => clientRef.current?.subscribe(roomId), [])
  const unsubscribe = useCallback((roomId: number) => clientRef.current?.unsubscribe(roomId), [])

  return { subscribe, unsubscribe, connection }
}
