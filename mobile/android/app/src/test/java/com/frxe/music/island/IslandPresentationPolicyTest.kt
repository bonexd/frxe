package com.frxe.music.island

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class IslandPresentationPolicyTest {
    @Test
    fun islandNeverRendersInsideFrxe() {
        assertFalse(IslandPresentationPolicy.showInApp)
    }

    @Test
    fun floatingIslandOnlyShowsOutsideFrxeWhenReady() {
        assertTrue(
            IslandPresentationPolicy.showFloating(
                isForeground = false,
                floatingEnabled = true,
                overlayPermissionGranted = true,
                hasTrack = true,
                dismissed = false
            )
        )
        assertFalse(
            IslandPresentationPolicy.showFloating(
                isForeground = true,
                floatingEnabled = true,
                overlayPermissionGranted = true,
                hasTrack = true,
                dismissed = false
            )
        )
    }
}
