package com.frxe.music.playback

import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackPrefetchWindowPolicyTest {
    @Test
    fun prefetchesTwoTracksAheadWhenAvailable() {
        assertEquals(
            listOf(3, 4),
            PlaybackPrefetchWindowPolicy.nextIndexes(
                currentIndex = 2,
                totalCount = 6
            )
        )
    }

    @Test
    fun stopsAtEndOfQueue() {
        assertEquals(
            listOf(5),
            PlaybackPrefetchWindowPolicy.nextIndexes(
                currentIndex = 4,
                totalCount = 6
            )
        )
    }
}
