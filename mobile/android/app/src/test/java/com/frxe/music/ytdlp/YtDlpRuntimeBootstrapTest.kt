package com.frxe.music.ytdlp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class YtDlpRuntimeBootstrapTest {
    @Test
    fun firstInitializationFailureCleansAndRetriesOnce() {
        var attempts = 0
        var cleanups = 0

        val result = YtDlpRuntimeBootstrap.initializeWithRecovery(
            initialize = {
                attempts += 1
                if (attempts == 1) error("broken extracted runtime")
            },
            cleanup = {
                cleanups += 1
            }
        )

        assertTrue(result.isSuccess)
        assertEquals(2, attempts)
        assertEquals(1, cleanups)
    }

    @Test
    fun successfulInitializationDoesNotDeleteRuntime() {
        var cleanups = 0

        val result = YtDlpRuntimeBootstrap.initializeWithRecovery(
            initialize = { Unit },
            cleanup = {
                cleanups += 1
            }
        )

        assertTrue(result.isSuccess)
        assertEquals(0, cleanups)
    }

    @Test
    fun secondFailureIsReturnedAfterSingleRetry() {
        var attempts = 0
        var cleanups = 0

        val result = YtDlpRuntimeBootstrap.initializeWithRecovery(
            initialize = {
                attempts += 1
                error("still broken")
            },
            cleanup = {
                cleanups += 1
            }
        )

        assertTrue(result.isFailure)
        assertEquals(2, attempts)
        assertEquals(1, cleanups)
    }
}
