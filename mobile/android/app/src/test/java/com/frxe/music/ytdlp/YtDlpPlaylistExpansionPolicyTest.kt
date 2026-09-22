package com.frxe.music.ytdlp

import org.junit.Assert.assertEquals
import org.junit.Test

class YtDlpPlaylistExpansionPolicyTest {

    @Test
    fun `selected playlist entries expand in source order with entry metadata`() {
        val inspection = playlistInspection(
            entries = listOf(
                YtDlpPlaylistEntry(
                    id = "first",
                    title = "First song",
                    url = "https://example.com/watch?v=first",
                    thumbnailUrl = "https://img.example/first.jpg",
                    durationMs = 10_000L,
                    creator = "First artist",
                    playlistIndex = 4
                ),
                YtDlpPlaylistEntry(
                    id = "second",
                    title = "Second song",
                    url = "https://example.com/watch?v=second",
                    thumbnailUrl = "https://img.example/second.jpg",
                    durationMs = 20_000L,
                    creator = "Second artist",
                    playlistIndex = 5
                )
            )
        )
        val base = baseRequest()

        val expanded = YtDlpPlaylistExpansionPolicy.expand(
            inspection = inspection,
            baseRequest = base,
            selectedPlaylistIndices = setOf(2, 1)
        )

        assertEquals(2, expanded.size)

        assertEquals("https://example.com/watch?v=first", expanded[0].sourceUrl)
        assertEquals("First song", expanded[0].title)
        assertEquals("First artist", expanded[0].artist)
        assertEquals("first", expanded[0].playlistEntryId)
        assertEquals(4, expanded[0].playlistIndex)
        assertEquals("Mix title", expanded[0].playlistTitle)
        assertEquals("https://img.example/first.jpg", expanded[0].thumbnailUrl)

        assertEquals("https://example.com/watch?v=second", expanded[1].sourceUrl)
        assertEquals("Second song", expanded[1].title)
        assertEquals("Second artist", expanded[1].artist)
        assertEquals("second", expanded[1].playlistEntryId)
        assertEquals(5, expanded[1].playlistIndex)
        assertEquals("Mix title", expanded[1].playlistTitle)
        assertEquals("https://img.example/second.jpg", expanded[1].thumbnailUrl)

        assertEquals(base.subtitleLanguages, expanded[0].subtitleLanguages)
        assertEquals(base.writeAutoSubtitles, expanded[0].writeAutoSubtitles)
        assertEquals(base.embedMetadata, expanded[0].embedMetadata)
        assertEquals(base.embedThumbnail, expanded[0].embedThumbnail)
        assertEquals(base.outputFormat, expanded[0].outputFormat)
        assertEquals(base.quality, expanded[0].quality)
    }

    @Test
    fun `unselected and unusable playlist entries are skipped`() {
        val inspection = playlistInspection(
            entries = listOf(
                YtDlpPlaylistEntry(
                    id = "selected",
                    title = "Selected",
                    url = "https://example.com/selected",
                    thumbnailUrl = null,
                    durationMs = null
                ),
                YtDlpPlaylistEntry(
                    id = "invalid",
                    title = "Invalid",
                    url = "file:///storage/emulated/0/local.mp3",
                    thumbnailUrl = null,
                    durationMs = null
                ),
                YtDlpPlaylistEntry(
                    id = "not-selected",
                    title = "Not selected",
                    url = "https://example.com/not-selected",
                    thumbnailUrl = null,
                    durationMs = null
                )
            )
        )

        val expanded = YtDlpPlaylistExpansionPolicy.expand(
            inspection = inspection,
            baseRequest = baseRequest(),
            selectedPlaylistIndices = setOf(1, 2)
        )

        assertEquals(1, expanded.size)
        assertEquals("selected", expanded.single().playlistEntryId)
        assertEquals("https://example.com/selected", expanded.single().sourceUrl)
    }

    private fun playlistInspection(
        entries: List<YtDlpPlaylistEntry>
    ) = YtDlpInspection(
        id = "mix",
        title = "Mix title",
        creator = "Playlist artist",
        canonicalUrl = "https://example.com/playlist/mix",
        thumbnailUrl = "https://img.example/mix.jpg",
        durationMs = null,
        siteCategory = "Example",
        isPlaylist = true,
        formats = emptyList(),
        subtitleLanguages = listOf("en"),
        automaticCaptionLanguages = listOf("de"),
        entries = entries,
        album = "Mix album",
        playlistTitle = "Mix title"
    )

    private fun baseRequest() = YtDlpDownloadRequest(
        sourceUrl = "https://example.com/playlist/mix",
        title = "Fallback title",
        artist = "Fallback artist",
        subtitleLanguages = listOf("en"),
        writeAutoSubtitles = true,
        embedMetadata = true,
        embedThumbnail = true
    )
}
