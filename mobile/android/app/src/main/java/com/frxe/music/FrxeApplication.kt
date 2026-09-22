package com.frxe.music

import android.app.Application
import com.frxe.music.downloads.DownloadSupport
import com.frxe.music.playback.PlaybackPrefetcher
import com.frxe.music.playback.PlaybackQueueStore
import com.frxe.music.save.DownloadQueueStore
import com.frxe.music.source.DownloadedTrackRegistry
import com.frxe.music.source.FrxeNewPipeRuntime
import com.frxe.music.source.ResolverDiagnosticsStore
import com.frxe.music.source.YouTubeAudioResolverRuntime
import com.frxe.music.updates.RuntimeHealthStore
import com.frxe.music.ui.MobileUiPreferences
import com.frxe.music.ui.SearchHistoryStore
import com.frxe.music.updates.YtDlpRuntimeUpdater
import com.frxe.music.ytdlp.YtDlpCore

class FrxeApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        FrxeNewPipeRuntime.initialize()
        ResolverDiagnosticsStore.initialize(this)
        DownloadedTrackRegistry.initialize(this)
        RuntimeHealthStore.initialize(this)
        MobileUiPreferences.initialize(this)
        SearchHistoryStore.initialize(this)
        YtDlpCore.initialize(this)
        YouTubeAudioResolverRuntime.initialize(this)
        YtDlpRuntimeUpdater.initializeAndSchedule(this)

        DownloadSupport.initialize(this)
        DownloadQueueStore.initialize(this)
        PlaybackQueueStore.initialize(this)
        PlaybackPrefetcher.initialize()
    }
}
