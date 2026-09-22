package com.frxe.music.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AndroidAutoBrowsePolicyTest {
    @Test
    fun rootCategoriesStayStableAndDriverSafe() {
        assertEquals(
            listOf(
                "frxe:auto:library",
                "frxe:auto:recent",
                "frxe:auto:playlists",
                "frxe:auto:queue"
            ),
            AndroidAutoBrowsePolicy.rootCategoryIds
        )
    }

    @Test
    fun playlistIdRoundTrips() {
        val mediaId = AndroidAutoBrowsePolicy.playlistId(42L)

        assertEquals(
            AndroidAutoBrowseTarget.Playlist(42L),
            AndroidAutoBrowsePolicy.parse(mediaId)
        )
    }

    @Test
    fun trackIdPreservesOpaqueTrackValue() {
        val mediaId = AndroidAutoBrowsePolicy.trackId("abc:def/123")

        assertEquals(
            AndroidAutoBrowseTarget.Track("abc:def/123"),
            AndroidAutoBrowsePolicy.parse(mediaId)
        )
    }

    @Test
    fun queueEntryIdPreservesOpaqueEntryValue() {
        val mediaId = AndroidAutoBrowsePolicy.queueItemId("entry:1/2")

        assertEquals(
            AndroidAutoBrowseTarget.QueueItem("entry:1/2"),
            AndroidAutoBrowsePolicy.parse(mediaId)
        )
    }

    @Test
    fun knownStaticIdsParse() {
        assertEquals(
            AndroidAutoBrowseTarget.Root,
            AndroidAutoBrowsePolicy.parse(AndroidAutoBrowsePolicy.ROOT)
        )
        assertEquals(
            AndroidAutoBrowseTarget.Library,
            AndroidAutoBrowsePolicy.parse(AndroidAutoBrowsePolicy.LIBRARY)
        )
        assertEquals(
            AndroidAutoBrowseTarget.Recent,
            AndroidAutoBrowsePolicy.parse(AndroidAutoBrowsePolicy.RECENT)
        )
        assertEquals(
            AndroidAutoBrowseTarget.Playlists,
            AndroidAutoBrowsePolicy.parse(AndroidAutoBrowsePolicy.PLAYLISTS)
        )
        assertEquals(
            AndroidAutoBrowseTarget.Queue,
            AndroidAutoBrowsePolicy.parse(AndroidAutoBrowsePolicy.QUEUE)
        )
    }

    @Test
    fun invalidIdsAreRejected() {
        assertNull(AndroidAutoBrowsePolicy.parse(""))
        assertNull(AndroidAutoBrowsePolicy.parse("frxe:auto:unknown"))
        assertNull(AndroidAutoBrowsePolicy.parse("frxe:auto:playlist:nope"))
        assertNull(AndroidAutoBrowsePolicy.parse("frxe:auto:track:"))
        assertNull(AndroidAutoBrowsePolicy.parse("frxe:auto:queue-item:"))
    }

    @Test
    fun boundKeepsPrefixOnly() {
        assertEquals(
            listOf(1, 2, 3),
            AndroidAutoBrowsePolicy.bound(
                listOf(1, 2, 3, 4, 5),
                3
            )
        )
        assertEquals(
            emptyList<Int>(),
            AndroidAutoBrowsePolicy.bound(
                listOf(1, 2, 3),
                0
            )
        )
    }
}
