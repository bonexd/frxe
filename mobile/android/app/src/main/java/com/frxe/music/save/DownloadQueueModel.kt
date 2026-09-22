package com.frxe.music.save

import java.net.URI

enum class DownloadQueueItemState {
    Queued,
    Running,
    Paused,
    Complete,
    Failed,
    Cancelled
}

enum class DownloadExecutionKind {
    Legacy,
    YtDlp
}

data class DownloadQueueItem(
    val id: String,
    val sourceUrl: String,
    val title: String,
    val artist: String,
    val format: String,
    val quality: String,
    val executionKind: DownloadExecutionKind = DownloadExecutionKind.Legacy,
    val engineRequestJson: String? = null,
    val state: DownloadQueueItemState = DownloadQueueItemState.Queued,
    val progress: Float = 0f,
    val message: String = "Queued",
    val backend: String? = null,
    val retryCount: Int = 0,
    val savedUri: String? = null,
    val savedTitle: String? = null,
    val createdAtMs: Long,
    val updatedAtMs: Long
)

object DownloadQueuePolicy {
    const val MAX_AUTO_RETRIES = 2

    fun normalizeSource(raw: String): String {
        val value = raw.trim()
        if (value.isEmpty()) return ""

        val uri = runCatching { URI(value) }.getOrNull()
            ?: return value

        val scheme = uri.scheme?.lowercase()
        val host = uri.host?.lowercase()

        if (scheme !in setOf("http", "https") || host.isNullOrBlank()) {
            return value
        }

        val portPart = if (uri.port >= 0) ":${uri.port}" else ""
        val path = uri.rawPath.orEmpty().let { rawPath ->
            when {
                rawPath.isBlank() -> ""
                rawPath.length > 1 -> rawPath.trimEnd('/')
                else -> rawPath
            }
        }
        val query = uri.rawQuery?.let { "?$it" }.orEmpty()

        return "$scheme://$host$portPart$path$query"
    }

    fun duplicateKey(
        sourceUrl: String,
        format: String,
        quality: String
    ): String = buildString {
        append(normalizeSource(sourceUrl))
        append('|')
        append(format.trim().uppercase())
        append('|')
        append(quality.trim())
    }

    fun findDuplicate(
        items: List<DownloadQueueItem>,
        sourceUrl: String,
        format: String,
        quality: String
    ): DownloadQueueItem? {
        val wanted = duplicateKey(sourceUrl, format, quality)
        return items.firstOrNull { item ->
            item.state in setOf(
                DownloadQueueItemState.Queued,
                DownloadQueueItemState.Running,
                DownloadQueueItemState.Paused,
                DownloadQueueItemState.Complete
            ) && duplicateKey(item.sourceUrl, item.format, item.quality) == wanted
        }
    }

    fun nextRunnable(items: List<DownloadQueueItem>): DownloadQueueItem? =
        items
            .asSequence()
            .filter { it.state == DownloadQueueItemState.Queued }
            .minWithOrNull(
                compareBy<DownloadQueueItem> { it.createdAtMs }
                    .thenBy { it.id }
            )

    fun pause(
        item: DownloadQueueItem,
        nowMs: Long
    ): DownloadQueueItem = when (item.state) {
        DownloadQueueItemState.Queued,
        DownloadQueueItemState.Running -> item.copy(
            state = DownloadQueueItemState.Paused,
            progress = if (item.state == DownloadQueueItemState.Running) 0f else item.progress,
            message = "Paused",
            updatedAtMs = nowMs
        )

        else -> item
    }

    fun resume(
        item: DownloadQueueItem,
        nowMs: Long
    ): DownloadQueueItem = when (item.state) {
        DownloadQueueItemState.Paused,
        DownloadQueueItemState.Failed -> item.copy(
            state = DownloadQueueItemState.Queued,
            progress = 0f,
            message = "Queued",
            backend = null,
            savedUri = null,
            savedTitle = null,
            updatedAtMs = nowMs
        )

        else -> item
    }

    fun recoverAfterRestart(
        items: List<DownloadQueueItem>,
        nowMs: Long
    ): List<DownloadQueueItem> = items.map { item ->
        if (item.state == DownloadQueueItemState.Running) {
            item.copy(
                state = DownloadQueueItemState.Queued,
                progress = 0f,
                message = "Recovered after restart",
                backend = null,
                updatedAtMs = nowMs
            )
        } else {
            item
        }
    }

    fun reconcileCompletedDownloads(
        items: List<DownloadQueueItem>,
        nowMs: Long,
        uriExists: (String) -> Boolean
    ): List<DownloadQueueItem> = items.map { item ->
        if (item.state != DownloadQueueItemState.Complete) {
            item
        } else {
            val savedUri = item.savedUri
                ?.trim()
                ?.takeIf(String::isNotEmpty)

            if (savedUri != null && uriExists(savedUri)) {
                item
            } else {
                item.copy(
                    state = DownloadQueueItemState.Failed,
                    progress = 0f,
                    message = "Downloaded file is missing",
                    backend = null,
                    savedUri = null,
                    savedTitle = null,
                    updatedAtMs = nowMs
                )
            }
        }
    }

    fun retryAllFailed(
        items: List<DownloadQueueItem>,
        nowMs: Long
    ): List<DownloadQueueItem> = items.map { item ->
        if (item.state == DownloadQueueItemState.Failed) {
            resume(
                item.copy(retryCount = 0),
                nowMs
            )
        } else {
            item
        }
    }

    fun clearFailedAndCancelled(
        items: List<DownloadQueueItem>
    ): List<DownloadQueueItem> = items.filterNot { item ->
        item.state == DownloadQueueItemState.Failed ||
            item.state == DownloadQueueItemState.Cancelled
    }

    fun canAutoRetry(item: DownloadQueueItem): Boolean =
        item.state == DownloadQueueItemState.Failed &&
            item.retryCount < MAX_AUTO_RETRIES

    fun isDownloaded(
        items: List<DownloadQueueItem>,
        sourceUrl: String
    ): Boolean {
        val normalized = normalizeSource(sourceUrl)
        if (normalized.isBlank()) return false

        return items.any { item ->
            item.state == DownloadQueueItemState.Complete &&
                !item.savedUri.isNullOrBlank() &&
                normalizeSource(item.sourceUrl) == normalized
        }
    }
}
