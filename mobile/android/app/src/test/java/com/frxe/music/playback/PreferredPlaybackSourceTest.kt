package com.frxe.music.playback

import com.frxe.music.model.Track
import org.junit.Assert.assertEquals
import org.junit.Test

class PreferredPlaybackSourceTest {

    @Test
    fun `local content copy wins over catalog source for same track`() {
        val requested = track(
            id = "yt-dQw4w9WgXcQ",
            streamUrl = "frxe-catalog://youtube/dQw4w9WgXcQ"
        )
        val downloaded = requested.copy(
            streamUrl = "content://media/external/audio/media/42",
            downloadUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        )

        assertEquals(
            downloaded,
            PreferredPlaybackSource.choose(
                requested = requested,
                candidates = listOf(downloaded)
            )
        )
    }

    @Test
    fun `remote copy does not replace requested source`() {
        val requested = track(
            id = "yt-dQw4w9WgXcQ",
            streamUrl = "frxe-catalog://youtube/dQw4w9WgXcQ"
        )
        val remote = requested.copy(
            streamUrl = "https://example.com/audio.m4a"
        )

        assertEquals(
            requested,
            PreferredPlaybackSource.choose(
                requested = requested,
                candidates = listOf(remote)
            )
        )
    }

    @Test
    fun `local copy for another track does not replace requested track`() {
        val requested = track(
            id = "yt-dQw4w9WgXcQ",
            streamUrl = "frxe-catalog://youtube/dQw4w9WgXcQ"
        )
        val other = track(
            id = "yt-aaaaaaaaaaa",
            streamUrl = "file:///storage/emulated/0/Music/other.mp3"
        )

        assertEquals(
            requested,
            PreferredPlaybackSource.choose(
                requested = requested,
                candidates = listOf(other)
            )
        )
    }

    private fun track(
        id: String,
        streamUrl: String
    ) = Track(
        id = id,
        title = "Track",
        artist = "Artist",
        album = "Album",
        streamUrl = streamUrl,
        durationMs = 180_000L,
        artworkSeed = 7
    )
}
