package com.frxe.music.save

import android.content.Context
import com.frxe.music.source.PlaybackStreamResolver
import kotlinx.coroutines.CancellationException

internal class DownloadPipeline(
    context: Context
) {
    private val local = FrxeSaveEngine(context)
    private val seal = SealSaveEngine(context)
    private val pipe = NewPipeDownloadResolver()

    suspend fun save(
        request: SaveRequest,
        onState: (SaveUiState) -> Unit
    ): SaveResult {
        val sourceUrl =
            PlaybackStreamResolver
                .youtubeWatchUrl(request.sourceUrl)
                ?: request.sourceUrl.trim()

        require(sourceUrl.isNotEmpty()) {
            "No download source was provided."
        }

        return when {
            isYouTubePageUrl(sourceUrl) -> {
                var sealFailure: Throwable? = null

                if (seal.configured) {
                    try {
                        onState(
                            SaveUiState(
                                stage = SaveStage.Validating,
                                progress = 0.02f,
                                message = "Preparing Seal download…",
                                backend = DownloadBackend.Seal
                            )
                        )

                        return seal.save(
                            request.copy(sourceUrl = sourceUrl),
                            onState
                        )
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (error: Throwable) {
                        sealFailure = error
                    }
                }

                onState(
                    SaveUiState(
                        stage = SaveStage.Validating,
                        progress = 0.04f,
                        message = "Primary download failed · trying Pipe",
                        backend = DownloadBackend.NewPipe
                    )
                )

                val resolved =
                    pipe.resolve(sourceUrl)
                        ?: throw IllegalStateException(
                            buildString {
                                append("Pipe fallback could not resolve this audio.")
                                sealFailure?.message
                                    ?.takeIf(String::isNotBlank)
                                    ?.let {
                                        append(" Primary error: ")
                                        append(it)
                                    }
                            }
                        )

                local.save(
                    request.copy(sourceUrl = resolved)
                ) { state ->
                    onState(
                        state.copy(
                            backend = DownloadBackend.NewPipe
                        )
                    )
                }
            }

            isDirectDownloadUrl(sourceUrl) -> {
                onState(
                    SaveUiState(
                        stage = SaveStage.Validating,
                        progress = 0.02f,
                        message = "Preparing direct audio save…",
                        backend = DownloadBackend.Direct
                    )
                )

                local.save(
                    request.copy(sourceUrl = sourceUrl)
                ) { state ->
                    onState(
                        state.copy(
                            backend = DownloadBackend.Direct
                        )
                    )
                }
            }

            else -> {
                throw IllegalStateException(
                    "This source cannot be downloaded by Vitr."
                )
            }
        }
    }

    fun cancel() {
        local.cancel()
        seal.cancel()
    }
}
