package com.frxe.music.save

import com.frxe.music.source.PlaybackResolutionResult
import com.frxe.music.source.PlaybackResolverKind
import com.frxe.music.source.YouTubeAudioResolverRuntime
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal class DownloadAudioResolver {

    suspend fun resolve(
        sourceUrl: String,
        onAttempt: (DownloadResolverKind) -> Unit = {}
    ): PlaybackResolutionResult = withContext(Dispatchers.IO) {
        val videoId = YouTubeAudioResolverRuntime
            .videoIdFromSource(sourceUrl)

        if (videoId == null) {
            return@withContext PlaybackResolutionResult.Failed(
                message =
                    "This YouTube source does not contain a valid video ID.",
                attempts = emptyList()
            )
        }

        val order = downloadResolverOrder()
            .map { it.toPlaybackResolverKind() }

        YouTubeAudioResolverRuntime.resolve(
            videoId = videoId,
            order = order,
            onAttempt = { kind ->
                onAttempt(
                    kind.toDownloadResolverKind()
                )
            }
        )
    }

    private fun DownloadResolverKind
        .toPlaybackResolverKind(): PlaybackResolverKind =
        when (this) {
            DownloadResolverKind.InnerTube ->
                PlaybackResolverKind.InnerTube

            DownloadResolverKind.NewPipe ->
                PlaybackResolverKind.NewPipe

            DownloadResolverKind.YtDlp ->
                PlaybackResolverKind.YtDlp
        }

    private fun PlaybackResolverKind
        .toDownloadResolverKind(): DownloadResolverKind =
        when (this) {
            PlaybackResolverKind.InnerTube ->
                DownloadResolverKind.InnerTube

            PlaybackResolverKind.NewPipe ->
                DownloadResolverKind.NewPipe

            PlaybackResolverKind.YtDlp ->
                DownloadResolverKind.YtDlp
        }
}
