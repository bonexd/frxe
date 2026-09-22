package com.frxe.music.playback

import com.frxe.music.model.Track
import com.frxe.music.source.PlaybackResolverKind
import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackPrefetchCacheMultiTest {
    private fun track(id: String) = Track(
        id = id,
        title = id,
        artist = "artist",
        album = "album",
        streamUrl = "https://audio.example/$id",
        durationMs = 1_000L,
        artworkSeed = id.hashCode(),
        originalStreamUrl = "frxe-catalog://youtube/abcdefghijk"
    )

    @Test
    fun keepsMoreThanOneUpcomingTrack() {
        PlaybackPrefetchCache.clear()
        val first = track("first")
        val second = track("second")

        PlaybackPrefetchCache.put(
            track = first,
            resolver = PlaybackResolverKind.YtDlp,
            headers = emptyMap(),
            originalSource = first.originalStreamUrl!!,
            resolvedAtMs = 10_000L
        )
        PlaybackPrefetchCache.put(
            track = second,
            resolver = PlaybackResolverKind.YtDlp,
            headers = emptyMap(),
            originalSource = second.originalStreamUrl!!,
            resolvedAtMs = 10_000L
        )

        assertEquals(
            "first",
            PlaybackPrefetchCache.forTrack(first, nowMs = 10_100L)?.track?.id
        )
        assertEquals(
            "second",
            PlaybackPrefetchCache.forTrack(second, nowMs = 10_100L)?.track?.id
        )
    }
}
