package com.frxe.music.ytdlp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class YtDlpDownloadCommandPolicyTest {

    @Test
    fun `single audio download uses only frxe owned output and safe defaults`() {
        val request = YtDlpDownloadRequest(
            sourceUrl = "https://example.com/watch?v=1",
            title = "Track",
            artist = "Artist",
            normalizedTemplateArgs = listOf(
                "--output",
                "/sdcard/evil/%(title)s",
                "--exec",
                "sh -c bad"
            )
        )

        val options = YtDlpDownloadCommandPolicy.arguments(
            request = request,
            outputTemplate = "/data/user/0/com.frxe.music/cache/native/%(id)s.%(ext)s",
            useAria2c = false
        )

        assertTrue(options.contains(YtDlpOption("--ignore-config")))
        assertTrue(options.contains(YtDlpOption("--no-playlist")))
        assertTrue(options.contains(YtDlpOption("--format", "bestaudio/best")))
        assertEquals(
            listOf(
                YtDlpOption(
                    "--output",
                    "/data/user/0/com.frxe.music/cache/native/%(id)s.%(ext)s"
                )
            ),
            options.filter { it.option == "--output" }
        )
        assertFalse(options.any { it.option == "--exec" })
        assertFalse(options.any { it.argument?.contains("/sdcard/evil") == true })
    }

    @Test
    fun `native downloads parallelize fragmented transfers`() {
        val options = YtDlpDownloadCommandPolicy.arguments(
            request = YtDlpDownloadRequest(
                sourceUrl = "https://example.com/audio",
                title = "Audio",
                artist = "Artist"
            ),
            outputTemplate = "/tmp/%(id)s.%(ext)s",
            useAria2c = false
        )

        assertEquals(
            listOf(YtDlpOption("--concurrent-fragments", "8")),
            options.filter { it.option == "--concurrent-fragments" }
        )
    }


    @Test
    fun `native downloads use bounded network retries so a dead connection cannot hang forever`() {
        val options = YtDlpDownloadCommandPolicy.arguments(
            request = YtDlpDownloadRequest(
                sourceUrl = "https://www.youtube.com/watch?v=abc123",
                title = "Track",
                artist = "Artist"
            ),
            outputTemplate = "/tmp/%(id)s.%(ext)s",
            useAria2c = false
        )

        assertTrue(options.contains(YtDlpOption("--socket-timeout", "15")))
        assertTrue(options.contains(YtDlpOption("--retries", "3")))
        assertTrue(options.contains(YtDlpOption("--fragment-retries", "3")))
        assertTrue(options.contains(YtDlpOption("--extractor-retries", "2")))
    }

    @Test
    fun `aria2 downloader is tuned for fast bounded parallel transfers`() {
        val options = YtDlpDownloadCommandPolicy.arguments(
            request = YtDlpDownloadRequest(
                sourceUrl = "https://www.youtube.com/watch?v=abc123",
                title = "Track",
                artist = "Artist"
            ),
            outputTemplate = "/tmp/%(id)s.%(ext)s",
            useAria2c = true
        )

        assertTrue(options.contains(YtDlpOption("--downloader", "libaria2c.so")))
        assertTrue(
            options.contains(
                YtDlpOption(
                    "--downloader-args",
                    "aria2c:-x8 -s8 -k1M --file-allocation=none --connect-timeout=10 --timeout=15 --max-tries=3 --retry-wait=1"
                )
            )
        )
    }

    @Test
    fun `video default selects video and audio while explicit selector wins`() {
        val video = YtDlpDownloadRequest(
            sourceUrl = "https://example.com/v",
            title = "Video",
            artist = "Artist",
            mediaKind = YtDlpMediaKind.Video
        )
        val explicit = video.copy(formatSelector = "137+140/22")

        val defaultOptions = YtDlpDownloadCommandPolicy.arguments(
            video,
            "/tmp/%(id)s.%(ext)s",
            useAria2c = false
        )
        val explicitOptions = YtDlpDownloadCommandPolicy.arguments(
            explicit,
            "/tmp/%(id)s.%(ext)s",
            useAria2c = false
        )

        assertTrue(defaultOptions.contains(YtDlpOption("--format", "bestvideo*+bestaudio/best")))
        assertTrue(explicitOptions.contains(YtDlpOption("--format", "137+140/22")))
    }

    @Test
    fun `aria option uses embedded library binary without shell command`() {
        val options = YtDlpDownloadCommandPolicy.arguments(
            request = YtDlpDownloadRequest(
                sourceUrl = "https://example.com/a",
                title = "A",
                artist = "B"
            ),
            outputTemplate = "/tmp/%(id)s.%(ext)s",
            useAria2c = true
        )

        assertTrue(options.contains(YtDlpOption("--downloader", "libaria2c.so")))
        assertFalse(options.any { it.option == "--exec" || it.option == "--exec-before-download" })
    }

    @Test
    fun `selected subtitle languages are downloaded as sidecars`() {
        val options = YtDlpDownloadCommandPolicy.arguments(
            request = YtDlpDownloadRequest(
                sourceUrl = "https://example.com/a",
                title = "A",
                artist = "B",
                subtitleLanguages = listOf("en", "de"),
                writeAutoSubtitles = true
            ),
            outputTemplate = "/tmp/%(id)s.%(ext)s",
            useAria2c = false
        )

        assertTrue(options.contains(YtDlpOption("--write-subs")))
        assertTrue(options.contains(YtDlpOption("--sub-langs", "en,de")))
        assertTrue(options.contains(YtDlpOption("--write-auto-subs")))
        assertFalse(options.any { it.option == "--embed-subs" })
    }

    @Test
    fun `subtitle options are absent when none are requested`() {
        val options = YtDlpDownloadCommandPolicy.arguments(
            request = YtDlpDownloadRequest(
                sourceUrl = "https://example.com/a",
                title = "A",
                artist = "B",
                subtitleLanguages = emptyList(),
                writeAutoSubtitles = false
            ),
            outputTemplate = "/tmp/%(id)s.%(ext)s",
            useAria2c = false
        )

        assertFalse(options.any { it.option == "--write-subs" })
        assertFalse(options.any { it.option == "--sub-langs" })
        assertFalse(options.any { it.option == "--write-auto-subs" })
        assertFalse(options.any { it.option == "--embed-subs" })
    }
}
