package com.frxe.music.recommendation

import com.frxe.music.model.Track
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HybridRecommendationEngineTest {
    private fun track(
        id: String,
        artist: String,
        album: String = "Album",
        title: String = "Song $id"
    ) = Track(
        id = id,
        title = title,
        artist = artist,
        album = album,
        streamUrl = "https://example.invalid/$id.mp3",
        durationMs = 210_000L,
        artworkSeed = id.hashCode()
    )

    @Test
    fun penalizesImmediateRepeatsWhileKeepingSessionTaste() {
        val played = track("played", "Alpha", album = "Night")
        val freshSameTaste = track("fresh-alpha", "Alpha", album = "Night")
        val unrelated = track("fresh-zeta", "Zeta", album = "Day")

        val ranked = HybridRecommendationEngine.rank(
            candidates = listOf(played, unrelated, freshSameTaste),
            history = listOf(played),
            library = listOf(played),
            likedIds = emptySet(),
            limit = 3
        )

        assertEquals("fresh-alpha", ranked.first().id)
        assertFalse(ranked.take(2).first().id == "played")
    }

    @Test
    fun likedHistoryStrengthensMatchingArtist() {
        val likedSeed = track("liked", "Alpha", album = "Red")
        val alphaCandidate = track("alpha-new", "Alpha", album = "Elsewhere")
        val betaCandidate = track("beta-new", "Beta", album = "Elsewhere")

        val ranked = HybridRecommendationEngine.rank(
            candidates = listOf(betaCandidate, alphaCandidate),
            history = listOf(likedSeed),
            library = listOf(likedSeed),
            likedIds = setOf("liked"),
            limit = 2
        )

        assertEquals("alpha-new", ranked.first().id)
    }

    @Test
    fun capsArtistSaturation() {
        val candidates = listOf(
            track("a1", "Alpha"),
            track("a2", "Alpha"),
            track("a3", "Alpha"),
            track("a4", "Alpha"),
            track("b1", "Beta"),
            track("b2", "Beta"),
            track("g1", "Gamma")
        )

        val ranked = HybridRecommendationEngine.rank(
            candidates = candidates,
            history = emptyList(),
            library = emptyList(),
            likedIds = emptySet(),
            limit = 6,
            maxPerArtist = 2
        )

        assertTrue(ranked.count { it.artist == "Alpha" } <= 2)
        assertTrue(ranked.count { it.artist == "Beta" } <= 2)
        assertTrue(ranked.map { it.artist }.toSet().size >= 3)
    }

    @Test
    fun coldStartIsDeterministic() {
        val candidates = listOf(
            track("one", "One"),
            track("two", "Two"),
            track("three", "Three")
        )

        val first = HybridRecommendationEngine.rank(
            candidates = candidates,
            history = emptyList(),
            library = emptyList(),
            likedIds = emptySet()
        )
        val second = HybridRecommendationEngine.rank(
            candidates = candidates,
            history = emptyList(),
            library = emptyList(),
            likedIds = emptySet()
        )

        assertEquals(first.map(Track::id), second.map(Track::id))
        assertEquals(listOf("one", "two", "three"), first.map(Track::id))
    }
}
