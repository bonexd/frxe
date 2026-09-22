package com.frxe.music.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class FavoriteIdPolicyTest {
    @Test
    fun togglingFavoriteAddsAndRemovesStableTrackId() {
        val added = FavoriteIdPolicy.toggle(
            current = emptySet(),
            trackId = "yt-abcdefghijk"
        )
        assertEquals(setOf("yt-abcdefghijk"), added)

        val removed = FavoriteIdPolicy.toggle(
            current = added,
            trackId = "yt-abcdefghijk"
        )
        assertEquals(emptySet<String>(), removed)
    }

    @Test
    fun normalizedSnapshotDoesNotExposeMutablePreferenceSet() {
        val mutable = mutableSetOf("yt-abcdefghijk")
        val snapshot = FavoriteIdPolicy.snapshot(mutable)
        mutable.clear()

        assertEquals(setOf("yt-abcdefghijk"), snapshot)
    }
}
