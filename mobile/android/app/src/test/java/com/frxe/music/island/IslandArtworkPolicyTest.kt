package com.frxe.music.island

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class IslandArtworkPolicyTest {
    @Test
    fun normalizesRemoteArtworkUrls() {
        assertEquals(
            "https://i.ytimg.com/vi/test/hqdefault.jpg",
            IslandArtworkPolicy.normalize("//i.ytimg.com/vi/test/hqdefault.jpg")
        )
        assertEquals(
            "https://example.com/cover.jpg",
            IslandArtworkPolicy.normalize("https://example.com/cover.jpg")
        )
    }

    @Test
    fun rejectsNonHttpArtworkUrls() {
        assertNull(IslandArtworkPolicy.normalize("content://cover"))
        assertNull(IslandArtworkPolicy.normalize(""))
    }
}
