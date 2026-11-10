import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import type { NormalizedEvent } from '../../shared/types.js'
import { feedStore } from '../feed-store.js'

export function useRoomFeed(roomId: number | null, paused: boolean) {
  const getSnapshot = useCallback(() => feedStore.snapshot(roomId), [roomId])
  const events = useSyncExternalStore(feedStore.subscribe, getSnapshot, getSnapshot)
  const [frozen, setFrozen] = useState<NormalizedEvent[] | null>(null)
  const [unseen, setUnseen] = useState(0)

  useEffect(() => {
    if (paused) {
      setFrozen(feedStore.snapshot(roomId))
      setUnseen(0)
    } else {
      setFrozen(null)
      setUnseen(0)
    }
  }, [paused, roomId])

  useEffect(() => {
    if (paused && frozen) setUnseen(Math.max(0, events.length - frozen.length))
  }, [events, paused, frozen])

  return {
    events: paused && frozen ? frozen : events,
    unseen,
    total: events.length,
  }
}
