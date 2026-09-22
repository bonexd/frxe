package com.frxe.music.source

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackRecoveryDecisionTest {
    @Test
    fun failedResolutionCanTriggerRuntimeRecovery() {
        assertTrue(
            PlaybackRecoveryDecision.shouldRefreshAndRetry(
                PlaybackResolutionResult.Failed(
                    message = "failed",
                    attempts = emptyList()
                )
            )
        )
    }

    @Test
    fun verificationDoesNotTriggerRuntimeRecovery() {
        assertFalse(
            PlaybackRecoveryDecision.shouldRefreshAndRetry(
                PlaybackResolutionResult.VerificationRequired(
                    challenge = YouTubeChallenge(
                        kind = YouTubeChallengeKind.VerificationRequired,
                        message = "verification"
                    ),
                    attempts = emptyList()
                )
            )
        )
    }

    @Test
    fun successDoesNotTriggerRuntimeRecovery() {
        assertFalse(
            PlaybackRecoveryDecision.shouldRefreshAndRetry(
                PlaybackResolutionResult.Success(
                    stream = PlaybackResolvedStream(
                        url = "https://example.test/audio",
                        resolver = PlaybackResolverKind.YtDlp,
                        headers = emptyMap()
                    ),
                    attempts = emptyList()
                )
            )
        )
    }
}
