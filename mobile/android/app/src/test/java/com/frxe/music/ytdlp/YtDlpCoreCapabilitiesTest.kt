package com.frxe.music.ytdlp

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class YtDlpCoreCapabilitiesTest {
    @Test
    fun capabilityResultsAreTrackedIndependently() {
        val initial = YtDlpCoreCapabilities()

        val ytDlpReady = initial.withCapability(
            YtDlpCoreCapability.YtDlp,
            ready = true
        )
        assertTrue(ytDlpReady.ytDlpReady)
        assertFalse(ytDlpReady.ffmpegReady)
        assertFalse(ytDlpReady.aria2cReady)

        val ariaReady = ytDlpReady.withCapability(
            YtDlpCoreCapability.Aria2c,
            ready = true
        )
        assertTrue(ariaReady.ytDlpReady)
        assertFalse(ariaReady.ffmpegReady)
        assertTrue(ariaReady.aria2cReady)

        val ffmpegFailure = ariaReady.withCapability(
            YtDlpCoreCapability.FFmpeg,
            ready = false
        )
        assertTrue(ffmpegFailure.ytDlpReady)
        assertFalse(ffmpegFailure.ffmpegReady)
        assertTrue(ffmpegFailure.aria2cReady)
    }
}
