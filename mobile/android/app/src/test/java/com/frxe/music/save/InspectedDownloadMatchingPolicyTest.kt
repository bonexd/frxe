package com.frxe.music.save

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InspectedDownloadMatchingPolicyTest {

    @Test
    fun `matching normalized inspection url can enqueue natively`() {
        assertTrue(
            InspectedDownloadMatchingPolicy.matches(
                currentUrl = "https://Example.com/watch?v=abc",
                inspectedUrl = "https://example.com/watch?v=abc"
            )
        )
    }

    @Test
    fun `stale inspection url cannot enqueue different url natively`() {
        assertFalse(
            InspectedDownloadMatchingPolicy.matches(
                currentUrl = "https://example.com/watch?v=new",
                inspectedUrl = "https://example.com/watch?v=old"
            )
        )
    }

    @Test
    fun `blank url never matches inspection`() {
        assertFalse(
            InspectedDownloadMatchingPolicy.matches(
                currentUrl = " ",
                inspectedUrl = "https://example.com/watch?v=abc"
            )
        )
    }
}
