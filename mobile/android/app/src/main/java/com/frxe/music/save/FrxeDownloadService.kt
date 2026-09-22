package com.frxe.music.save

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.IBinder
import android.os.PowerManager
import com.frxe.music.R
import com.frxe.music.source.YouTubeChallengeHandler
import com.frxe.music.ytdlp.YtDlpDownloadRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class FrxeDownloadService : Service() {

    private val serviceScope = CoroutineScope(
        SupervisorJob() + Dispatchers.IO
    )

    private lateinit var legacyPipeline: DownloadPipeline
    private lateinit var nativePipeline: YtDlpNativeDownloadPipeline

    private var processorJob: Job? = null
    private var itemJob: Job? = null
    private var activeItemId: String? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        DownloadQueueStore.initialize(this)
        legacyPipeline = DownloadPipeline(applicationContext)
        nativePipeline = YtDlpNativeDownloadPipeline(applicationContext)
        createNotificationChannel()
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int
    ): Int {
        when (intent?.action) {
            ACTION_PAUSE_ITEM -> {
                intent.getStringExtra(EXTRA_ITEM_ID)?.let(::pauseItemInternal)
            }

            ACTION_CANCEL_ITEM -> {
                intent.getStringExtra(EXTRA_ITEM_ID)?.let(::cancelItemInternal)
            }

            ACTION_PAUSE_ALL -> {
                pauseAllInternal()
            }

            ACTION_KICK,
            null -> ensureProcessor()
        }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        val runningId = activeItemId
        if (runningId != null && DownloadQueueStore.item(runningId)?.state == DownloadQueueItemState.Running) {
            DownloadQueueStore.recoverInterrupted(runningId)
        }

        cancelPipelineFor(runningId)
        itemJob?.cancel()
        processorJob?.cancel()
        releaseWakeLock()
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onTimeout(startId: Int, fgsType: Int) {
        activeItemId?.let { id ->
            if (DownloadQueueStore.item(id)?.state == DownloadQueueItemState.Running) {
                DownloadQueueStore.fail(
                    id,
                    "Android paused this long-running download. Open Vitr to retry."
                )
            }
        }
        cancelPipelineFor(activeItemId)
        itemJob?.cancel()
        processorJob?.cancel()
        releaseWakeLock()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf(startId)
    }

    private fun ensureProcessor() {
        if (processorJob?.isActive == true) return

        if (!DownloadQueueStore.hasRunnableWork()) {
            stopSelf()
            return
        }

        startForeground(
            NOTIFICATION_ID,
            buildNotification(
                item = DownloadQueueStore.nextRunnable(),
                message = "Preparing download queue",
                progress = 0f,
                running = true
            )
        )

        processorJob = serviceScope.launch {
            processQueue()
        }
    }

    private suspend fun processQueue() {
        try {
            while (serviceScope.isActive) {
                if (!DownloadQueueStore.hasRunnableWork()) break

                if (DownloadQueueStore.wifiOnly.value && !isWifiConnected()) {
                    releaseWakeLock()
                    notifyQueue(
                        item = DownloadQueueStore.nextRunnable(),
                        message = "Waiting for Wi-Fi",
                        progress = 0f,
                        running = true
                    )
                    delay(WIFI_RECHECK_MS)
                    continue
                }

                val item = DownloadQueueStore.nextRunnable() ?: break
                activeItemId = item.id
                DownloadQueueStore.markRunning(item.id)
                acquireWakeLock()

                notifyQueue(
                    item = DownloadQueueStore.item(item.id),
                    message = "Preparing ${item.title}",
                    progress = 0f,
                    running = true
                )

                itemJob = serviceScope.launch {
                    runItem(item.id)
                }
                itemJob?.join()
                itemJob = null
                activeItemId = null
                releaseWakeLock()
            }
        } finally {
            processorJob = null
            itemJob = null
            activeItemId = null
            releaseWakeLock()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    private suspend fun runItem(itemId: String) {
        val item = DownloadQueueStore.item(itemId) ?: return

        val execution =
            NativeDownloadRoutingPolicy.resolve(item)
                ?: run {
                    DownloadQueueStore.fail(
                        itemId,
                        "Invalid queued download request"
                    )
                    notifyQueue(
                        item = DownloadQueueStore.item(itemId),
                        message = "Download request is unavailable. Remove it and add it again.",
                        progress = 0f,
                        running = false
                    )
                    return
                }

        try {
            val onState: (SaveUiState) -> Unit = { state ->
                DownloadQueueStore.updateProgress(itemId, state)
                val current = DownloadQueueStore.item(itemId)
                notifyQueue(
                    item = current,
                    message = state.message,
                    progress = state.progress,
                    running = current?.state == DownloadQueueItemState.Running
                )
            }

            val result =
                when (execution) {
                    is QueuedDownloadRequest.Legacy ->
                        legacyPipeline.save(
                            execution.request,
                            onState
                        )

                    is QueuedDownloadRequest.Native ->
                        nativePipeline.save(
                            request = execution.request,
                            queueItemId = itemId,
                            onState = onState
                        )
                }

            val currentState = DownloadQueueStore.item(itemId)?.state
            if (currentState != DownloadQueueItemState.Cancelled) {
                DownloadQueueStore.complete(itemId, result)
                notifyQueue(
                    item = DownloadQueueStore.item(itemId),
                    message = "Saved to Music/Vitr",
                    progress = 1f,
                    running = false
                )
            }
        } catch (_: CancellationException) {
            // Pause/cancel actions update persistent state before cancelling this job.
        } catch (error: Throwable) {
            val current = DownloadQueueStore.item(itemId) ?: return
            if (current.state in setOf(
                    DownloadQueueItemState.Paused,
                    DownloadQueueItemState.Cancelled
                )
            ) {
                return
            }

            val challenge = YouTubeChallengeHandler.classify(error)
            val message = challenge?.message
                ?: error.message
                    ?.lineSequence()
                    ?.firstOrNull()
                    ?.take(180)
                    ?.takeIf(String::isNotBlank)
                ?: "Download failed"

            DownloadQueueStore.fail(itemId, message)
            val failed = DownloadQueueStore.item(itemId)

            if (challenge == null && failed != null && DownloadQueuePolicy.canAutoRetry(failed)) {
                val nextRetry = failed.retryCount + 1
                notifyQueue(
                    item = failed,
                    message = "Retrying ($nextRetry/${DownloadQueuePolicy.MAX_AUTO_RETRIES})…",
                    progress = 0f,
                    running = true
                )
                delay(900L * nextRetry)

                if (DownloadQueueStore.item(itemId)?.state == DownloadQueueItemState.Failed) {
                    DownloadQueueStore.requeueAfterFailure(
                        itemId,
                        "Queued for retry $nextRetry/${DownloadQueuePolicy.MAX_AUTO_RETRIES}"
                    )
                }
            } else {
                notifyQueue(
                    item = DownloadQueueStore.item(itemId),
                    message = message,
                    progress = 0f,
                    running = false
                )
            }
        }
    }

    private fun pauseItemInternal(id: String) {
        DownloadQueueStore.pause(id)
        if (activeItemId == id) {
            cancelPipelineFor(id)
            itemJob?.cancel(CancellationException("Download paused"))
        }
        ensureProcessor()
    }

    private fun cancelItemInternal(id: String) {
        DownloadQueueStore.cancel(id)
        if (activeItemId == id) {
            cancelPipelineFor(id)
            itemJob?.cancel(CancellationException("Download cancelled"))
        }
        ensureProcessor()
    }

    private fun pauseAllInternal() {
        val runningId = activeItemId
        DownloadQueueStore.pauseAll()
        cancelPipelineFor(runningId)
        itemJob?.cancel(CancellationException("Download queue paused"))
    }

    private fun cancelPipelineFor(itemId: String?) {
        val item = itemId?.let(DownloadQueueStore::item)

        when (item?.executionKind) {
            DownloadExecutionKind.YtDlp ->
                nativePipeline.cancel(itemId)

            DownloadExecutionKind.Legacy,
            null ->
                legacyPipeline.cancel()
        }
    }

    private fun isWifiConnected(): Boolean {
        val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "Vitr:DownloadQueue"
        ).apply {
            setReferenceCounted(false)
            acquire(6 * 60 * 60 * 1000L)
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.takeIf { it.isHeld }?.release()
        wakeLock = null
    }

    private fun createNotificationChannel() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Vitr downloads",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Background music download queue and conversion"
            }
        )
    }

    private fun notifyQueue(
        item: DownloadQueueItem?,
        message: String,
        progress: Float,
        running: Boolean
    ) {
        getSystemService(NotificationManager::class.java).notify(
            NOTIFICATION_ID,
            buildNotification(item, message, progress, running)
        )
    }

    private fun buildNotification(
        item: DownloadQueueItem?,
        message: String,
        progress: Float,
        running: Boolean
    ): Notification {
        val items = DownloadQueueStore.items.value
            .filter {
                it.state !in setOf(
                    DownloadQueueItemState.Cancelled,
                    DownloadQueueItemState.Complete
                )
            }
            .sortedBy { it.createdAtMs }

        val position = item?.let { current ->
            items.indexOfFirst { it.id == current.id }
                .takeIf { it >= 0 }
                ?.plus(1)
        }
        val queueSuffix = if (position != null && items.isNotEmpty()) {
            " · $position of ${items.size}"
        } else {
            ""
        }

        val launchIntent =
            packageManager.getLaunchIntentForPackage(packageName)
                ?.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                ?: Intent()

        val openAppIntent = PendingIntent.getActivity(
            this,
            OPEN_REQUEST_CODE,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(
                item?.title
                    ?.takeIf(String::isNotBlank)
                    ?.let { "Downloading $it$queueSuffix" }
                    ?: "Vitr downloads"
            )
            .setContentText(
                DownloadUiPrivacyPolicy.sanitize(message)
            )
            .setContentIntent(openAppIntent)
            .setOnlyAlertOnce(true)
            .setOngoing(running)
            .setProgress(
                100,
                (progress.coerceIn(0f, 1f) * 100f).toInt(),
                running && progress <= 0.01f
            )

        item?.takeIf { it.state == DownloadQueueItemState.Running }?.let { current ->
            builder.addAction(
                Notification.Action.Builder(
                    null,
                    "Pause",
                    itemActionPendingIntent(
                        ACTION_PAUSE_ITEM,
                        current.id,
                        PAUSE_REQUEST_BASE
                    )
                ).build()
            )
            builder.addAction(
                Notification.Action.Builder(
                    null,
                    "Cancel",
                    itemActionPendingIntent(
                        ACTION_CANCEL_ITEM,
                        current.id,
                        CANCEL_REQUEST_BASE
                    )
                ).build()
            )
        }

        return builder.build()
    }

    private fun itemActionPendingIntent(
        action: String,
        itemId: String,
        requestBase: Int
    ): PendingIntent = PendingIntent.getService(
        this,
        requestBase + (itemId.hashCode() and 0x7fff),
        Intent(this, FrxeDownloadService::class.java)
            .setAction(action)
            .putExtra(EXTRA_ITEM_ID, itemId),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    companion object {
        private const val CHANNEL_ID = "frxe_downloads"
        private const val NOTIFICATION_ID = 6101
        private const val OPEN_REQUEST_CODE = 6102
        private const val PAUSE_REQUEST_BASE = 6200
        private const val CANCEL_REQUEST_BASE = 7200
        private const val WIFI_RECHECK_MS = 15_000L

        private const val ACTION_KICK = "com.frxe.music.action.DOWNLOAD_QUEUE_KICK"
        private const val ACTION_PAUSE_ITEM = "com.frxe.music.action.PAUSE_DOWNLOAD_ITEM"
        private const val ACTION_CANCEL_ITEM = "com.frxe.music.action.CANCEL_DOWNLOAD_ITEM"
        private const val ACTION_PAUSE_ALL = "com.frxe.music.action.PAUSE_DOWNLOAD_QUEUE"
        private const val EXTRA_ITEM_ID = "download_item_id"

        fun enqueue(context: Context, request: SaveRequest): DownloadEnqueueResult {
            DownloadQueueStore.initialize(context)
            val result = DownloadQueueStore.enqueue(request)
            if (result.item.state == DownloadQueueItemState.Queued) {
                kick(context)
            }
            return result
        }

        fun enqueue(
            context: Context,
            request: YtDlpDownloadRequest
        ): DownloadEnqueueResult {
            DownloadQueueStore.initialize(context)
            val result = DownloadQueueStore.enqueueNative(request)
            if (result.item.state == DownloadQueueItemState.Queued) {
                kick(context)
            }
            return result
        }

        fun kick(context: Context) {
            DownloadQueueStore.initialize(context)
            if (!DownloadQueueStore.hasRunnableWork()) return

            context.startForegroundService(
                Intent(context, FrxeDownloadService::class.java)
                    .setAction(ACTION_KICK)
            )
        }

        fun pause(context: Context, itemId: String) {
            DownloadQueueStore.pause(itemId)
            context.startService(
                Intent(context, FrxeDownloadService::class.java)
                    .setAction(ACTION_PAUSE_ITEM)
                    .putExtra(EXTRA_ITEM_ID, itemId)
            )
        }

        fun resume(context: Context, itemId: String) {
            DownloadQueueStore.resume(itemId)
            kick(context)
        }

        fun retry(context: Context, itemId: String) {
            DownloadQueueStore.retry(itemId)
            kick(context)
        }

        fun retryAllFailed(context: Context) {
            DownloadQueueStore.initialize(context)
            DownloadQueueStore.retryAllFailed()
            kick(context)
        }

        fun cancel(context: Context, itemId: String) {
            DownloadQueueStore.cancel(itemId)
            context.startService(
                Intent(context, FrxeDownloadService::class.java)
                    .setAction(ACTION_CANCEL_ITEM)
                    .putExtra(EXTRA_ITEM_ID, itemId)
            )
        }

        fun remove(itemId: String) {
            DownloadQueueStore.remove(itemId)
        }

        fun clearFailedAndCancelled(context: Context) {
            DownloadQueueStore.initialize(context)
            DownloadQueueStore.clearFailedAndCancelled()
        }

        fun pauseAll(context: Context) {
            DownloadQueueStore.pauseAll()
            context.startService(
                Intent(context, FrxeDownloadService::class.java)
                    .setAction(ACTION_PAUSE_ALL)
            )
        }

        fun resumeAll(context: Context) {
            DownloadQueueStore.resumeAll()
            kick(context)
        }

        fun setWifiOnly(context: Context, enabled: Boolean) {
            DownloadQueueStore.setWifiOnly(enabled)
            if (!enabled) kick(context)
        }
    }
}
