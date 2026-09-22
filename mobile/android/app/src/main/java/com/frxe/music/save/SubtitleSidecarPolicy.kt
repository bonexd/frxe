package com.frxe.music.save

import java.io.File

object SubtitleSidecarPolicy {
    private val extensions = setOf("vtt", "srt", "ass", "lrc")

    fun subtitleFiles(files: List<File>): List<File> =
        files.filter { it.isFile && it.extension.lowercase() in extensions }

    fun destinationName(title: String, source: File): String {
        val safeTitle = title
            .trim()
            .ifBlank { "Frxe" }
            .replace(Regex("[^A-Za-z0-9._ -]+"), "_")
            .trim()
            .take(80)
            .ifBlank { "Frxe" }
        val safeSource = source.name
            .replace(Regex("[^A-Za-z0-9._-]+"), "_")
            .takeLast(100)
            .ifBlank { "subtitle.${source.extension.ifBlank { "vtt" }}" }
        return "$safeTitle-$safeSource"
    }
}
