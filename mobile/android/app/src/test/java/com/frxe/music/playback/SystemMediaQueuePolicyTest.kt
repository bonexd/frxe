package com.frxe.music.playback

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SystemMediaQueuePolicyTest {
    @Test
    fun emptyQueueExposesNoSkipCommands() {
        val availability = SystemMediaQueuePolicy.availability(
            PlaybackQueueState(),
            QueueRepeatMode.Off
        )

        assertFalse(availability.previous)
        assertFalse(availability.next)
    }

    @Test
    fun middleOfQueueExposesPreviousAndNext() {
        val availability = SystemMediaQueuePolicy.availability(
            state(currentIndex = 1, size = 3),
            QueueRepeatMode.Off
        )

        assertTrue(availability.previous)
        assertTrue(availability.next)
    }

    @Test
    fun queueEdgesExposeOnlyValidDirection() {
        val first = SystemMediaQueuePolicy.availability(
            state(currentIndex = 0, size = 3),
            QueueRepeatMode.Off
        )
        val last = SystemMediaQueuePolicy.availability(
            state(currentIndex = 2, size = 3),
            QueueRepeatMode.Off
        )

        assertFalse(first.previous)
        assertTrue(first.next)
        assertTrue(last.previous)
        assertFalse(last.next)
    }

    @Test
    fun repeatAllExposesBothDirectionsForMultiItemQueue() {
        val first = SystemMediaQueuePolicy.availability(
            state(currentIndex = 0, size = 3),
            QueueRepeatMode.All
        )
        val last = SystemMediaQueuePolicy.availability(
            state(currentIndex = 2, size = 3),
            QueueRepeatMode.All
        )

        assertTrue(first.previous)
        assertTrue(first.next)
        assertTrue(last.previous)
        assertTrue(last.next)
    }

    @Test
    fun repeatOneDoesNotAdvertiseQueueSkipping() {
        val availability = SystemMediaQueuePolicy.availability(
            state(currentIndex = 1, size = 3),
            QueueRepeatMode.One
        )

        assertFalse(availability.previous)
        assertFalse(availability.next)
    }

    @Test
    fun singleItemQueueDoesNotExposeSkipCommands() {
        val off = SystemMediaQueuePolicy.availability(
            state(currentIndex = 0, size = 1),
            QueueRepeatMode.Off
        )
        val all = SystemMediaQueuePolicy.availability(
            state(currentIndex = 0, size = 1),
            QueueRepeatMode.All
        )

        assertFalse(off.previous)
        assertFalse(off.next)
        assertFalse(all.previous)
        assertFalse(all.next)
    }

    private fun state(
        currentIndex: Int,
        size: Int
    ): PlaybackQueueState {
        val entries = (0 until size).map { index ->
            PlaybackQueueEntry(
                entryId = "entry-$index",
                trackId = "track-$index",
                title = "Track $index",
                artist = "Artist",
                album = "Album",
                streamUrl = "https://example.com/$index.mp3",
                durationMs = 100_000L,
                artworkSeed = index
            )
        }

        return PlaybackQueueState(
            entries = entries,
            currentIndex = currentIndex
        )
    }
}
