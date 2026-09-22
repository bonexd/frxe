package com.frxe.music.save

import com.frxe.music.ytdlp.YtDlpDownloadRequest
import java.io.File

/**
 * Maps yt-dlp download options to the metadata/artwork that FRXE should apply
 * when finalizing a native download.
 */
object NativeDownloadFinalizationPolicy {
    fun metadataFor(request: YtDlpDownloadRequest): SaveMetadata =
        if (request.embedMetadata) {
            SaveMetadata(
                album = request.album,
                playlistTitle = request.playlistTitle,
                trackNumber = request.trackNumber,
                discNumber = request.discNumber,
                releaseYear = request.releaseYear,
                sourceUrl = request.sourceUrl
            )
        } else {
            SaveMetadata()
        }

    fun artworkFor(
        request: YtDlpDownloadRequest,
        sidecars: List<File>
    ): File? {
        if (!request.embedThumbnail) return null

        return sidecars.firstOrNull { file ->
            file.extension.lowercase() in ARTWORK_EXTENSIONS
        }
    }

    private val ARTWORK_EXTENSIONS =
        setOf("jpg", "jpeg", "png", "webp")
}
