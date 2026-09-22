package com.frxe.music.playback

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AudioOnlyPlaybackPolicyTest {

    @Test
    fun `catalog and youtube page urls require resolution`() {
        assertFalse(
            AudioOnlyPlaybackPolicy.isPlayable(
                "frxe-catalog://youtube/dQw4w9WgXcQ"
            )
        )
        assertFalse(
            AudioOnlyPlaybackPolicy.isPlayable(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
            )
        )
        assertFalse(
            AudioOnlyPlaybackPolicy.isPlayable(
                "https://youtu.be/dQw4w9WgXcQ"
            )
        )
    }

    @Test
    fun `resolved cdn and local urls are playable`() {
        assertTrue(
            AudioOnlyPlaybackPolicy.isPlayable(
                "https://rr1---sn.example.googlevideo.com/videoplayback?id=audio"
            )
        )
        assertTrue(
            AudioOnlyPlaybackPolicy.isPlayable(
                "content://media/external/audio/media/42"
            )
        )
        assertTrue(
            AudioOnlyPlaybackPolicy.isPlayable(
                "file:///storage/emulated/0/Music/song.mp3"
            )
        )
    }
}
