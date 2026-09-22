package com.frxe.music.ytdlp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class YtDlpInspectionParserTest {
    @Test
    fun parsesSingleMediaMetadataFormatsAndSubtitles() {
        val inspection = YtDlpInspectionParser.parse(
            """
            {
              "id": "vid123",
              "title": "Song title",
              "uploader": "Artist Name",
              "webpage_url": "https://example.com/watch?v=vid123",
              "thumbnail": "https://img.example/thumb.jpg",
              "duration": 123.5,
              "extractor_key": "ExampleSite",
              "formats": [
                {
                  "format_id": "140",
                  "ext": "m4a",
                  "acodec": "mp4a.40.2",
                  "vcodec": "none",
                  "abr": 128.0,
                  "filesize_approx": 1000000
                },
                {
                  "format_id": "137",
                  "ext": "mp4",
                  "acodec": "none",
                  "vcodec": "avc1.640028",
                  "tbr": 4500.0,
                  "width": 1920,
                  "height": 1080,
                  "fps": 30.0
                }
              ],
              "subtitles": {
                "en": [{"ext": "vtt", "url": "https://example.com/en.vtt"}]
              },
              "automatic_captions": {
                "de": [{"ext": "vtt", "url": "https://example.com/de.vtt"}]
              }
            }
            """.trimIndent()
        )

        assertFalse(inspection.isPlaylist)
        assertEquals("vid123", inspection.id)
        assertEquals("Song title", inspection.title)
        assertEquals("Artist Name", inspection.creator)
        assertEquals("https://example.com/watch?v=vid123", inspection.canonicalUrl)
        assertEquals("https://img.example/thumb.jpg", inspection.thumbnailUrl)
        assertEquals(123_500L, inspection.durationMs)
        assertEquals("ExampleSite", inspection.siteCategory)
        assertEquals(listOf("en"), inspection.subtitleLanguages)
        assertEquals(listOf("de"), inspection.automaticCaptionLanguages)
        assertTrue(inspection.entries.isEmpty())

        assertEquals(2, inspection.formats.size)
        val audio = inspection.formats[0]
        assertEquals("140", audio.id)
        assertEquals("m4a", audio.extension)
        assertEquals("mp4a.40.2", audio.audioCodec)
        assertEquals("none", audio.videoCodec)
        assertEquals(128.0, audio.audioBitrateKbps ?: 0.0, 0.001)
        assertEquals(1_000_000L, audio.approximateSizeBytes)
        assertNull(audio.height)

        val video = inspection.formats[1]
        assertEquals(1920, video.width)
        assertEquals(1080, video.height)
        assertEquals(30.0, video.fps ?: 0.0, 0.001)
        assertEquals(4500.0, video.totalBitrateKbps ?: 0.0, 0.001)
    }

    @Test
    fun parsesRichTagAndPlaylistMetadata() {
        val inspection = YtDlpInspectionParser.parse(
            """
            {
              "id": "track-7",
              "title": "Track",
              "artist": "Artist",
              "album": "Album",
              "playlist_title": "Collection",
              "playlist_index": 3,
              "track_number": 7,
              "disc_number": 2,
              "release_date": "20240517",
              "thumbnail": "https://img.example/cover.jpg"
            }
            """.trimIndent()
        )

        assertEquals("Album", inspection.album)
        assertEquals("Collection", inspection.playlistTitle)
        assertEquals(3, inspection.playlistIndex)
        assertEquals(7, inspection.trackNumber)
        assertEquals(2, inspection.discNumber)
        assertEquals(2024, inspection.releaseYear)
        assertEquals("https://img.example/cover.jpg", inspection.thumbnailUrl)
    }

    @Test
    fun parsesPlaylistEntriesInSourceOrder() {
        val inspection = YtDlpInspectionParser.parse(
            """
            {
              "_type": "playlist",
              "id": "pl1",
              "title": "Mix",
              "webpage_url": "https://example.com/playlist/pl1",
              "entries": [
                {
                  "id": "a",
                  "title": "First",
                  "uploader": "Artist A",
                  "playlist_index": 1,
                  "url": "https://example.com/watch?v=a",
                  "thumbnail": "https://img.example/a.jpg",
                  "duration": 10.0
                },
                {
                  "id": "b",
                  "title": "Second",
                  "uploader": "Artist B",
                  "playlist_index": 2,
                  "webpage_url": "https://example.com/watch?v=b",
                  "duration": 20.25
                }
              ]
            }
            """.trimIndent()
        )

        assertTrue(inspection.isPlaylist)
        assertEquals("pl1", inspection.id)
        assertEquals("Mix", inspection.title)
        assertEquals(2, inspection.entries.size)

        val first = inspection.entries[0]
        assertEquals("a", first.id)
        assertEquals("First", first.title)
        assertEquals("Artist A", first.creator)
        assertEquals(1, first.playlistIndex)
        assertEquals("https://example.com/watch?v=a", first.url)
        assertEquals("https://img.example/a.jpg", first.thumbnailUrl)
        assertEquals(10_000L, first.durationMs)

        val second = inspection.entries[1]
        assertEquals("b", second.id)
        assertEquals("Second", second.title)
        assertEquals("Artist B", second.creator)
        assertEquals(2, second.playlistIndex)
        assertEquals("https://example.com/watch?v=b", second.url)
        assertEquals(20_250L, second.durationMs)
    }
}
