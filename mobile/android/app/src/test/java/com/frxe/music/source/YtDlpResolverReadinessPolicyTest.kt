package com.frxe.music.source

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class YtDlpResolverReadinessPolicyTest {
    @Test
    fun retriesInitializationWhenRuntimeWasNotReady() {
        assertTrue(
            YtDlpResolverReadinessPolicy.shouldInitialize(
                runtimeReady = false
            )
        )
    }

    @Test
    fun skipsInitializationWhenRuntimeIsAlreadyReady() {
        assertFalse(
            YtDlpResolverReadinessPolicy.shouldInitialize(
                runtimeReady = true
            )
        )
    }
}
