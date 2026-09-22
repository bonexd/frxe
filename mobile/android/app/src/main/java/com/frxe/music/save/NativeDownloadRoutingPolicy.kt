package com.frxe.music.save

import com.frxe.music.ytdlp.YtDlpDownloadRequest
import com.frxe.music.ytdlp.YtDlpDownloadRequestCodec
import java.net.URI

sealed interface QueuedDownloadRequest {
    data class Legacy(
        val request: SaveRequest
    ) : QueuedDownloadRequest

    data class Native(
        val request: YtDlpDownloadRequest
    ) : QueuedDownloadRequest
}

object NativeDownloadRoutingPolicy {

    fun forSaveRequest(
        request: SaveRequest
    ): QueuedDownloadRequest =
        QueuedDownloadRequest.Legacy(request)

    fun resolve(
        item: DownloadQueueItem
    ): QueuedDownloadRequest? =
        when (item.executionKind) {
            DownloadExecutionKind.Legacy ->
                resolveLegacy(item)

            DownloadExecutionKind.YtDlp ->
                YtDlpDownloadRequestCodec
                    .decode(item.engineRequestJson)
                    ?.let(QueuedDownloadRequest::Native)
        }

    private fun resolveLegacy(
        item: DownloadQueueItem
    ): QueuedDownloadRequest.Legacy? {
        val format =
            runCatching {
                SaveFormat.valueOf(item.format)
            }.getOrNull()
                ?: return null

        val quality =
            runCatching {
                SaveQuality.valueOf(item.quality)
            }.getOrNull()
                ?: return null

        return QueuedDownloadRequest.Legacy(
            SaveRequest(
                sourceUrl = item.sourceUrl,
                title = item.title,
                artist = item.artist,
                format = format,
                quality = quality
            )
        )
    }

    private fun isYouTubeSource(sourceUrl: String): Boolean {
        val uri =
            runCatching {
                URI(sourceUrl.trim())
            }.getOrNull()
                ?: return false

        val scheme = uri.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") return false

        val host =
            uri.host
                ?.lowercase()
                ?.trimEnd('.')
                ?: return false

        return host == "youtu.be" ||
            host == "youtube.com" ||
            host.endsWith(".youtube.com")
    }
}
