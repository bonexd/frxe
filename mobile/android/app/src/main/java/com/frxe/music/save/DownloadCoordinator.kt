package com.frxe.music.save

import android.content.Context
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

class DownloadCoordinator(
    context: Context
) {
    private val appContext = context.applicationContext

    init {
        DownloadQueueStore.initialize(appContext)
    }

    suspend fun save(
        request: SaveRequest,
        onState: (SaveUiState) -> Unit
    ): SaveResult {
        val enqueued =
            when (
                val routed =
                    NativeDownloadRoutingPolicy
                        .forSaveRequest(request)
            ) {
                is QueuedDownloadRequest.Legacy ->
                    FrxeDownloadService.enqueue(
                        appContext,
                        routed.request
                    )

                is QueuedDownloadRequest.Native ->
                    FrxeDownloadService.enqueue(
                        appContext,
                        routed.request
                    )
            }

        val itemId = enqueued.item.id

        onState(
            SaveUiState(
                stage = SaveStage.Idle,
                progress = 0f,
                message = when {
                    enqueued.duplicate &&
                        enqueued.item.state == DownloadQueueItemState.Complete ->
                        "Already downloaded"

                    enqueued.duplicate ->
                        "Already in download queue"

                    else ->
                        "Added to download queue"
                },
                savedUri = enqueued.item.savedUri,
                savedTitle = enqueued.item.savedTitle,
                backend = enqueued.item.backend?.let { label ->
                    DownloadBackend.entries.firstOrNull { it.label == label }
                }
            )
        )

        val terminal = DownloadQueueStore.items
            .map { items -> items.firstOrNull { it.id == itemId } }
            .filterNotNull()
            .first { item ->
                item.state in setOf(
                    DownloadQueueItemState.Complete,
                    DownloadQueueItemState.Failed,
                    DownloadQueueItemState.Cancelled
                )
            }

        return when (terminal.state) {
            DownloadQueueItemState.Complete -> SaveResult(
                uri = terminal.savedUri
                    ?: throw IllegalStateException(
                        "Download completed without a saved URI."
                    ),
                title = terminal.savedTitle
                    ?.takeIf(String::isNotBlank)
                    ?: terminal.title,
                artist = terminal.artist,
                format = runCatching {
                    SaveFormat.valueOf(terminal.format)
                }.getOrDefault(SaveFormat.MP3)
            )

            DownloadQueueItemState.Cancelled ->
                throw CancellationException("Download cancelled")

            DownloadQueueItemState.Failed ->
                throw IllegalStateException(
                    terminal.message.ifBlank { "Download failed" }
                )

            else -> throw IllegalStateException("Unexpected download queue state")
        }
    }

    fun cancel() {
        val active = DownloadQueueStore.active() ?: return
        FrxeDownloadService.cancel(appContext, active.id)
    }
}
