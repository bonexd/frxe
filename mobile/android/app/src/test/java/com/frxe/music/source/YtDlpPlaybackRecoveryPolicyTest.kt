package com.frxe.music.source

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class YtDlpPlaybackRecoveryPolicyTest {
    @Test
    fun firstFailureAllowsRecoveryAttempt() {
        assertTrue(
            YtDlpPlaybackRecoveryPolicy.shouldAttempt(
                lastAttemptAtMs = null,
                nowMs = 1_000L
            )
        )
    }

    @Test
    fun repeatedFailureInsideCooldownDoesNotRefreshAgain() {
        assertFalse(
            YtDlpPlaybackRecoveryPolicy.shouldAttempt(
                lastAttemptAtMs = 1_000L,
                nowMs = 61_000L
            )
        )
    }

    @Test
    fun recoveryIsAllowedAgainAfterCooldown() {
        assertTrue(
            YtDlpPlaybackRecoveryPolicy.shouldAttempt(
                lastAttemptAtMs = 1_000L,
                nowMs = 1_000L + YtDlpPlaybackRecoveryPolicy.COOLDOWN_MS
            )
        )
    }

    @Test
    fun clockRollbackAllowsRecoveryInsteadOfBlockingForever() {
        assertTrue(
            YtDlpPlaybackRecoveryPolicy.shouldAttempt(
                lastAttemptAtMs = 10_000L,
                nowMs = 5_000L
            )
        )
    }
}
