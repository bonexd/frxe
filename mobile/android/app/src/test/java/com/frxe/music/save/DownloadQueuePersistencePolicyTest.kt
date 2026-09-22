package com.frxe.music.save

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DownloadQueuePersistencePolicyTest {

    @Test
    fun `native queue item round trips execution payload`() {
        val item = DownloadQueueItem(
            id = "native-1",
            sourceUrl = "https://example.com/watch?v=1",
            title = "Track",
            artist = "Artist",
            format = SaveFormat.MP3.name,
            quality = SaveQuality.Mp3K320.name,
            executionKind = DownloadExecutionKind.YtDlp,
            engineRequestJson = "{\"sourceUrl\":\"https://example.com/watch?v=1\"}",
            createdAtMs = 100L,
            updatedAtMs = 100L
        )

        val restored = DownloadQueueItemCodec.decode(
            DownloadQueueItemCodec.encode(listOf(item))
        ).single()

        assertEquals(DownloadExecutionKind.YtDlp, restored.executionKind)
        assertEquals(item.engineRequestJson, restored.engineRequestJson)
        assertEquals(item.sourceUrl, restored.sourceUrl)
        assertEquals(item.format, restored.format)
        assertEquals(item.quality, restored.quality)
    }

    @Test
    fun `legacy persisted item without execution fields stays legacy`() {
        val raw = """[
            {
              "id":"legacy-1",
              "sourceUrl":"https://example.com/audio.mp3",
              "title":"Old item",
              "artist":"Artist",
              "format":"MP3",
              "quality":"Mp3K320",
              "state":"Queued",
              "progress":0.0,
              "message":"Queued",
              "retryCount":0,
              "createdAtMs":10,
              "updatedAtMs":10
            }
        ]""".trimIndent()

        val restored = DownloadQueueItemCodec.decode(raw).single()

        assertEquals(DownloadExecutionKind.Legacy, restored.executionKind)
        assertNull(restored.engineRequestJson)
    }

    @Test
    fun `native duplicate identity stays source format and quality`() {
        val native = DownloadQueueItem(
            id = "native-duplicate",
            sourceUrl = "https://Example.com/watch?v=abc",
            title = "Track",
            artist = "Artist",
            format = SaveFormat.MP3.name,
            quality = SaveQuality.Mp3K320.name,
            executionKind = DownloadExecutionKind.YtDlp,
            engineRequestJson = "{}",
            createdAtMs = 1L,
            updatedAtMs = 1L
        )

        val duplicate = DownloadQueuePolicy.findDuplicate(
            items = listOf(native),
            sourceUrl = "https://example.com/watch?v=abc",
            format = SaveFormat.MP3.name,
            quality = SaveQuality.Mp3K320.name
        )

        assertEquals(native, duplicate)
    }
}
