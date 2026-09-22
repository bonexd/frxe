package com.frxe.music.ytdlp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class YtDlpInspectCommandPolicyTest {
    @Test
    fun inspectionUsesOnlyReadOnlyMetadataOptions() {
        val arguments = YtDlpInspectCommandPolicy.arguments()

        assertEquals(
            listOf(
                "--dump-single-json",
                "--flat-playlist",
                "--skip-download",
                "--no-warnings",
                "--ignore-config"
            ),
            arguments
        )
    }

    @Test
    fun inspectionPolicyDoesNotContainDownloadOrExecutionOverrides() {
        val arguments = YtDlpInspectCommandPolicy.arguments()

        assertFalse(arguments.any { it.startsWith("--output") || it == "-o" })
        assertFalse(arguments.any { it.startsWith("--external-downloader") })
        assertFalse(arguments.any { it.startsWith("--postprocessor") })
        assertTrue(arguments.all { it.startsWith("--") })
    }
}
