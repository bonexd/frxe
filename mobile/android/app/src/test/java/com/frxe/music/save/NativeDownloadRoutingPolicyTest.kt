package com.frxe.music.save

import com.frxe.music.ytdlp.YtDlpDownloadRequest
import com.frxe.music.ytdlp.YtDlpDownloadRequestCodec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeDownloadRoutingPolicyTest {

    @Test
    fun `standard YouTube save request uses resilient legacy fallback route`() {
        val request = SaveRequest(
            sourceUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            title = "Track",
            artist = "Artist",
            format = SaveFormat.MP3,
            quality = SaveQuality.Mp3K320
        )

        val resolved = NativeDownloadRoutingPolicy.forSaveRequest(request)

        assertTrue(resolved is QueuedDownloadRequest.Legacy)
        assertEquals(
            request,
            (resolved as QueuedDownloadRequest.Legacy).request
        )
    }

    @Test
    fun `direct media save request keeps legacy route`() {
        val request = SaveRequest(
            sourceUrl = "https://cdn.example.com/audio.mp3",
            title = "Track",
            artist = "Artist",
            format = SaveFormat.MP3,
            quality = SaveQuality.Mp3K320
        )

        val resolved = NativeDownloadRoutingPolicy.forSaveRequest(request)

        assertTrue(resolved is QueuedDownloadRequest.Legacy)
        assertEquals(request, (resolved as QueuedDownloadRequest.Legacy).request)
    }

    @Test
    fun `legacy queue item keeps legacy request route`() {
        val item = DownloadQueueItem(
            id = "legacy-route",
            sourceUrl = "https://example.com/audio.mp3",
            title = "Track",
            artist = "Artist",
            format = SaveFormat.MP3.name,
            quality = SaveQuality.Mp3K320.name,
            executionKind = DownloadExecutionKind.Legacy,
            createdAtMs = 1L,
            updatedAtMs = 1L
        )

        val resolved = NativeDownloadRoutingPolicy.resolve(item)

        assertTrue(resolved is QueuedDownloadRequest.Legacy)
        val request = (resolved as QueuedDownloadRequest.Legacy).request
        assertEquals(item.sourceUrl, request.sourceUrl)
        assertEquals(SaveFormat.MP3, request.format)
        assertEquals(SaveQuality.Mp3K320, request.quality)
    }

    @Test
    fun `native queue item decodes native request route`() {
        val native = YtDlpDownloadRequest(
            sourceUrl = "https://example.com/watch?v=abc",
            title = "Native track",
            artist = "Artist",
            outputFormat = SaveFormat.FLAC,
            quality = SaveQuality.Lossless48k
        )
        val item = DownloadQueueItem(
            id = "native-route",
            sourceUrl = native.sourceUrl,
            title = native.title,
            artist = native.artist,
            format = native.outputFormat.name,
            quality = native.quality.name,
            executionKind = DownloadExecutionKind.YtDlp,
            engineRequestJson = YtDlpDownloadRequestCodec.encode(native),
            createdAtMs = 1L,
            updatedAtMs = 1L
        )

        val resolved = NativeDownloadRoutingPolicy.resolve(item)

        assertTrue(resolved is QueuedDownloadRequest.Native)
        assertEquals(native, (resolved as QueuedDownloadRequest.Native).request)
    }

    @Test
    fun `invalid native payload resolves to null instead of crashing service`() {
        val item = DownloadQueueItem(
            id = "broken-native",
            sourceUrl = "https://example.com/watch?v=broken",
            title = "Broken",
            artist = "Artist",
            format = SaveFormat.MP3.name,
            quality = SaveQuality.Mp3K320.name,
            executionKind = DownloadExecutionKind.YtDlp,
            engineRequestJson = "not-json",
            createdAtMs = 1L,
            updatedAtMs = 1L
        )

        assertNull(NativeDownloadRoutingPolicy.resolve(item))
    }
}
