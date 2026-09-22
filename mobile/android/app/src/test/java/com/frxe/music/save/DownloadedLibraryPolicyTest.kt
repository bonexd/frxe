package com.frxe.music.save

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DownloadedLibraryPolicyTest {
    @Test
    fun `completed downloads become newest-first playable local entries`() {
        val older = item(
            id = "older",
            state = DownloadQueueItemState.Complete,
            savedUri = "content://media/older.mp3",
            updatedAtMs = 10L,
            savedTitle = "Saved older"
        )
        val newer = item(
            id = "newer",
            state = DownloadQueueItemState.Complete,
            savedUri = "content://media/newer.mp3",
            updatedAtMs = 20L
        )
        val failed = item(
            id = "failed",
            state = DownloadQueueItemState.Failed,
            savedUri = null,
            updatedAtMs = 30L
        )

        val entries = DownloadedLibraryPolicy.entries(
            listOf(older, failed, newer)
        )

        assertEquals(listOf("newer", "older"), entries.map { it.queueItemId })
        assertEquals("content://media/newer.mp3", entries.first().track.streamUrl)
        assertEquals("Song newer", entries.first().track.title)
        assertEquals("Saved older", entries.last().track.title)
        assertEquals("https://example.com/older", entries.last().track.downloadUrl)
        assertEquals("Downloads", entries.first().track.album)
    }

    @Test
    fun `completed entries without a local uri are hidden`() {
        val entries = DownloadedLibraryPolicy.entries(
            listOf(
                item(
                    id = "missing",
                    state = DownloadQueueItemState.Complete,
                    savedUri = "   ",
                    updatedAtMs = 10L
                )
            )
        )

        assertTrue(entries.isEmpty())
    }

    private fun item(
        id: String,
        state: DownloadQueueItemState,
        savedUri: String?,
        updatedAtMs: Long,
        savedTitle: String? = null
    ) = DownloadQueueItem(
        id = id,
        sourceUrl = "https://example.com/$id",
        title = "Song $id",
        artist = "Artist",
        format = "MP3",
        quality = "Mp3K320",
        state = state,
        savedUri = savedUri,
        savedTitle = savedTitle,
        createdAtMs = 1L,
        updatedAtMs = updatedAtMs
    )
}
