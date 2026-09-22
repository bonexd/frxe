package com.frxe.music.save

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DownloadQueuePolicyTest {

    @Test
    fun `failed download does not block a fresh download attempt`() {
        val failed = DownloadQueueItem(
            id = "failed-same-source",
            sourceUrl = "https://www.youtube.com/watch?v=abc123",
            title = "Track",
            artist = "Artist",
            format = SaveFormat.MP3.name,
            quality = SaveQuality.Mp3K320.name,
            state = DownloadQueueItemState.Failed,
            progress = 0f,
            message = "Previous attempt failed",
            createdAtMs = 100L,
            updatedAtMs = 100L
        )

        val duplicate = DownloadQueuePolicy.findDuplicate(
            items = listOf(failed),
            sourceUrl = failed.sourceUrl,
            format = failed.format,
            quality = failed.quality
        )

        assertNull(duplicate)
    }

    @Test
    fun `missing completed download becomes retryable failure`() {
        val item = item(
            id = "complete-missing",
            state = DownloadQueueItemState.Complete,
            progress = 1f,
            savedUri = "file:///missing/song.mp3",
            savedTitle = "Saved title"
        )

        val repaired = DownloadQueuePolicy.reconcileCompletedDownloads(
            items = listOf(item),
            nowMs = 200L,
            uriExists = { false }
        ).single()

        assertEquals(DownloadQueueItemState.Failed, repaired.state)
        assertEquals(0f, repaired.progress)
        assertEquals("Downloaded file is missing", repaired.message)
        assertNull(repaired.savedUri)
        assertNull(repaired.savedTitle)
        assertEquals(200L, repaired.updatedAtMs)
    }

    @Test
    fun `accessible completed download stays complete`() {
        val item = item(
            id = "complete-present",
            state = DownloadQueueItemState.Complete,
            progress = 1f,
            savedUri = "content://media/song/42"
        )

        val repaired = DownloadQueuePolicy.reconcileCompletedDownloads(
            items = listOf(item),
            nowMs = 200L,
            uriExists = { true }
        ).single()

        assertEquals(item, repaired)
    }

    @Test
    fun `retry all failed resets failures without touching other states`() {
        val failed = item(
            id = "failed",
            state = DownloadQueueItemState.Failed,
            progress = 0.5f,
            retryCount = 2,
            savedUri = "file:///stale.mp3"
        )
        val paused = item(
            id = "paused",
            state = DownloadQueueItemState.Paused,
            progress = 0.4f
        )

        val updated = DownloadQueuePolicy.retryAllFailed(
            items = listOf(failed, paused),
            nowMs = 300L
        )

        val retried = updated.first { it.id == "failed" }
        assertEquals(DownloadQueueItemState.Queued, retried.state)
        assertEquals(0f, retried.progress)
        assertEquals(0, retried.retryCount)
        assertEquals("Queued", retried.message)
        assertNull(retried.savedUri)
        assertEquals(300L, retried.updatedAtMs)
        assertEquals(paused, updated.first { it.id == "paused" })
    }

    @Test
    fun `clear failed and cancelled keeps active and completed downloads`() {
        val items = listOf(
            item("queued", DownloadQueueItemState.Queued),
            item("failed", DownloadQueueItemState.Failed),
            item("cancelled", DownloadQueueItemState.Cancelled),
            item(
                id = "complete",
                state = DownloadQueueItemState.Complete,
                progress = 1f,
                savedUri = "content://media/song/7"
            )
        )

        val cleaned = DownloadQueuePolicy.clearFailedAndCancelled(items)

        assertEquals(listOf("queued", "complete"), cleaned.map { it.id })
        assertTrue(cleaned.any { it.state == DownloadQueueItemState.Complete })
    }

    private fun item(
        id: String,
        state: DownloadQueueItemState,
        progress: Float = 0f,
        retryCount: Int = 0,
        savedUri: String? = null,
        savedTitle: String? = null
    ) = DownloadQueueItem(
        id = id,
        sourceUrl = "https://example.com/$id",
        title = id,
        artist = "Artist",
        format = SaveFormat.MP3.name,
        quality = SaveQuality.Mp3K320.name,
        state = state,
        progress = progress,
        message = state.name,
        retryCount = retryCount,
        savedUri = savedUri,
        savedTitle = savedTitle,
        createdAtMs = 100L,
        updatedAtMs = 100L
    )
}
