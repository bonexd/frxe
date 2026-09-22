package com.frxe.music.save

import android.content.Context
import com.frxe.music.source.PlaybackStreamResolver
import com.frxe.music.ytdlp.YtDlpCore
import com.frxe.music.ytdlp.YtDlpDownloadRequest
import java.io.File
import java.util.UUID
import kotlinx.coroutines.CancellationException

internal class SealSaveEngine(
    context: Context
) {
    private val appContext = context.applicationContext
    private val saveEngine = FrxeSaveEngine(appContext)

    @Volatile
    private var activeProcessId: String? = null

    val configured: Boolean
        get() = YtDlpCore.capabilities.ytDlpReady

    suspend fun save(
        request: SaveRequest,
        onState: (SaveUiState) -> Unit
    ): SaveResult {
        val sourceUrl =
            PlaybackStreamResolver.youtubeWatchUrl(request.sourceUrl)
                ?: request.sourceUrl.trim()

        require(isYouTubePageUrl(sourceUrl)) {
            "Seal fallback only supports YouTube sources."
        }

        require(configured) {
            "Seal download engine is unavailable."
        }

        val id = UUID.randomUUID().toString()
        val processId = "vitr-seal-$id"
        val workDir = File(
            File(appContext.cacheDir, WORK_ROOT),
            id
        )

        activeProcessId = processId

        try {
            onState(
                SaveUiState(
                    stage = SaveStage.Validating,
                    progress = 0.03f,
                    message = "Trying Seal engine…",
                    backend = DownloadBackend.Seal
                )
            )

            val downloaded =
                YtDlpCore.download(
                    request = YtDlpDownloadRequest(
                        sourceUrl = sourceUrl,
                        title = request.title,
                        artist = request.artist,
                        outputFormat = request.format,
                        quality = request.quality,
                        useAcceleratedDownloader = true,
                        embedMetadata = true,
                        embedThumbnail = true
                    ),
                    workDir = workDir,
                    processId = processId
                ) { fraction ->
                    val normalized = fraction.coerceIn(0f, 1f)

                    onState(
                        SaveUiState(
                            stage = SaveStage.Downloading,
                            progress = 0.05f + normalized * 0.42f,
                            message =
                                "Seal downloading ${(normalized * 100f).toInt()}%",
                            backend = DownloadBackend.Seal
                        )
                    )
                }

            return saveEngine.saveLocalInput(
                input = downloaded.mediaFile,
                request = request.copy(
                    sourceUrl = sourceUrl
                )
            ) { state ->
                onState(
                    state.copy(
                        backend = DownloadBackend.Seal
                    )
                )
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } finally {
            if (activeProcessId == processId) {
                activeProcessId = null
            }
            runCatching {
                workDir.deleteRecursively()
            }
        }
    }

    fun cancel() {
        activeProcessId
            ?.let(YtDlpCore::cancelDownload)

        saveEngine.cancel()
    }

    private companion object {
        const val WORK_ROOT = "vitr-seal-downloads"
    }
}
