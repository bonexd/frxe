package com.frxe.music.save

import java.net.URI

object SaveUrlPolicy {
    fun isAllowedDirectMediaUrl(raw: String): Boolean {
        val uri = runCatching { URI(raw.trim()) }.getOrNull() ?: return false
        if (uri.scheme?.lowercase() !in setOf("http", "https")) return false
        val host = uri.host?.lowercase()?.trimEnd('.') ?: return false
        return true
    }
}

fun outputFileName(title: String, format: SaveFormat): String {
    val cleaned = title
        .trim()
        .replace(Regex("[\\\\/:*?\"<>|]"), "_")
        .replace(Regex("\\s+"), " ")
        .trim('.', ' ')
        .ifBlank { "Frxe export" }
        .take(120)
    return "$cleaned.${format.extension}"
}

fun buildFfmpegArguments(
    inputPath: String,
    outputPath: String,
    format: SaveFormat,
    quality: SaveQuality,
    title: String,
    artist: String,
    metadata: SaveMetadata = SaveMetadata(),
    artworkPath: String? = null
): List<String> {
    val artwork =
        artworkPath
            ?.trim()
            ?.takeIf(String::isNotEmpty)
            ?.takeIf { format == SaveFormat.MP3 }

    val common = mutableListOf(
        "-y",
        "-i", inputPath
    )

    if (artwork != null) {
        common += listOf(
            "-i", artwork,
            "-map", "0:a:0",
            "-map", "1:v:0"
        )
    } else {
        common += "-vn"
    }

    common += listOf(
        "-map_metadata", "-1",
        "-metadata", "title=$title",
        "-metadata", "artist=$artist"
    )

    metadata.album
        ?.trim()
        ?.takeIf(String::isNotEmpty)
        ?.let { album ->
            common += listOf("-metadata", "album=$album")
        }

    metadata.playlistTitle
        ?.trim()
        ?.takeIf(String::isNotEmpty)
        ?.let { playlist ->
            common += listOf("-metadata", "playlist=$playlist")
        }

    metadata.trackNumber
        ?.takeIf { it > 0 }
        ?.let { track ->
            common += listOf("-metadata", "track=$track")
        }

    metadata.discNumber
        ?.takeIf { it > 0 }
        ?.let { disc ->
            common += listOf("-metadata", "disc=$disc")
        }

    metadata.releaseYear
        ?.takeIf { it in 1000..9999 }
        ?.let { year ->
            common += listOf("-metadata", "date=$year")
        }

    metadata.sourceUrl
        ?.trim()
        ?.takeIf(String::isNotEmpty)
        ?.let { sourceUrl ->
            common += listOf("-metadata", "comment=Source: $sourceUrl")
        }

    when (format) {
        SaveFormat.M4A -> {
            val bitrate = when (quality) {
                SaveQuality.Mp3K128 -> "128k"
                SaveQuality.Mp3K192 -> "192k"
                SaveQuality.Mp3K256 -> "256k"
                SaveQuality.Mp3K320 -> "320k"
                else -> "256k"
            }
            common += listOf("-c:a", "aac", "-b:a", bitrate, "-movflags", "+faststart")
        }
        SaveFormat.MP3 -> {
            val bitrate = when (quality) {
                SaveQuality.Mp3K128 -> "128k"
                SaveQuality.Mp3K192 -> "192k"
                SaveQuality.Mp3K256 -> "256k"
                SaveQuality.Mp3K320 -> "320k"
                else -> "320k"
            }
            common += listOf("-c:a", "libmp3lame", "-b:a", bitrate)
            if (artwork != null) {
                common += listOf(
                    "-c:v", "mjpeg",
                    "-disposition:v", "attached_pic"
                )
            }
        }
        SaveFormat.FLAC -> {
            val sampleRate = if (quality == SaveQuality.Lossless44k) "44100" else "48000"
            common += listOf("-c:a", "flac", "-compression_level", "8", "-ar", sampleRate)
        }
        SaveFormat.WAV -> {
            val sampleRate = if (quality == SaveQuality.Lossless44k) "44100" else "48000"
            common += listOf("-c:a", "pcm_s24le", "-ar", sampleRate)
        }
    }
    common += outputPath
    return common
}

fun List<String>.asFfmpegCommand(): String = joinToString(" ") { argument ->
    if (argument.none { it.isWhitespace() || it == '\'' || it == '"' }) argument
    else "'${argument.replace("'", "'\\''")}'"
}
