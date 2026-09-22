package com.frxe.music.save

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

internal data class BackgroundDownloadState(
    val requestId: String? = null,
    val state: SaveUiState = SaveUiState(),
    val result: SaveResult? = null
)

internal object DownloadStateStore {
    private val _state = MutableStateFlow(
        BackgroundDownloadState()
    )

    val state = _state.asStateFlow()

    fun begin(
        requestId: String,
        state: SaveUiState
    ) {
        _state.value = BackgroundDownloadState(
            requestId = requestId,
            state = state
        )
    }

    fun update(
        requestId: String,
        state: SaveUiState,
        result: SaveResult? = null
    ) {
        if (_state.value.requestId != requestId) {
            return
        }

        _state.value = BackgroundDownloadState(
            requestId = requestId,
            state = state,
            result = result
        )
    }
}
