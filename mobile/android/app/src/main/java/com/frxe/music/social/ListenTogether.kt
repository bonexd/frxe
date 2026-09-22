package com.frxe.music.social

/** Pure synchronization state shared by all Listen Together transports. */
data class SharedPlaybackState(
    val roomId: String,
    val leaderId: String,
    val trackId: String,
    val positionMs: Long,
    val playing: Boolean,
    val serverTimestampMs: Long
)

data class SharedRoom(
    val id: String,
    val inviteCode: String,
    val members: Int,
    val nowPlayingTrackId: String?
)

class PlaybackClockSynchronizer(
    private val maxNetworkAgeMs: Long = 5_000L
) {
    fun targetPosition(state: SharedPlaybackState, nowServerMs: Long): Long {
        val networkAge = if (state.playing) {
            (nowServerMs - state.serverTimestampMs).coerceIn(0L, maxNetworkAgeMs)
        } else 0L
        return (state.positionMs + networkAge).coerceAtLeast(0L)
    }
}

sealed interface SyncAction {
    data object None : SyncAction
    data class Seek(val positionMs: Long) : SyncAction
    data object Play : SyncAction
    data object Pause : SyncAction
}

fun decideSyncAction(
    currentPositionMs: Long,
    targetPositionMs: Long,
    localPlaying: Boolean,
    remotePlaying: Boolean,
    seekThresholdMs: Long = 650L
): SyncAction {
    if (localPlaying != remotePlaying) return if (remotePlaying) SyncAction.Play else SyncAction.Pause
    val drift = kotlin.math.abs(currentPositionMs - targetPositionMs)
    return if (drift > seekThresholdMs) SyncAction.Seek(targetPositionMs.coerceAtLeast(0L)) else SyncAction.None
}
