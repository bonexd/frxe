package com.frxe.music.save

import android.content.ContentValues
import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.ReturnCode
import com.frxe.music.BuildConfig
import com.frxe.music.playback.ResolvedStreamRequestHeaders
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlin.coroutines.coroutineContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

class FrxeSaveEngine(
    private val context: Context
) {
    @Volatile
    private var activeSessionId:
        Long? = null

    suspend fun save(
        request: SaveRequest,
        onState: (SaveUiState) -> Unit
    ): SaveResult =
        withContext(Dispatchers.IO) {
            onState(
                SaveUiState(
                    SaveStage.Validating,
                    0.02f,
                    "Checking source"
                )
            )

            val input =
                File.createTempFile(
                    "frxe-input-",
                    ".media",
                    context.cacheDir
                )

            try {
                download(
                    request.sourceUrl,
                    input
                ) { fraction ->
                    onState(
                        SaveUiState(
                            SaveStage.Downloading,
                            0.05f + fraction * 0.45f,
                            "Downloading ${(fraction * 100).toInt()}%"
                        )
                    )
                }
            } catch (error: Throwable) {
                input.delete()
                throw error
            }

            processLocalInput(
                input = input,
                request = request,
                ownership = SaveInputOwnership.Engine,
                onState = onState
            )
        }

    suspend fun saveLocalInput(
        input: File,
        request: SaveRequest,
        onState: (SaveUiState) -> Unit
    ): SaveResult =
        withContext(Dispatchers.IO) {
            require(
                input.isFile &&
                    input.length() > 0L
            ) {
                "Local media input is unavailable."
            }

            onState(
                SaveUiState(
                    SaveStage.Validating,
                    0.50f,
                    "Processing media"
                )
            )

            processLocalInput(
                input = input,
                request = request,
                ownership = SaveInputOwnership.Caller,
                onState = onState
            )
        }

    fun cancel() {
        activeSessionId
            ?.let(FFmpegKit::cancel)
    }

    private suspend fun processLocalInput(
        input: File,
        request: SaveRequest,
        ownership: SaveInputOwnership,
        onState: (SaveUiState) -> Unit
    ): SaveResult {
        val output =
            File(
                context.cacheDir,
                outputFileName(
                    request.title,
                    request.format
                ).let {
                    "frxe-${System.nanoTime()}-$it"
                }
            )

        try {
            val durationMs =
                mediaDurationMs(input)

            onState(
                SaveUiState(
                    SaveStage.Converting,
                    0.52f,
                    "Converting to ${request.format.displayName}"
                )
            )

            transcode(
                input,
                output,
                request,
                durationMs
            ) { fraction ->
                onState(
                    SaveUiState(
                        SaveStage.Converting,
                        0.52f + fraction * 0.38f,
                        "Converting ${(fraction * 100).toInt()}%"
                    )
                )
            }

            onState(
                SaveUiState(
                    SaveStage.Exporting,
                    0.93f,
                    "Saving to Music/Vitr"
                )
            )

            val uri =
                export(
                    output,
                    request
                )

            val result =
                SaveResult(
                    uri.toString(),
                    request.title.ifBlank {
                        "Vitr export"
                    },
                    request.artist.ifBlank {
                        "Unknown artist"
                    },
                    request.format
                )

            onState(
                SaveUiState(
                    SaveStage.Complete,
                    1f,
                    "Saved to Music/Vitr",
                    result.uri,
                    result.title
                )
            )

            return result
        } finally {
            activeSessionId = null
            FrxeSaveEnginePolicy
                .cleanupFiles(
                    input = input,
                    output = output,
                    ownership = ownership
                )
                .forEach { file ->
                    file.delete()
                }
        }
    }

    private suspend fun download(
        sourceUrl: String,
        target: File,
        onProgress: (Float) -> Unit
    ) {
        var lastError:
            Throwable? = null

        repeat(3) { attempt ->
            coroutineContext
                .ensureActive()

            try {
                target.delete()
                downloadOnce(
                    sourceUrl,
                    target,
                    onProgress
                )
                return
            } catch (
                cancelled: CancellationException
            ) {
                throw cancelled
            } catch (
                error: Throwable
            ) {
                lastError = error

                if (attempt < 2) {
                    delay(
                        650L *
                            (attempt + 1)
                    )
                }
            }
        }

        throw lastError
            ?: IllegalStateException(
                "Download failed"
            )
    }

    private suspend fun downloadOnce(
        sourceUrl: String,
        target: File,
        onProgress: (Float) -> Unit
    ) {
        val source = URL(sourceUrl)
        val sourceHost =
            source.host
                ?.lowercase()
                .orEmpty()

        val connection =
            (
                source
                    .openConnection() as
                    HttpURLConnection
                )
                .apply {
                    connectTimeout = 15_000
                    readTimeout = 120_000
                    instanceFollowRedirects = true

                    val isYouTubeCdn =
                        sourceHost == "googlevideo.com" ||
                            sourceHost.endsWith(
                                ".googlevideo.com"
                            )

                    setRequestProperty(
                        "User-Agent",
                        if (isYouTubeCdn) {
                            "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36"
                        } else {
                            "Vitr/${BuildConfig.VERSION_NAME}"
                        }
                    )
                    setRequestProperty(
                        "Accept",
                        "audio/*,video/*,application/octet-stream,*/*;q=0.5"
                    )

                    if (isYouTubeCdn) {
                        setRequestProperty(
                            "Referer",
                            "https://www.youtube.com/"
                        )
                        setRequestProperty(
                            "Origin",
                            "https://www.youtube.com"
                        )
                    }

                    ResolvedStreamRequestHeaders
                        .forUrl(sourceUrl)
                        .forEach {
                                (name, value) ->
                            setRequestProperty(
                                name,
                                value
                            )
                        }
                }

        try {
            connection.connect()

            if (
                connection.responseCode !in
                    200..299
            ) {
                error(
                    "Source returned HTTP ${connection.responseCode}"
                )
            }

            val contentType =
                connection.contentType
                    ?.substringBefore(';')
                    ?.trim()
                    ?.lowercase()
                    .orEmpty()

            if (
                contentType.startsWith(
                    "text/html"
                )
            ) {
                error(
                    "That address is a web page, not a direct media source"
                )
            }

            val total =
                connection.contentLengthLong
                    .takeIf {
                        it > 0L
                    }

            connection.inputStream
                .buffered()
                .use { input ->
                    FileOutputStream(
                        target
                    )
                        .buffered()
                        .use { output ->
                            val buffer =
                                ByteArray(
                                    DEFAULT_BUFFER_SIZE * 4
                                )

                            var readTotal =
                                0L

                            while (true) {
                                coroutineContext
                                    .ensureActive()

                                val count =
                                    input.read(
                                        buffer
                                    )

                                if (count < 0) {
                                    break
                                }

                                output.write(
                                    buffer,
                                    0,
                                    count
                                )

                                readTotal += count

                                val progress =
                                    total
                                        ?.let {
                                            (
                                                readTotal.toDouble() /
                                                    it
                                                )
                                                .toFloat()
                                                .coerceIn(
                                                    0f,
                                                    1f
                                                )
                                        }
                                        ?: (
                                            1f -
                                                1f /
                                                (
                                                    1f +
                                                        readTotal /
                                                        2_000_000f
                                                    )
                                            )
                                            .coerceAtMost(
                                                0.95f
                                            )

                                onProgress(
                                    progress
                                )
                            }
                        }
                }

            onProgress(1f)
        } finally {
            connection.disconnect()
        }
    }

    private fun mediaDurationMs(
        input: File
    ): Long =
        runCatching {
            val retriever =
                MediaMetadataRetriever()

            try {
                retriever.setDataSource(
                    input.absolutePath
                )

                retriever.extractMetadata(
                    MediaMetadataRetriever
                        .METADATA_KEY_DURATION
                )
                    ?.toLongOrNull()
                    ?: 0L
            } finally {
                retriever.release()
            }
        }
            .getOrDefault(0L)

    private suspend fun transcode(
        input: File,
        output: File,
        request: SaveRequest,
        durationMs: Long,
        onProgress: (Float) -> Unit
    ) =
        suspendCancellableCoroutine<Unit> {
                continuation ->
            val args =
                buildFfmpegArguments(
                    inputPath =
                        input.absolutePath,
                    outputPath =
                        output.absolutePath,
                    format =
                        request.format,
                    quality =
                        request.quality,
                    title =
                        request.title.ifBlank {
                            "Vitr export"
                        },
                    artist =
                        request.artist.ifBlank {
                            "Unknown artist"
                        }
                )

            val session =
                FFmpegKit
                    .executeWithArgumentsAsync(
                        args.toTypedArray(),
                        { finished ->
                            activeSessionId = null

                            when {
                                ReturnCode.isSuccess(
                                    finished.returnCode
                                ) -> {
                                    onProgress(1f)

                                    if (
                                        continuation.isActive
                                    ) {
                                        continuation.resume(
                                            Unit
                                        )
                                    }
                                }

                                ReturnCode.isCancel(
                                    finished.returnCode
                                ) -> {
                                    if (
                                        continuation.isActive
                                    ) {
                                        continuation.resumeWithException(
                                            IllegalStateException(
                                                "Conversion cancelled"
                                            )
                                        )
                                    }
                                }

                                else -> {
                                    val message =
                                        finished.failStackTrace
                                            ?.takeIf(
                                                String::isNotBlank
                                            )
                                            ?: finished.output
                                                ?.takeLast(500)
                                            ?: "FFmpeg conversion failed"

                                    if (
                                        continuation.isActive
                                    ) {
                                        continuation.resumeWithException(
                                            IllegalStateException(
                                                message
                                            )
                                        )
                                    }
                                }
                            }
                        },
                        { _ -> Unit },
                        { statistics ->
                            if (durationMs > 0L) {
                                val fraction =
                                    (
                                        statistics.time.toDouble() /
                                            durationMs.toDouble()
                                        )
                                        .toFloat()
                                        .coerceIn(
                                            0f,
                                            0.99f
                                        )

                                onProgress(
                                    fraction
                                )
                            }
                        }
                    )

            activeSessionId =
                session.sessionId

            continuation
                .invokeOnCancellation {
                    FFmpegKit.cancel(
                        session.sessionId
                    )
                }
        }

    private fun export(
        source: File,
        request: SaveRequest
    ): Uri {
        val displayName =
            outputFileName(
                request.title,
                request.format
            )

        if (
            Build.VERSION.SDK_INT >=
                Build.VERSION_CODES.Q
        ) {
            val values =
                ContentValues()
                    .apply {
                        put(
                            MediaStore.Audio.Media.DISPLAY_NAME,
                            displayName
                        )
                        put(
                            MediaStore.Audio.Media.MIME_TYPE,
                            request.format.mimeType
                        )
                        put(
                            MediaStore.Audio.Media.TITLE,
                            request.title.ifBlank {
                                "Vitr export"
                            }
                        )
                        put(
                            MediaStore.Audio.Media.ARTIST,
                            request.artist.ifBlank {
                                "Unknown artist"
                            }
                        )
                        put(
                            MediaStore.Audio.Media.RELATIVE_PATH,
                            "${Environment.DIRECTORY_MUSIC}/Vitr"
                        )
                        put(
                            MediaStore.Audio.Media.IS_PENDING,
                            1
                        )
                    }

            val resolver =
                context.contentResolver

            val uri =
                resolver.insert(
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                    values
                )
                    ?: error(
                        "Could not create MediaStore item"
                    )

            try {
                resolver.openOutputStream(
                    uri,
                    "w"
                )
                    ?.use { output ->
                        source.inputStream()
                            .use {
                                it.copyTo(
                                    output
                                )
                            }
                    }
                    ?: error(
                        "Could not open MediaStore destination"
                    )

                values.clear()
                values.put(
                    MediaStore.Audio.Media.IS_PENDING,
                    0
                )
                resolver.update(
                    uri,
                    values,
                    null,
                    null
                )

                return uri
            } catch (error: Throwable) {
                resolver.delete(
                    uri,
                    null,
                    null
                )
                throw error
            }
        }

        val root =
            context.getExternalFilesDir(
                Environment.DIRECTORY_MUSIC
            )
                ?: context.filesDir

        val directory =
            File(
                root,
                "Vitr"
            )
                .apply {
                    mkdirs()
                }

        val destination =
            File(
                directory,
                displayName
            )

        source.copyTo(
            destination,
            overwrite = true
        )

        return Uri.fromFile(
            destination
        )
    }
}
