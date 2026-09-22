package com.frxe.music.ui.gestures

import org.junit.Assert.assertEquals
import org.junit.Test

class PlayerGesturePolicyTest {
    @Test
    fun swipeLeftChoosesNext() {
        assertEquals(
            PlayerGestureAction.Next,
            PlayerGesturePolicy.action(
                deltaXDp = -90f,
                deltaYDp = 8f,
                enabled = true,
                isTv = false,
                blocked = false
            )
        )
    }

    @Test
    fun swipeRightChoosesPrevious() {
        assertEquals(
            PlayerGestureAction.Previous,
            PlayerGesturePolicy.action(
                deltaXDp = 90f,
                deltaYDp = 8f,
                enabled = true,
                isTv = false,
                blocked = false
            )
        )
    }

    @Test
    fun swipeDownChoosesCollapse() {
        assertEquals(
            PlayerGestureAction.Collapse,
            PlayerGesturePolicy.action(
                deltaXDp = 8f,
                deltaYDp = 110f,
                enabled = true,
                isTv = false,
                blocked = false
            )
        )
    }

    @Test
    fun shortOrAmbiguousMotionDoesNothing() {
        assertEquals(
            PlayerGestureAction.None,
            PlayerGesturePolicy.action(
                deltaXDp = 45f,
                deltaYDp = 12f,
                enabled = true,
                isTv = false,
                blocked = false
            )
        )
        assertEquals(
            PlayerGestureAction.None,
            PlayerGesturePolicy.action(
                deltaXDp = 75f,
                deltaYDp = 70f,
                enabled = true,
                isTv = false,
                blocked = false
            )
        )
        assertEquals(
            PlayerGestureAction.None,
            PlayerGesturePolicy.action(
                deltaXDp = 0f,
                deltaYDp = -120f,
                enabled = true,
                isTv = false,
                blocked = false
            )
        )
    }

    @Test
    fun disabledBlockedOrTvGesturesDoNothing() {
        assertEquals(
            PlayerGestureAction.None,
            PlayerGesturePolicy.action(-100f, 0f, enabled = false, isTv = false, blocked = false)
        )
        assertEquals(
            PlayerGestureAction.None,
            PlayerGesturePolicy.action(-100f, 0f, enabled = true, isTv = true, blocked = false)
        )
        assertEquals(
            PlayerGestureAction.None,
            PlayerGesturePolicy.action(-100f, 0f, enabled = true, isTv = false, blocked = true)
        )
    }

    @Test
    fun childConsumedHorizontalSwipeDoesNothing() {
        assertEquals(
            PlayerGestureAction.None,
            PlayerGesturePolicy.action(
                deltaXDp = -100f,
                deltaYDp = 0f,
                enabled = true,
                isTv = false,
                blocked = false,
                childConsumed = true
            )
        )
    }

    @Test
    fun consumedDownwardSwipeCanCollapseAtTop() {
        assertEquals(
            PlayerGestureAction.Collapse,
            PlayerGesturePolicy.action(
                deltaXDp = 0f,
                deltaYDp = 120f,
                enabled = true,
                isTv = false,
                blocked = false,
                childConsumed = true,
                canCollapse = true
            )
        )
    }

    @Test
    fun downwardSwipeDoesNotCollapseWhileListCanScrollBack() {
        assertEquals(
            PlayerGestureAction.None,
            PlayerGesturePolicy.action(
                deltaXDp = 0f,
                deltaYDp = 120f,
                enabled = true,
                isTv = false,
                blocked = false,
                childConsumed = true,
                canCollapse = false
            )
        )
    }
}
