package com.frxe.music.save

import android.content.Context
import android.net.Uri
import java.io.File

object DownloadQueueActions {

    fun removeDownloadedFile(
        context: Context,
        itemId: String
    ): Boolean {
        val item = DownloadQueueStore.item(itemId) ?: return false
        val savedUri = item.savedUri ?: return false

        val deleted = runCatching {
            val uri = Uri.parse(savedUri)
            when (uri.scheme?.lowercase()) {
                "content" -> context.contentResolver.delete(uri, null, null) >= 0
                "file" -> uri.path?.let(::File)?.let { file ->
                    !file.exists() || file.delete()
                } ?: false
                else -> false
            }
        }.getOrDefault(false)

        if (deleted) {
            DownloadQueueStore.remove(itemId)
        }

        return deleted
    }

    fun deleteAllDownloads(
        context: Context
    ): Int {
        val completedIds = DownloadQueueStore.items.value
            .filter {
                it.state == DownloadQueueItemState.Complete &&
                    !it.savedUri.isNullOrBlank()
            }
            .map(DownloadQueueItem::id)

        var deleted = 0
        completedIds.forEach { itemId ->
            if (removeDownloadedFile(context, itemId)) {
                deleted += 1
            }
        }
        return deleted
    }

    fun redownload(
        context: Context,
        itemId: String
    ): DownloadEnqueueResult? {
        val item = DownloadQueueStore.item(itemId) ?: return null
        val execution =
            NativeDownloadRoutingPolicy.resolve(item)
                ?: return null

        item.savedUri?.let {
            removeDownloadedFile(context, itemId)
        }

        // If the file was already missing, remove the completed queue record anyway
        // so duplicate prevention allows a fresh request.
        DownloadQueueStore.remove(itemId)

        return when (execution) {
            is QueuedDownloadRequest.Legacy ->
                FrxeDownloadService.enqueue(
                    context,
                    execution.request
                )

            is QueuedDownloadRequest.Native ->
                FrxeDownloadService.enqueue(
                    context,
                    execution.request
                )
        }
    }
}
