package com.frxe.music.playback

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ExternalPlaybackSelectionPolicyTest {
    @Test
    fun sameQueueTrackDoesNotMirror() {
        assertFalse(
            ExternalPlaybackSelectionPolicy.shouldMirror(
                currentQueueTrackId = "track-1",
                selectedMediaId = "track-1"
            )
        )
    }

    @Test
    fun differentTrackMirrors() {
        assertTrue(
            ExternalPlaybackSelectionPolicy.shouldMirror(
                currentQueueTrackId = "track-1",
                selectedMediaId = "track-2"
            )
        )
    }

    @Test
    fun blankOrMissingSelectionDoesNotMirror() {
        assertFalse(
            ExternalPlaybackSelectionPolicy.shouldMirror(
                currentQueueTrackId = "track-1",
                selectedMediaId = null
            )
        )
        assertFalse(
            ExternalPlaybackSelectionPolicy.shouldMirror(
                currentQueueTrackId = "track-1",
                selectedMediaId = "   "
            )
        )
    }
}
