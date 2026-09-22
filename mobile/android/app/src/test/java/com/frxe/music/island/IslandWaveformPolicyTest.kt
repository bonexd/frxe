package com.frxe.music.island

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class IslandWaveformPolicyTest {
    @Test
    fun playingWaveChangesContinuouslyWithPhase() {
        val first = IslandWaveformPolicy.levels(phase = 0f, isPlaying = true)
        val second = IslandWaveformPolicy.levels(phase = 0.2f, isPlaying = true)

        assertNotEquals(first, second)
        assertTrue(first.all { it in 0.18f..1f })
        assertTrue(second.all { it in 0.18f..1f })
    }

    @Test
    fun pausedWaveIsStable() {
        assertEquals(
            IslandWaveformPolicy.levels(phase = 0f, isPlaying = false),
            IslandWaveformPolicy.levels(phase = 0.8f, isPlaying = false)
        )
    }
}
