package com.frxe.music.save

import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Test

class DownloadUiPrivacyPolicyTest {
    @Test
    fun backendNamesAreRemovedFromNormalDownloadMessages() {
        val names = listOf(
            "yt-dlp",
            "aria2c",
            "ffmpeg",
            "mutagen",
            "InnerTube",
            "NewPipe"
        )

        names.forEach { backend ->
            val message = DownloadUiPrivacyPolicy.sanitize(
                "Trying $backend backup after local failure"
            )

            assertFalse(
                "Normal UI leaked $backend in: $message",
                message.contains(backend, ignoreCase = true)
            )
        }
    }

    @Test
    fun ordinaryMessagesArePreserved() {
        assertEquals(
            "Waiting for Wi-Fi",
            DownloadUiPrivacyPolicy.sanitize("Waiting for Wi-Fi")
        )
        assertEquals(
            "Saved to Music/Frxe",
            DownloadUiPrivacyPolicy.sanitize("Saved to Music/Frxe")
        )
    }

    @Test
    fun backendFailuresBecomeGenericRetryCopy() {
        assertEquals(
            "Download failed. Try again.",
            DownloadUiPrivacyPolicy.sanitize(
                "Download failed. Local: yt-dlp unavailable · NewPipe fallback failed"
            )
        )
    }
}
