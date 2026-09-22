package com.frxe.music.source

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogLoadPolicyTest {
    @Test
    fun catalogUsesYtDlpForDiscoveryOnly() {
        assertEquals(
            listOf("yt-dlp"),
            CatalogLoadPolicy.providerOrder
        )
        assertTrue(CatalogLoadPolicy.searchDebounceMs <= 120L)
        assertEquals(0L, CatalogLoadPolicy.homeRemoteDelayMs)
        assertTrue(CatalogLoadPolicy.primaryProviderTimeoutMs >= 5_000L)
    }
}
