package com.frxe.music.ytdlp

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class YtDlpCoreInitializationPolicyTest {
    @Test
    fun failingOptionalRuntimeDoesNotBlockOtherCapabilities() {
        val capabilities = YtDlpCoreInitializationPolicy.initialize(
            initializeYtDlp = {},
            initializeFFmpeg = {
                error("ffmpeg init failed")
            },
            initializeAria2c = {}
        )

        assertTrue(capabilities.ytDlpReady)
        assertFalse(capabilities.ffmpegReady)
        assertTrue(capabilities.aria2cReady)
    }

    @Test
    fun failingPrimaryRuntimeDoesNotBlockOptionalCapabilityChecks() {
        val capabilities = YtDlpCoreInitializationPolicy.initialize(
            initializeYtDlp = {
                error("primary init failed")
            },
            initializeFFmpeg = {},
            initializeAria2c = {}
        )

        assertFalse(capabilities.ytDlpReady)
        assertTrue(capabilities.ffmpegReady)
        assertTrue(capabilities.aria2cReady)
    }
}
