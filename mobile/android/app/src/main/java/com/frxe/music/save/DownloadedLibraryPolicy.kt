package com.frxe.music.save

import com.frxe.music.model.Track

data class DownloadedLibraryEntry(
    val queueItemId: String,
    val track: Track,
    val format: String,
    val quality: String,
    val updatedAtMs: Long
)

object DownloadedLibraryPolicy {
    fun entries(
        items: List<DownloadQueueItem>
    ): List<DownloadedLibraryEntry> =
        items
            .asSequence()
            .filter { item ->
                item.state == DownloadQueueItemState.Complete &&
                    !item.savedUri.isNullOrBlank()
            }
            .sortedByDescending(DownloadQueueItem::updatedAtMs)
            .mapNotNull(::entryFor)
            .toList()

    private fun entryFor(
        item: DownloadQueueItem
    ): DownloadedLibraryEntry? {
        val savedUri = item.savedUri
            ?.trim()
            ?.takeIf(String::isNotEmpty)
            ?: return null
        val sourceUrl = item.sourceUrl.trim()

        return DownloadedLibraryEntry(
            queueItemId = item.id,
            track = Track(
                id = "download-${item.id}",
                title = item.savedTitle
                    ?.trim()
                    ?.takeIf(String::isNotEmpty)
                    ?: item.title.ifBlank { "Downloaded track" },
                artist = item.artist.ifBlank { "Unknown artist" },
                album = "Downloads",
                streamUrl = savedUri,
                durationMs = 0L,
                artworkSeed = (sourceUrl.ifBlank { item.id }).hashCode(),
                downloadUrl = sourceUrl.takeIf(String::isNotEmpty),
                originalStreamUrl = sourceUrl.takeIf(String::isNotEmpty)
            ),
            format = item.format,
            quality = item.quality,
            updatedAtMs = item.updatedAtMs
        )
    }
}
