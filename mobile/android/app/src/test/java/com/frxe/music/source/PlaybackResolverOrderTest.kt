package com.frxe.music.source

import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackResolverOrderTest {
    @Test
    fun ytDlpIsPrimaryPlaybackResolver() {
        assertEquals(
            listOf(
                PlaybackResolverKind.YtDlp,
                PlaybackResolverKind.InnerTube,
                PlaybackResolverKind.NewPipe
            ),
            PlaybackResolverOrder.local
        )
    }
}
