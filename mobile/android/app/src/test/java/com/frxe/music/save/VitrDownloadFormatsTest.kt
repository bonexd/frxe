package com.frxe.music.save

import org.junit.Assert.assertTrue
import org.junit.Test

class VitrDownloadFormatsTest {
    @Test
    fun exposesAllFourRequestedAudioFormats() {
        val extensions = SaveFormat.entries.map(SaveFormat::extension).toSet()
        assertTrue(extensions.containsAll(setOf("m4a", "mp3", "flac", "wav")))
    }

    @Test
    fun m4aUsesAacConversion() {
        val args = buildFfmpegArguments(
            inputPath = "input.media",
            outputPath = "output.m4a",
            format = SaveFormat.M4A,
            quality = SaveQuality.Mp3K256,
            title = "Track",
            artist = "Artist"
        )
        assertTrue(args.windowed(2).any { it == listOf("-c:a", "aac") })
        assertTrue(args.windowed(2).any { it == listOf("-b:a", "256k") })
    }
}
