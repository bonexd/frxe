package com.frxe.music.save

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import com.frxe.music.source.DownloadedTrackRegistry
import com.frxe.music.ytdlp.YtDlpDownloadRequest
import com.frxe.music.ytdlp.YtDlpDownloadRequestCodec
import java.io.File
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

data class DownloadEnqueueResult(
    val item: DownloadQueueItem,
    val duplicate: Boolean
)

object DownloadQueueStore {
    private const val PREFS = "frxe_download_queue"
    private const val KEY_ITEMS = "items_v1"
    private const val KEY_WIFI_ONLY = "wifi_only"
    private const val MAX_PERSISTED_ITEMS = 200

    private val lock = Any()

    @Volatile
    private var initialized = false

    private lateinit var preferences: SharedPreferences

    private val _items = MutableStateFlow<List<DownloadQueueItem>>(emptyList())
    val items = _items.asStateFlow()

    private val _wifiOnly = MutableStateFlow(false)
    val wifiOnly = _wifiOnly.asStateFlow()

    fun initialize(context: Context) {
        if (initialized) return

        synchronized(lock) {
            if (initialized) return

            val appContext = context.applicationContext
            DownloadedTrackRegistry.initialize(appContext)

            preferences = appContext.getSharedPreferences(
                PREFS,
                Context.MODE_PRIVATE
            )

            val restored = DownloadQueueItemCodec.decode(
                preferences.getString(KEY_ITEMS, null)
            )
            val now = System.currentTimeMillis()

            val recovered = DownloadQueuePolicy.recoverAfterRestart(
                restored,
                now
            )
            val reconciled = DownloadQueuePolicy.reconcileCompletedDownloads(
                recovered,
                now
            ) { savedUri ->
                savedUriExists(appContext, savedUri)
            }

            reconciled
                .asSequence()
                .filter { item ->
                    item.state == DownloadQueueItemState.Complete &&
                        !item.savedUri.isNullOrBlank()
                }
                .forEach { item ->
                    DownloadedTrackRegistry.register(
                        sourceUrl = item.sourceUrl,
                        localUri = item.savedUri
                    )
                }

            _items.value = reconciled
            _wifiOnly.value = preferences.getBoolean(KEY_WIFI_ONLY, false)
            persistLocked(reconciled)
            initialized = true
        }
    }

    fun enqueue(request: SaveRequest): DownloadEnqueueResult = synchronized(lock) {
        ensureInitialized()

        val existing = DownloadQueuePolicy.findDuplicate(
            _items.value,
            request.sourceUrl,
            request.format.name,
            request.quality.name
        )

        if (existing != null) {
            return@synchronized DownloadEnqueueResult(
                item = existing,
                duplicate = true
            )
        }

        val now = System.currentTimeMillis()
        val item = DownloadQueueItem(
            id = UUID.randomUUID().toString(),
            sourceUrl = request.sourceUrl,
            title = request.title,
            artist = request.artist,
            format = request.format.name,
            quality = request.quality.name,
            executionKind = DownloadExecutionKind.Legacy,
            state = DownloadQueueItemState.Queued,
            progress = 0f,
            message = "Queued",
            createdAtMs = now,
            updatedAtMs = now
        )

        replaceLocked(_items.value + item)
        DownloadEnqueueResult(item, duplicate = false)
    }

    fun enqueueNative(
        request: YtDlpDownloadRequest
    ): DownloadEnqueueResult = synchronized(lock) {
        ensureInitialized()

        val existing = DownloadQueuePolicy.findDuplicate(
            _items.value,
            request.sourceUrl,
            request.outputFormat.name,
            request.quality.name
        )

        if (existing != null) {
            return@synchronized DownloadEnqueueResult(
                item = existing,
                duplicate = true
            )
        }

        val now = System.currentTimeMillis()
        val item = DownloadQueueItem(
            id = UUID.randomUUID().toString(),
            sourceUrl = request.sourceUrl,
            title = request.title,
            artist = request.artist,
            format = request.outputFormat.name,
            quality = request.quality.name,
            executionKind = DownloadExecutionKind.YtDlp,
            engineRequestJson = YtDlpDownloadRequestCodec.encode(request),
            state = DownloadQueueItemState.Queued,
            progress = 0f,
            message = "Queued",
            createdAtMs = now,
            updatedAtMs = now
        )

        replaceLocked(_items.value + item)
        DownloadEnqueueResult(item, duplicate = false)
    }

    fun item(id: String): DownloadQueueItem? = synchronized(lock) {
        _items.value.firstOrNull { it.id == id }
    }

