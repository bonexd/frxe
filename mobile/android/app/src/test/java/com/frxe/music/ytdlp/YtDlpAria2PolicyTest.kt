package com.frxe.music.ytdlp

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class YtDlpAria2PolicyTest {

    @Test
    fun `aria2 requires request preference and ready capability`() {
        val request = YtDlpDownloadRequest(
            sourceUrl = "https://example.com/a",
            title = "A",
            artist = "B",
            useAcceleratedDownloader = true
        )

        assertTrue(
            YtDlpAria2Policy.shouldUse(
                request,
                YtDlpCoreCapabilities(
                    ytDlpReady = true,
                    aria2cReady = true
                )
            )
        )
        assertFalse(
            YtDlpAria2Policy.shouldUse(
                request,
                YtDlpCoreCapabilities(
                    ytDlpReady = true,
                    aria2cReady = false
                )
            )
        )
        assertFalse(
            YtDlpAria2Policy.shouldUse(
                request.copy(useAcceleratedDownloader = false),
                YtDlpCoreCapabilities(
                    ytDlpReady = true,
                    aria2cReady = true
                )
            )
        )
    }
}
