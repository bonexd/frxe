package com.frxe.music.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class LikedTrackPersistencePolicyTest {
    @Test
    fun roundTripsTrackIdsWithoutDependingOnMutableStringSet() {
        val ids = setOf("track-b", "track-a", "track-c")
        val encoded = LikedTrackPersistencePolicy.encode(ids)
        assertEquals(ids, LikedTrackPersistencePolicy.decode(encoded))
    }

    @Test
    fun emptyAndLegacyBlankValuesRestoreSafely() {
        assertEquals(emptySet<String>(), LikedTrackPersistencePolicy.decode(null))
        assertEquals(emptySet<String>(), LikedTrackPersistencePolicy.decode(""))
    }
}
