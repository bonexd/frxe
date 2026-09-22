package com.frxe.music.ytdlp

import com.frxe.music.save.SaveFormat
import com.frxe.music.save.SaveQuality
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class YtDlpDownloadRequestCodecTest {
    @Test
    fun requestRoundTripsEveryPersistedField() {
        val request = YtDlpDownloadRequest(
            sourceUrl = "https://example.com/watch?v=abc",
            title = "Example",
            artist = "Artist",
            mediaKind = YtDlpMediaKind.Audio,
            outputFormat = SaveFormat.FLAC,
            quality = SaveQuality.Lossless48k,
            formatSelector = "bestaudio[ext=m4a]/bestaudio",
            playlistEntryId = "entry-7",
            playlistIndex = 7,
            playlistTitle = "Playlist",
            subtitleLanguages = listOf("en", "de"),
            writeAutoSubtitles = true,
            embedSubtitles = true,
            embedMetadata = true,
            embedThumbnail = false,
            thumbnailUrl = "https://img.example/cover.jpg",
            album = "Example Album",
            trackNumber = 7,
            discNumber = 2,
            releaseYear = 2024,
            templateId = "archive",
            normalizedTemplateArgs = listOf("--restrict-filenames", "--write-info-json"),
            useAcceleratedDownloader = false
        )

        val encoded = YtDlpDownloadRequestCodec.encode(request)
        val decoded = YtDlpDownloadRequestCodec.decode(encoded)

        assertEquals(request, decoded)
    }

    @Test
    fun missingOptionalFieldsDecodeToSafeDefaults() {
        val decoded = YtDlpDownloadRequestCodec.decode(
            """{"version":1,"sourceUrl":"https://example.com/a","title":"A","artist":"B","outputFormat":"MP3","quality":"Mp3K320"}"""
        )!!

        assertEquals(YtDlpMediaKind.Audio, decoded.mediaKind)
        assertNull(decoded.formatSelector)
        assertNull(decoded.playlistEntryId)
        assertNull(decoded.playlistIndex)
        assertNull(decoded.playlistTitle)
        assertTrue(decoded.subtitleLanguages.isEmpty())
        assertFalse(decoded.writeAutoSubtitles)
        assertFalse(decoded.embedSubtitles)
        assertTrue(decoded.embedMetadata)
        assertTrue(decoded.embedThumbnail)
        assertNull(decoded.thumbnailUrl)
        assertNull(decoded.album)
        assertNull(decoded.trackNumber)
        assertNull(decoded.discNumber)
        assertNull(decoded.releaseYear)
        assertNull(decoded.templateId)
        assertTrue(decoded.normalizedTemplateArgs.isEmpty())
        assertTrue(decoded.useAcceleratedDownloader)
    }

    @Test
    fun blankSourceIsRejected() {
        assertNull(
            YtDlpDownloadRequestCodec.decode(
                """{"version":1,"sourceUrl":"   ","title":"A","artist":"B","outputFormat":"MP3","quality":"Mp3K320"}"""
            )
        )
    }
}
