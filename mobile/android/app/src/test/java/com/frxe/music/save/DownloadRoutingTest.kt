package com.frxe.music.save

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DownloadRoutingTest {

    @Test
    fun `catalog uri becomes canonical youtube watch url`() {
        assertEquals(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            automaticDownloadSource(
                downloadUrl = null,
                streamUrl = "frxe-catalog://youtube/dQw4w9WgXcQ"
            )
        )
    }

    @Test
    fun `youtube sources route through Seal then Pipe fallback`() {
        val backends = DownloadRoutePolicy.backendsFor(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        )

        assertEquals(
            listOf(
                DownloadBackend.Seal,
                DownloadBackend.NewPipe
            ),
            backends
        )
        assertFalse(backends.contains(DownloadBackend.Direct))
    }

    @Test
    fun `direct audio sources stay direct`() {
        val backends = DownloadRoutePolicy.backendsFor(
            "https://cdn.example.com/audio/song.m4a"
        )

        assertEquals(listOf(DownloadBackend.Direct), backends)
        assertTrue(isDirectDownloadUrl("https://cdn.example.com/audio/song.m4a"))
    }
}
