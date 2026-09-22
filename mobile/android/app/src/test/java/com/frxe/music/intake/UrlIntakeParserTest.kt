package com.frxe.music.intake

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UrlIntakeParserTest {
    @Test
    fun acceptsDirectHttpsUrl() {
        assertEquals(
            "https://example.com/watch?v=abc#section",
            UrlIntakeParser.extractFirstHttpUrl(
                "https://example.com/watch?v=abc#section"
            )
        )
    }

    @Test
    fun extractsFirstUrlFromSharedText() {
        assertEquals(
            "https://youtu.be/abcdefghijk?t=42",
            UrlIntakeParser.extractFirstHttpUrl(
                "Check this out https://youtu.be/abcdefghijk?t=42 thanks"
            )
        )
    }

    @Test
    fun trimsCommonTrailingSharePunctuation() {
        assertEquals(
            "https://example.com/video?id=1",
            UrlIntakeParser.extractFirstHttpUrl(
                "Watch (https://example.com/video?id=1)."
            )
        )
    }

    @Test
    fun rejectsNonHttpScheme() {
        assertNull(
            UrlIntakeParser.extractFirstHttpUrl(
                "file:///storage/emulated/0/song.mp3"
            )
        )
    }

    @Test
    fun rejectsBlankText() {
        assertNull(
            UrlIntakeParser.extractFirstHttpUrl("   ")
        )
    }
}
