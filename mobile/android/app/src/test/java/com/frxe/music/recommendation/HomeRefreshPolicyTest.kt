package com.frxe.music.recommendation

import com.frxe.music.model.Track
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeRefreshPolicyTest {
    private fun track(id: String) = Track(
        id = id,
        title = id,
        artist = "artist",
        album = "album",
        streamUrl = "frxe-catalog://youtube/abcdefghijk",
        durationMs = 1_000L,
        artworkSeed = 1
    )

    @Test
    fun identicalInputsDoNotTriggerAnotherRemoteRefresh() {
        val key = HomeRefreshPolicy.key(
            history = listOf(track("one")),
            library = listOf(track("two")),
            likedIds = setOf("one")
        )

        assertFalse(HomeRefreshPolicy.shouldRefresh(key, key))
    }

    @Test
    fun changedInputsTriggerRemoteRefresh() {
        val before = HomeRefreshPolicy.key(
            history = listOf(track("one")),
            library = emptyList(),
            likedIds = emptySet()
        )
        val after = HomeRefreshPolicy.key(
            history = listOf(track("one"), track("two")),
            library = emptyList(),
            likedIds = emptySet()
        )

        assertTrue(HomeRefreshPolicy.shouldRefresh(before, after))
    }
}
