package com.frxe.music.save

import com.frxe.music.source.FrxeNewPipeRuntime
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.schabi.newpipe.extractor.NewPipe

internal class NewPipeDownloadResolver {
    suspend fun resolve(
        sourceUrl: String
    ): String? = withContext(Dispatchers.IO) {
        val normalizedUrl = sourceUrl.trim()
        if (normalizedUrl.isEmpty()) {
            return@withContext null
        }

        if (
            normalizedUrl.startsWith(
                "frxe-catalog://",
                ignoreCase = true
            )
        ) {
            return@withContext null
        }

        runCatching {
            FrxeNewPipeRuntime.initialize()

            val extractor =
                NewPipe
                    .getServiceByUrl(normalizedUrl)
                    .getStreamExtractor(normalizedUrl)

            extractor.fetchPage()

            extractor.audioStreams
                .asSequence()
                .sortedByDescending { stream ->
                    runCatching {
                        stream.averageBitrate
                    }.getOrDefault(0)
                }
                .mapNotNull { stream ->
                    runCatching {
                        stream.content
                    }.getOrNull()
                        ?.trim()
                        ?.takeIf(String::isNotEmpty)
                }
                .firstOrNull(::isHttpUrl)
        }.getOrNull()
    }

    private fun isHttpUrl(
        value: String
    ): Boolean =
        value.startsWith(
            "https://",
            ignoreCase = true
        ) ||
            value.startsWith(
                "http://",
                ignoreCase = true
            )
}
