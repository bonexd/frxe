package com.frxe.music.save

import android.content.Context
import com.frxe.music.ytdlp.YtDlpCore
import com.frxe.music.ytdlp.YtDlpDownloadRequest
import com.frxe.music.ytdlp.YtDlpMediaKind
import java.io.File
import kotlinx.coroutines.CancellationException

internal class YtDlpNativeDownloadPipeline(
    context: Context
) {
    private val appContext = context.applicationContext
    private val saveEngine = FrxeSaveEngine(appContext)
    private val subtitleExporter = FrxeSubtitleSidecarExporter(appContext)

    @Volatile private var activeItemId: String? = null
    @Volatile private var activeProcessId: String? = null

    suspend fun save(
        request: YtDlpDownloadRequest,
        queueItemId: String,
        onState: (SaveUiState) -> Unit
    ): SaveResult {
        require(request.mediaKind == YtDlpMediaKind.Audio) {
            "This download type is not available yet."
        }

        val workDir = File(File(appContext.cacheDir, WORK_ROOT), safeItemId(queueItemId))
        val processId = processId(queueItemId)
        activeItemId = queueItemId
        activeProcessId = processId

        try {
            onState(SaveUiState(SaveStage.Validating, 0.02f, "Preparing download"))

            val downloaded = YtDlpCore.download(
                request = request,
                workDir = workDir,
                processId = processId
            ) { fraction ->
                val normalized = fraction.coerceIn(0f, 1f)
                onState(
                    SaveUiState(
                        SaveStage.Downloading,
                        0.05f + normalized * 0.45f,
                        "Downloading ${(normalized * 100f).toInt()}%"
                    )
                )
            }

            onState(SaveUiState(SaveStage.Converting, 0.50f, "Processing media"))

            val result = saveEngine.saveLocalInput(
                input = downloaded.mediaFile,
                request = SaveRequest(
                    sourceUrl = request.sourceUrl,
                    title = request.title,
                    artist = request.artist,
                    format = request.outputFormat,
                    quality = request.quality
                ),
                onState = onState
            )

            if (request.subtitleLanguages.isNotEmpty() || request.writeAutoSubtitles) {
                runCatching {
                    subtitleExporter.export(
                        files = downloaded.sidecarFiles,
                        title = request.title
                    )
                }
            }

            return result
        } catch (cancelled: CancellationException) {
            throw cancelled
        } finally {
            if (activeItemId == queueItemId) {
                activeItemId = null
                activeProcessId = null
            }
            runCatching { workDir.deleteRecursively() }
        }
    }

    fun cancel(itemId: String? = null) {
        val runningItem = activeItemId
        if (itemId != null && runningItem != itemId) return
        activeProcessId?.let(YtDlpCore::cancelDownload)
        saveEngine.cancel()
    }

    private fun safeItemId(itemId: String): String =
        itemId.filter { it.isLetterOrDigit() || it == '-' || it == '_' }
            .take(96)
            .ifBlank { "download" }

    private fun processId(itemId: String): String = "frxe-download-${safeItemId(itemId)}"

    private companion object {
        const val WORK_ROOT = "frxe-native-downloads"
    }
}
