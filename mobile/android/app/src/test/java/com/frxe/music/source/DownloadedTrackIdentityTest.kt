package com.frxe.music.source

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DownloadedTrackIdentityTest {

    @Test
    fun `youtube watch source maps back to catalog track id`() {
        assertEquals(
            "yt-dQw4w9WgXcQ",
            DownloadedTrackIdentity.trackIdForSource(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
            )
        )
    }

    @Test
    fun `catalog source maps to same stable track id`() {
        assertEquals(
            "yt-dQw4w9WgXcQ",
            DownloadedTrackIdentity.trackIdForSource(
                "frxe-catalog://youtube/dQw4w9WgXcQ"
            )
        )
    }

    @Test
    fun `unrelated direct audio has no catalog identity`() {
        assertNull(
            DownloadedTrackIdentity.trackIdForSource(
                "https://example.com/song.mp3"
            )
        )
    }
}
