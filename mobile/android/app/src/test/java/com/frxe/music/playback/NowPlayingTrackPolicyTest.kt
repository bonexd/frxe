package com.frxe.music.playback

import com.frxe.music.model.Track
import org.junit.Assert.assertEquals
import org.junit.Test

class NowPlayingTrackPolicyTest {
    private fun track(id: String) = Track(
        id = id,
        title = id,
        artist = "artist-$id",
        album = "album",
        streamUrl = "frxe-catalog://youtube/abcdefghijk",
        durationMs = 180_000L,
        artworkSeed = id.hashCode()
    )

    @Test
    fun queuedTrackRestoresNowPlayingWhenSessionHasNoResolvedMediaItem() {
        val queued = track("remembered")

        assertEquals(
            queued,
            NowPlayingTrackPolicy.select(
                sessionTrack = null,
                queuedTrack = queued
            )
        )
    }

    @Test
    fun resolvedSessionTrackWinsOverQueuedFallback() {
        val session = track("session")
        val queued = track("queued")

        assertEquals(
            session,
            NowPlayingTrackPolicy.select(
                sessionTrack = session,
                queuedTrack = queued
            )
        )
    }
}
