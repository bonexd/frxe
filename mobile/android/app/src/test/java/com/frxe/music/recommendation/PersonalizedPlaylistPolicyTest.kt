package com.frxe.music.recommendation

import com.frxe.music.model.Track
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PersonalizedPlaylistPolicyTest {
    private fun track(id: String, artist: String) = Track(
        id = id,
        title = "Song $id",
        artist = artist,
        album = "Catalog",
        streamUrl = "frxe-catalog://youtube/abcdefghijk",
        durationMs = 180_000L,
        artworkSeed = id.hashCode()
    )

    @Test
    fun buildsSpotifyInspiredFrxeMixesWithoutDuplicateTracks() {
        val favorite = listOf(track("a", "Alpha"), track("b", "Alpha"))
        val discovery = listOf(track("c", "Beta"), track("d", "Gamma"))
        val trending = listOf(track("d", "Gamma"), track("e", "Delta"))

        val playlists = PersonalizedPlaylistPolicy.build(
            favoriteArtist = "Alpha",
            favoriteTracks = favorite,
            discoveryTracks = discovery,
            trendingTracks = trending
        )

        assertEquals(
            listOf("FRXE Mix 1", "FRXE Mix 2", "Discovery Mix", "Trending Mix"),
            playlists.map { it.title }
        )
        assertTrue(playlists.all { it.tracks.isNotEmpty() })
        assertTrue(playlists.all { section -> section.tracks.distinctBy(Track::id).size == section.tracks.size })
        assertTrue(playlists.first().subtitle.orEmpty().contains("Alpha"))
    }
}
