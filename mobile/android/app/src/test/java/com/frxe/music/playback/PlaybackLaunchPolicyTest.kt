package com.frxe.music.playback

import com.frxe.music.model.Track
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackLaunchPolicyTest {
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
    fun selectedTrackKeepsWholeQueueForEndOfTrackAdvance() {
        val first = track("first")
        val second = track("second")
        val third = track("third")

        val plan = PlaybackLaunchPolicy.plan(
            selected = second,
            requestedQueue = listOf(first, second, third)
        )

        assertEquals(listOf(first, second, third), plan.tracks)
        assertEquals("second", plan.currentTrackId)
    }

    @Test
    fun missingSelectedTrackIsInsertedInsteadOfDroppingQueue() {
        val selected = track("selected")
        val other = track("other")

        val plan = PlaybackLaunchPolicy.plan(
            selected = selected,
            requestedQueue = listOf(other)
        )

        assertEquals(listOf(selected, other), plan.tracks)
        assertEquals("selected", plan.currentTrackId)
    }
    @Test
    fun preserveCurrentSelectionOnlyForSameTrackId() {
        val current = track("same")

        assertTrue(
            PlaybackLaunchPolicy.shouldPreserveCurrentSelection(
                selected = track("same"),
                current = current
            )
        )
        assertFalse(
            PlaybackLaunchPolicy.shouldPreserveCurrentSelection(
                selected = track("other"),
                current = current
            )
        )
    }

}