    fun registerSyncedDownload(
        title: String,
        artist: String,
        format: String,
        quality: String,
        sourceUrl: String,
        savedUri: String
    ): DownloadQueueItem = synchronized(lock) {
        ensureInitialized()

        val normalizedFormat =
            format.trim()
                .takeIf(String::isNotEmpty)
                ?: SaveFormat.MP3.name

        val normalizedQuality =
            quality.trim()
                .takeIf(String::isNotEmpty)
                ?: "Synced"

        val normalizedSource =
            sourceUrl.trim()
                .takeIf(String::isNotEmpty)
                ?: "vitr-sync://" + UUID.randomUUID()

        val existing =
            _items.value.firstOrNull { item ->
                item.state == DownloadQueueItemState.Complete &&
                    item.savedUri == savedUri
            }

        if (existing != null) {
            return@synchronized existing
        }

        val now = System.currentTimeMillis()
        val item = DownloadQueueItem(
            id = UUID.randomUUID().toString(),
            sourceUrl = normalizedSource,
            title = title.ifBlank { "Synced track" },
            artist = artist.ifBlank { "Unknown artist" },
            format = normalizedFormat,
            quality = normalizedQuality,
            state = DownloadQueueItemState.Complete,
            progress = 1f,
            message = "Synced to Music/Vitr",
            backend = "Device Sync",
            savedUri = savedUri,
            savedTitle = title.ifBlank { "Synced track" },
            createdAtMs = now,
            updatedAtMs = now
        )

        replaceLocked(_items.value + item)

        DownloadedTrackRegistry.register(
            sourceUrl = normalizedSource,
            localUri = savedUri
        )

        item
    }

    fun nextRunnable(): DownloadQueueItem? = synchronized(lock) {
        DownloadQueuePolicy.nextRunnable(_items.value)
    }

    fun active(): DownloadQueueItem? = synchronized(lock) {
        _items.value.firstOrNull { it.state == DownloadQueueItemState.Running }
    }

    fun markRunning(id: String) {
        updateItem(id) { item ->
            item.copy(
                state = DownloadQueueItemState.Running,
                progress = 0f,
                message = "Preparing download",
                backend = null,
                updatedAtMs = System.currentTimeMillis()
            )
        }
    }

    fun updateProgress(id: String, state: SaveUiState) {
        updateItem(id) { item ->
            if (item.state != DownloadQueueItemState.Running) {
                item
            } else {
                item.copy(
                    progress = state.progress.coerceIn(0f, 1f),
                    message = state.message,
                    backend = state.backend?.label,
                    updatedAtMs = System.currentTimeMillis()
                )
            }
        }
    }

    fun complete(id: String, result: SaveResult) {
        var sourceUrl: String? = null

        updateItem(id) { item ->
            sourceUrl = item.sourceUrl
            item.copy(
                state = DownloadQueueItemState.Complete,
                progress = 1f,
                message = "Saved to Music/Vitr",
                savedUri = result.uri,
                savedTitle = result.title,
                updatedAtMs = System.currentTimeMillis()
            )
        }

        DownloadedTrackRegistry.register(
            sourceUrl = sourceUrl,
            localUri = result.uri
        )
    }

    fun fail(id: String, message: String) {
        updateItem(id) { item ->
            item.copy(
                state = DownloadQueueItemState.Failed,
                progress = 0f,
                message = message.ifBlank { "Download failed" },
                updatedAtMs = System.currentTimeMillis()
            )
        }
    }

    fun requeueAfterFailure(id: String, message: String) {
        updateItem(id) { item ->
            item.copy(
                state = DownloadQueueItemState.Queued,
                progress = 0f,
                message = message,
                backend = null,
                retryCount = item.retryCount + 1,
                updatedAtMs = System.currentTimeMillis()
            )
        }
    }

    fun recoverInterrupted(id: String) {
        updateItem(id) { item ->
            if (item.state == DownloadQueueItemState.Running) {
                item.copy(
                    state = DownloadQueueItemState.Queued,
                    progress = 0f,
                    message = "Recovered after interruption",
                    backend = null,
                    updatedAtMs = System.currentTimeMillis()
                )
            } else {
                item
            }
        }
    }

    fun pause(id: String) {
        updateItem(id) { item ->
            DownloadQueuePolicy.pause(
                item,
                System.currentTimeMillis()
            )
        }
    }

    fun resume(id: String) {
        updateItem(id) { item ->
            DownloadQueuePolicy.resume(
                item,
                System.currentTimeMillis()
            )
        }
    }

    fun retry(id: String) {
        updateItem(id) { item ->
            if (item.state == DownloadQueueItemState.Failed) {
                DownloadQueuePolicy.resume(
                    item.copy(retryCount = 0),
                    System.currentTimeMillis()
                )
            } else {
                item
            }
        }
    }

    fun retryAllFailed() = synchronized(lock) {
        ensureInitialized()
        replaceLocked(
            DownloadQueuePolicy.retryAllFailed(
                _items.value,
                System.currentTimeMillis()
            )
        )
    }

    fun cancel(id: String) {
        updateItem(id) { item ->
            if (item.state == DownloadQueueItemState.Complete) {
                item
            } else {
                item.copy(
                    state = DownloadQueueItemState.Cancelled,
                    progress = 0f,
                    message = "Cancelled",
                    backend = null,
                    updatedAtMs = System.currentTimeMillis()
                )
            }
        }
    }

