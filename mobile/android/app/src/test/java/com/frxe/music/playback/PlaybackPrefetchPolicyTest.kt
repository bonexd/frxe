package com.frxe.music.playback

import com.frxe.music.source.PlaybackResolverKind
import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackPrefetchPolicyTest {
    @Test
    fun prefetchKeepsYtDlpFirst() {
        assertEquals(
            listOf(
                PlaybackResolverKind.YtDlp,
                PlaybackResolverKind.InnerTube,
                PlaybackResolverKind.NewPipe
            ),
            PlaybackPrefetchPolicy.resolverOrder
        )
    }
}
