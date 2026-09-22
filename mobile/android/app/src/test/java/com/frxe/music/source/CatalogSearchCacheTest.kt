package com.frxe.music.source

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CatalogSearchCacheTest {
    @Test
    fun normalizesQueriesAndExpiresEntries() {
        val cache = CatalogSearchCache<List<String>>(ttlMs = 1_000L)

        cache.put("  Daft Punk  ", listOf("one"), nowMs = 10_000L)

        assertEquals(
            listOf("one"),
            cache.get("daft   punk", nowMs = 10_500L)
        )
        assertNull(
            cache.get("DAFT PUNK", nowMs = 11_001L)
        )
    }
}