    fun remove(id: String) = synchronized(lock) {
        ensureInitialized()
        val item = _items.value.firstOrNull { it.id == id } ?: return@synchronized
        if (item.state == DownloadQueueItemState.Running) return@synchronized
        replaceLocked(_items.value.filterNot { it.id == id })
    }

    fun clearFailedAndCancelled() = synchronized(lock) {
        ensureInitialized()
        replaceLocked(
            DownloadQueuePolicy.clearFailedAndCancelled(_items.value)
        )
    }

    fun pauseAll() = synchronized(lock) {
        ensureInitialized()
        val now = System.currentTimeMillis()
        replaceLocked(
            _items.value.map { item ->
                when (item.state) {
                    DownloadQueueItemState.Queued,
                    DownloadQueueItemState.Running ->
                        DownloadQueuePolicy.pause(item, now)

                    else -> item
                }
            }
        )
    }

    fun resumeAll() = synchronized(lock) {
        ensureInitialized()
        val now = System.currentTimeMillis()
        replaceLocked(
            _items.value.map { item ->
                if (item.state == DownloadQueueItemState.Paused) {
                    DownloadQueuePolicy.resume(item, now)
                } else {
                    item
                }
            }
        )
    }

    fun hasRunnableWork(): Boolean = synchronized(lock) {
        _items.value.any { it.state == DownloadQueueItemState.Queued }
    }

    fun hasUnfinishedWork(): Boolean = synchronized(lock) {
        _items.value.any {
            it.state in setOf(
                DownloadQueueItemState.Queued,
                DownloadQueueItemState.Running,
                DownloadQueueItemState.Paused
            )
        }
    }

    fun isDownloaded(sourceUrl: String): Boolean = synchronized(lock) {
        DownloadQueuePolicy.isDownloaded(_items.value, sourceUrl)
    }

    fun reset(
        context: Context,
        deleteDownloadedFiles: Boolean = true
    ) = synchronized(lock) {
        ensureInitialized()

        if (deleteDownloadedFiles) {
            _items.value
                .mapNotNull { it.savedUri }
                .distinct()
                .forEach { rawUri ->
                    deleteSavedUri(context.applicationContext, rawUri)
                }
        }

        _items.value = emptyList()
        _wifiOnly.value = false
        preferences.edit().clear().apply()

        context.applicationContext
            .deleteSharedPreferences("vitr_downloaded_track_sources")
    }

    fun setWifiOnly(enabled: Boolean) = synchronized(lock) {
        ensureInitialized()
        _wifiOnly.value = enabled
        preferences.edit().putBoolean(KEY_WIFI_ONLY, enabled).apply()
    }

    private fun updateItem(
        id: String,
        transform: (DownloadQueueItem) -> DownloadQueueItem
    ) = synchronized(lock) {
        ensureInitialized()
        var changed = false
        val updated = _items.value.map { item ->
            if (item.id == id) {
                val next = transform(item)
                changed = changed || next != item
                next
            } else {
                item
            }
        }
        if (changed) replaceLocked(updated)
    }

    private fun replaceLocked(items: List<DownloadQueueItem>) {
        val bounded = if (items.size <= MAX_PERSISTED_ITEMS) {
            items
        } else {
            val protected = items.filter {
                it.state in setOf(
                    DownloadQueueItemState.Queued,
                    DownloadQueueItemState.Running,
                    DownloadQueueItemState.Paused
                )
            }
            val history = items.filterNot { it in protected }
                .takeLast((MAX_PERSISTED_ITEMS - protected.size).coerceAtLeast(0))
            (history + protected).sortedBy { it.createdAtMs }
        }

        _items.value = bounded
        persistLocked(bounded)
    }

    private fun persistLocked(items: List<DownloadQueueItem>) {
        if (!::preferences.isInitialized) return

        preferences.edit()
            .putString(KEY_ITEMS, DownloadQueueItemCodec.encode(items))
            .apply()
    }

    private fun deleteSavedUri(context: Context, rawUri: String) {
        runCatching {
            val uri = Uri.parse(rawUri)
            when (uri.scheme?.lowercase()) {
                "content" -> context.contentResolver.delete(uri, null, null)
                "file" -> uri.path?.let(::File)?.delete()
            }
        }
    }

    private fun savedUriExists(context: Context, rawUri: String): Boolean = runCatching {
        val uri = Uri.parse(rawUri)
        when (uri.scheme?.lowercase()) {
            "content" -> context.contentResolver
                .openAssetFileDescriptor(uri, "r")
                ?.use { true }
                ?: false

            "file" -> uri.path
                ?.let(::File)
                ?.let { it.isFile && it.length() > 0L }
                ?: false

            else -> false
        }
    }.getOrDefault(false)

    private fun ensureInitialized() {
        check(initialized) {
            "DownloadQueueStore.initialize(context) must be called before use."
        }
    }
}
