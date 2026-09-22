package com.frxe.music.updates

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UpdateParsingTest {
    @Test
    fun releaseListAcceptsPublishedPrerelease() {
        val release = parseFirstPublishedGitHubRelease(
            """[{"tag_name":"v0.6.12-preview.2","html_url":"https://example.test/release","body":"fixes","prerelease":true,"draft":false}]"""
        )

        assertEquals("v0.6.12-preview.2", release?.version)
        assertEquals("https://example.test/release", release?.pageUrl)
        assertEquals("fixes", release?.notes)
    }

    @Test
    fun emptyReleaseListMeansNoPublishedRelease() {
        assertNull(parseFirstPublishedGitHubRelease("[]"))
    }

    @Test
    fun draftReleaseIsIgnored() {
        assertNull(
            parseFirstPublishedGitHubRelease(
                """[{"tag_name":"v0.6.13","html_url":"https://example.test/draft","body":"draft","prerelease":false,"draft":true}]"""
            )
        )
    }
}
