package com.frxe.music.save

import android.content.Context
import android.os.Environment
import java.io.File

class FrxeSubtitleSidecarExporter(context: Context) {
    private val appContext = context.applicationContext

    fun export(files: List<File>, title: String): List<File> {
        val subtitleFiles = SubtitleSidecarPolicy.subtitleFiles(files)
        if (subtitleFiles.isEmpty()) return emptyList()

        val root = appContext.getExternalFilesDir(Environment.DIRECTORY_MUSIC)
            ?: appContext.filesDir
        val directory = File(root, "Frxe/Subtitles").apply { mkdirs() }

        return subtitleFiles.map { source ->
            val destination = File(
                directory,
                SubtitleSidecarPolicy.destinationName(title, source)
            )
            source.copyTo(destination, overwrite = true)
            destination
        }
    }
}
