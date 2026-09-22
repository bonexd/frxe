package com.frxe.music.ytdlp

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class YtDlpPostProcessingPolicyTest {

    @Test
    fun `requested thumbnail is retained as a sidecar for final save`() {
        val options = YtDlpPostProcessingPolicy.arguments(
            request = YtDlpDownloadRequest(
                sourceUrl = "https://example.com/watch?v=abc",
                title = "Track",
                artist = "Artist",
                embedThumbnail = true
            ),
            capabilities = YtDlpCoreCapabilities(
                ytDlpReady = true,
                mutagenReady = false
            )
        )

        assertTrue(options.contains(YtDlpOption("--write-thumbnail")))
        assertFalse(options.contains(YtDlpOption("--embed-thumbnail")))
    }

    @Test
    fun `thumbnail options are absent when artwork is disabled`() {
        val options = YtDlpPostProcessingPolicy.arguments(
            request = YtDlpDownloadRequest(
                sourceUrl = "https://example.com/watch?v=abc",
                title = "Track",
                artist = "Artist",
                embedThumbnail = false
            ),
            capabilities = YtDlpCoreCapabilities(
                ytDlpReady = true,
                mutagenReady = true
            )
        )

        assertFalse(options.any { it.option == "--write-thumbnail" })
        assertFalse(options.any { it.option == "--embed-thumbnail" })
    }
}
