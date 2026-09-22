package com.frxe.music.save

import com.frxe.music.ytdlp.YtDlpDownloadRequest
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NativeDownloadFinalizationPolicyTest {

    @Test
    fun `native request maps rich metadata into final save tags`() {
        val request = YtDlpDownloadRequest(
            sourceUrl = "https://example.com/watch?v=abc",
            title = "Track",
            artist = "Artist",
            album = "Album",
            playlistTitle = "Playlist",
            trackNumber = 7,
            discNumber = 2,
            releaseYear = 2024,
            embedMetadata = true
        )

        assertEquals(
            SaveMetadata(
                album = "Album",
                playlistTitle = "Playlist",
                trackNumber = 7,
                discNumber = 2,
                releaseYear = 2024,
                sourceUrl = "https://example.com/watch?v=abc"
            ),
            NativeDownloadFinalizationPolicy.metadataFor(request)
        )
    }

    @Test
    fun `metadata is omitted when embedding is disabled`() {
        val request = YtDlpDownloadRequest(
            sourceUrl = "https://example.com/watch?v=abc",
            title = "Track",
            artist = "Artist",
            album = "Album",
            embedMetadata = false
        )

        assertEquals(
            SaveMetadata(),
            NativeDownloadFinalizationPolicy.metadataFor(request)
        )
    }

    @Test
    fun `first image sidecar is selected only when artwork is requested`() {
        val subtitle = File("track.en.vtt")
        val artwork = File("track.webp")
        val laterArtwork = File("track.jpg")
        val request = YtDlpDownloadRequest(
            sourceUrl = "https://example.com/watch?v=abc",
            title = "Track",
            artist = "Artist",
            embedThumbnail = true
        )

        assertEquals(
            artwork,
            NativeDownloadFinalizationPolicy.artworkFor(
                request,
                listOf(subtitle, artwork, laterArtwork)
            )
        )
        assertNull(
            NativeDownloadFinalizationPolicy.artworkFor(
                request.copy(embedThumbnail = false),
                listOf(artwork)
            )
        )
    }
}
