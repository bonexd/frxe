package com.frxe.music.save

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SavePolicyMetadataTest {

    @Test
    fun `final transcode writes rich metadata tags`() {
        val arguments = buildFfmpegArguments(
            inputPath = "/tmp/input.webm",
            outputPath = "/tmp/output.mp3",
            format = SaveFormat.MP3,
            quality = SaveQuality.Mp3K320,
            title = "Track title",
            artist = "Artist",
            metadata = SaveMetadata(
                album = "Album",
                playlistTitle = "Playlist",
                trackNumber = 7,
                discNumber = 2,
                releaseYear = 2024,
                sourceUrl = "https://example.com/watch?v=abc"
            )
        )

        assertTrue(arguments.containsAll(listOf("-metadata", "album=Album")))
        assertTrue(arguments.contains("track=7"))
        assertTrue(arguments.contains("disc=2"))
        assertTrue(arguments.contains("date=2024"))
        assertTrue(arguments.contains("comment=Source: https://example.com/watch?v=abc"))
    }

    @Test
    fun `final mp3 transcode maps selected artwork as attached picture`() {
        val arguments = buildFfmpegArguments(
            inputPath = "/tmp/input.webm",
            outputPath = "/tmp/output.mp3",
            format = SaveFormat.MP3,
            quality = SaveQuality.Mp3K320,
            title = "Track",
            artist = "Artist",
            artworkPath = "/tmp/cover.webp"
        )

        assertTrue(arguments.windowed(2).contains(listOf("-i", "/tmp/cover.webp")))
        assertTrue(arguments.windowed(2).contains(listOf("-map", "0:a:0")))
        assertTrue(arguments.windowed(2).contains(listOf("-map", "1:v:0")))
        assertTrue(arguments.windowed(2).contains(listOf("-c:v", "mjpeg")))
        assertTrue(arguments.windowed(2).contains(listOf("-disposition:v", "attached_pic")))
        assertFalse(arguments.contains("-vn"))
    }

    @Test
    fun `wav output keeps audio only even when artwork exists`() {
        val arguments = buildFfmpegArguments(
            inputPath = "/tmp/input.webm",
            outputPath = "/tmp/output.wav",
            format = SaveFormat.WAV,
            quality = SaveQuality.Lossless48k,
            title = "Track",
            artist = "Artist",
            artworkPath = "/tmp/cover.jpg"
        )

        assertTrue(arguments.contains("-vn"))
        assertFalse(arguments.windowed(2).contains(listOf("-i", "/tmp/cover.jpg")))
        assertFalse(arguments.contains("attached_pic"))
    }
}
