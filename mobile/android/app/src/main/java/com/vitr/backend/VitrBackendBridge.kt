package com.bloodvitr.vitr.backend

import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.frxe.music.data.FrxeDatabase
import com.frxe.music.data.TrackEntity
import com.frxe.music.lyrics.LyricsRepository
import com.frxe.music.model.Track
import com.frxe.music.playback.FrxePlaybackService
import com.frxe.music.playback.PlaybackQueueStore
import com.frxe.music.playback.QueueRepeatMode
import com.frxe.music.save.FrxeDownloadService
import com.frxe.music.save.SaveFormat
import com.frxe.music.save.defaultQualityFor
import com.frxe.music.source.PlaybackStreamResolver
import com.frxe.music.source.YouTubeCatalogSource
import com.frxe.music.updates.FrxeUpdateRepository
import com.frxe.music.updates.RuntimeHealthStore
import com.frxe.music.updates.UpdateCheckResult
import com.frxe.music.updates.YtDlpRuntimeUpdater
import com.frxe.music.ytdlp.YtDlpDownloadRequest
import java.util.concurrent.Executor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class VitrBackendBridge(
    private val activity: android.app.Activity,
    private val webView: WebView
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val source = YouTubeCatalogSource(activity.application)
    private val dao = FrxeDatabase.get(activity.applicationContext).libraryDao()
    private val lyricsRepository = LyricsRepository()
    private var controller: MediaController? = null

    private val controllerFuture =
        MediaController.Builder(
            activity,
            SessionToken(
                activity,
                ComponentName(
                    activity,
                    FrxePlaybackService::class.java
                )
            )
        ).buildAsync()

    private val mainExecutor = Executor { command ->
        Handler(Looper.getMainLooper()).post(command)
    }

    private val playerListener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) {
            emitPlayerState()
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            emitPlayerState()
        }

        override fun onMediaItemTransition(mediaItem: androidx.media3.common.MediaItem?, reason: Int) {
            emitPlayerState()
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            emitPlayerState()
        }
    }

    init {
        controllerFuture.addListener(
            {
                controller = runCatching { controllerFuture.get() }
                    .getOrNull()
                    ?.also { it.addListener(playerListener) }
                emitPlayerState()
            },
            mainExecutor
        )
    }

    @JavascriptInterface
    fun search(query: String, requestId: String) {
        scope.launch {
            try {
                val tracks = withContext(Dispatchers.IO) { source.search(query) }
                reply(requestId, true, tracksJson(tracks))
            } catch (error: Throwable) {
                replyError(requestId, error)
            }
        }
    }


    @JavascriptInterface
    fun discover(query: String, entityType: String, requestId: String) {
        scope.launch {
            try {
                val clean = query.trim().ifBlank { "music" }
                val requestedType = entityType.trim().lowercase().ifBlank { "all" }
                val primaryQuery = when (requestedType) {
                    "artist" -> "$clean artist"
                    "album" -> "$clean album"
                    "playlist" -> "$clean playlist"
                    "genre" -> "$clean music"
                    "track" -> "$clean song"
                    else -> clean
                }

                val results = withContext(Dispatchers.IO) {
                    listOf(
                        source.search(primaryQuery),
                        source.search("$clean artist"),
                        source.search("$clean album"),
                        source.search("$clean playlist")
                    )
                }
                val tracks = results.getOrElse(0) { emptyList() }
                val artistHits = results.getOrElse(1) { emptyList() }
                val albumHits = results.getOrElse(2) { emptyList() }
                val playlistHits = results.getOrElse(3) { emptyList() }

                val artists = JSONArray()
                (tracks + artistHits)
                    .filter { it.artist.isNotBlank() }
                    .distinctBy { it.artist.lowercase() }
                    .take(16)
                    .forEach { track ->
                        artists.put(
                            catalogItemJson(
                                id = "artist:${track.artist.lowercase().hashCode()}",
                                kind = "artist",
                                title = track.artist,
                                subtitle = "Artist",
                                cover = track.artworkUrl,
                                searchQuery = track.artist,
                                source = "track_metadata",
                                confidence = 0.78
                            )
                        )
                    }

                val albums = JSONArray()
                albumHits
                    .distinctBy { "${it.title.lowercase()}|${it.artist.lowercase()}" }
                    .take(16)
                    .forEach { track ->
                        albums.put(
                            catalogItemJson(
                                id = "album:${track.id}",
                                kind = "album",
                                title = track.title,
                                subtitle = listOf("Album", track.artist)
                                    .filter(String::isNotBlank)
                                    .joinToString(" · "),
                                cover = track.artworkUrl,
                                searchQuery = "${track.title} ${track.artist}".trim(),
                                source = "query_inference",
                                confidence = 0.62
                            )
                        )
                    }

                val playlists = JSONArray()
                playlistHits
                    .distinctBy { "${it.title.lowercase()}|${it.artist.lowercase()}" }
                    .take(16)
                    .forEach { track ->
                        playlists.put(
                            catalogItemJson(
                                id = "playlist:${track.id}",
                                kind = "playlist",
                                title = track.title,
                                subtitle = listOf("Playlist", track.artist)
                                    .filter(String::isNotBlank)
                                    .joinToString(" · "),
                                cover = track.artworkUrl,
                                searchQuery = "${track.title} playlist".trim(),
                                source = "query_inference",
                                confidence = 0.62
                            )
                        )
                    }

                val genres = JSONArray()
                genreSuggestions(clean)
                    .forEach { genre ->
                        genres.put(
                            catalogItemJson(
                                id = "genre:${genre.lowercase().replace(" ", "-")}",
                                kind = "genre",
                                title = genre,
                                subtitle = "Genre",
                                cover = null,
                                searchQuery = "$genre music",
                                source = "vitr_genre_index",
                                confidence = 0.92
                            )
                        )
                    }

                reply(
                    requestId,
                    true,
                    JSONObject()
                        .put("tracks", tracksJson(tracks))
                        .put("items", mergeCatalogItems(artists, albums, playlists, genres))
                        .put("artists", artists)
                        .put("albums", albums)
                        .put("playlists", playlists)
                        .put("genres", genres)
                )
            } catch (error: Throwable) {
                replyError(requestId, error)
            }
        }
    }

    @JavascriptInterface
    fun download(trackJson: String, formatName: String, requestId: String) {
        scope.launch {
            try {
                val track = parseTrack(JSONObject(trackJson))
                val format = when (formatName.trim().lowercase()) {
                    "m4a" -> SaveFormat.M4A
                    "mp3" -> SaveFormat.MP3
                    "flac" -> SaveFormat.FLAC
                    "wav" -> SaveFormat.WAV
                    else -> throw IllegalArgumentException("Unsupported audio format")
                }
                val sourceUrl = track.downloadUrl
                    ?: PlaybackStreamResolver.youtubeWatchUrl(track.streamUrl)
                    ?: track.id.removePrefix("yt-")
                        .takeIf { it.length == 11 }
                        ?.let(PlaybackStreamResolver::youtubeWatchUrlFromId)
                    ?: throw IllegalStateException("This track has no downloadable source.")

                val result = FrxeDownloadService.enqueue(
                    activity,
                    YtDlpDownloadRequest(
                        sourceUrl = sourceUrl,
                        title = track.title,
                        artist = track.artist,
                        outputFormat = format,
                        quality = defaultQualityFor(format),
                        thumbnailUrl = track.artworkUrl,
                        album = track.album
                    )
                )
                reply(
                    requestId,
                    true,
                    JSONObject()
                        .put("queueId", result.item.id)
                        .put("duplicate", result.duplicate)
                        .put("format", format.extension)
                )
            } catch (error: Throwable) {
                replyError(requestId, error)
            }
        }
    }

    @JavascriptInterface
    fun runtimeStatus(requestId: String) {
        val state = RuntimeHealthStore.state.value
        reply(
            requestId,
            true,
            JSONObject()
                .put("ytDlpVersion", state.ytDlpVersion ?: JSONObject.NULL)
                .put("lastStatus", state.ytDlpUpdateStatus)
                .put("lastError", state.ytDlpInitStatus)
        )
    }

    @JavascriptInterface
    fun updateRuntime(requestId: String) {
        scope.launch {
            try {
                val state = YtDlpRuntimeUpdater.updateNow(activity.applicationContext)
                reply(
                    requestId,
                    true,
                    JSONObject()
                        .put("ytDlpVersion", state.ytDlpVersion ?: JSONObject.NULL)
                        .put("lastStatus", state.ytDlpUpdateStatus)
                        .put("lastError", state.ytDlpInitStatus)
                )
            } catch (error: Throwable) {
                replyError(requestId, error)
            }
        }
    }

    @JavascriptInterface
    fun checkClientUpdate(requestId: String) {
        scope.launch {
            try {
                val payload = when (val result = FrxeUpdateRepository().check()) {
                    is UpdateCheckResult.UpdateAvailable -> JSONObject()
                        .put("updateAvailable", true)
                        .put("latestVersion", result.version)
                        .put("releaseUrl", result.pageUrl)
                        .put("notes", result.notes)
                    is UpdateCheckResult.UpToDate -> JSONObject()
                        .put("updateAvailable", false)
                        .put("latestVersion", result.latestVersion)
                        .put("releaseUrl", FrxeUpdateRepository.RELEASES_PAGE)
                        .put("notes", "")
                    UpdateCheckResult.NoPublishedRelease -> JSONObject()
                        .put("updateAvailable", false)
                        .put("latestVersion", "")
                        .put("releaseUrl", FrxeUpdateRepository.RELEASES_PAGE)
                        .put("notes", "No published Vitr release is available yet.")
                    is UpdateCheckResult.Error -> throw IllegalStateException(result.message)
                }
                reply(requestId, true, payload)
            } catch (error: Throwable) {
                replyError(requestId, error)
            }
        }
    }

    @JavascriptInterface
    fun openReleasePage(url: String) {
        val target = url
            .takeIf { it.startsWith("https://github.com/bloodvitr/vitr/") }
            ?: FrxeUpdateRepository.RELEASES_PAGE
        activity.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(target))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }

    @JavascriptInterface
    fun play(trackJson: String, queueJson: String, requestId: String) {
        scope.launch {
            try {
                val selected = parseTrack(JSONObject(trackJson))
                val requestedQueue = parseTracks(queueJson)
                val queue = if (requestedQueue.any { it.id == selected.id }) {
                    requestedQueue
                } else {
                    listOf(selected) + requestedQueue
                }.ifEmpty { listOf(selected) }

                val current = PlaybackQueueStore.currentTrack()
                if (current?.id != selected.id) {
                    PlaybackQueueStore.replaceAndRequestPlay(
                        tracks = queue,
                        currentTrackId = selected.id
                    )
                    controller?.play()
                }

                reply(requestId, true, trackJson(selected))
                emitPlayerState()
            } catch (error: Throwable) {
                replyError(requestId, error)
            }
        }
    }

    @JavascriptInterface
    fun togglePlay() {
        controller?.let {
            if (it.isPlaying) it.pause() else it.play()
        }
        emitPlayerState()
    }

    @JavascriptInterface
    fun pause() {
        controller?.pause()
        emitPlayerState()
    }

    @JavascriptInterface
    fun next() {
        val next = PlaybackQueueStore.advance(
            repeatMode = currentRepeatMode(),
            shuffle = controller?.shuffleModeEnabled == true
        )
        next?.current?.entryId?.let(PlaybackQueueStore::selectAndRequestPlay)
        controller?.play()
        emitPlayerState()
    }

    @JavascriptInterface
    fun previous() {
        val previous = PlaybackQueueStore.previous(currentRepeatMode())
        previous?.current?.entryId?.let(PlaybackQueueStore::selectAndRequestPlay)
        controller?.play()
        emitPlayerState()
    }

    @JavascriptInterface
    fun setShuffle(enabled: Boolean) {
        controller?.shuffleModeEnabled = enabled
        emitPlayerState()
    }

    @JavascriptInterface
    fun setRepeat(mode: String) {
        controller?.repeatMode = when (mode.trim().lowercase()) {
            "all" -> Player.REPEAT_MODE_ALL
            "one" -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
        emitPlayerState()
    }

    @JavascriptInterface
    fun lyrics(trackJson: String, requestId: String) {
        scope.launch {
            try {
                val track = parseTrack(JSONObject(trackJson))
                val result = lyricsRepository.lyrics(track)
                val lines = JSONArray().also { array ->
                    result.lines.forEach { line ->
                        array.put(
                            JSONObject()
                                .put("startMs", line.startMs)
                                .put("endMs", line.endMs)
                                .put("text", line.text)
                        )
                    }
                }
                reply(
                    requestId,
                    true,
                    JSONObject()
                        .put("lines", lines)
                        .put("synced", result.synced)
                        .put("source", result.source ?: JSONObject.NULL)
                        .put("message", result.message ?: JSONObject.NULL)
                )
            } catch (error: Throwable) {
                replyError(requestId, error)
            }
        }
    }

    @JavascriptInterface
    fun seek(positionMs: Double) {
        controller?.seekTo(positionMs.toLong().coerceAtLeast(0L))
        emitPlayerState()
    }

    @JavascriptInterface
    fun setVolume(volume: Double) {
        controller?.volume = volume.toFloat().coerceIn(0f, 1f)
        emitPlayerState()
    }

    @JavascriptInterface
    fun state(requestId: String) {
        reply(requestId, true, playerStateJson())
    }

    @JavascriptInterface
    fun library(requestId: String) {
        scope.launch {
            try {
                val tracks = withContext(Dispatchers.IO) {
                    dao.observeAll().first().map(TrackEntity::asTrack)
                }
                reply(requestId, true, tracksJson(tracks))
            } catch (error: Throwable) {
                replyError(requestId, error)
            }
        }
    }

    @JavascriptInterface
    fun history(requestId: String) {
        scope.launch {
            try {
                val tracks = withContext(Dispatchers.IO) {
                    dao.observeHistory()
                        .first()
                        .map { it.asTrack() }
                        .distinctBy(Track::id)
                }
                reply(requestId, true, tracksJson(tracks))
            } catch (error: Throwable) {
                replyError(requestId, error)
            }
        }
    }

    @JavascriptInterface
    fun toggleFavorite(trackJson: String, requestId: String) {
        scope.launch {
            try {
                val track = parseTrack(JSONObject(trackJson))
                val liked = withContext(Dispatchers.IO) {
                    if (dao.contains(track.id)) {
                        dao.remove(track.id)
                        false
                    } else {
                        dao.save(TrackEntity.from(track))
                        true
                    }
                }
                reply(requestId, true, JSONObject().put("liked", liked))
            } catch (error: Throwable) {
                replyError(requestId, error)
            }
        }
    }

    private fun parseTracks(raw: String): List<Track> =
        runCatching {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    add(parseTrack(item))
                }
            }
        }.getOrDefault(emptyList())

    private fun parseTrack(json: JSONObject): Track {
        val id = json.optString("id").ifBlank {
            throw IllegalArgumentException("Track ID is required.")
        }
        return Track(
            id = id,
            title = json.optString("title", "Unknown track"),
            artist = json.optString("artist", "Unknown artist"),
            album = json.optString("album", ""),
            streamUrl = json.optString("streamUrl"),
            durationMs = json.optLong("durationMs", 0L),
            artworkSeed = json.optInt("artworkSeed", id.hashCode()),
            artworkUrl = json.optString("artworkUrl").takeIf(String::isNotBlank)
                ?: json.optString("cover").takeIf(String::isNotBlank)
                ?: json.optString("thumbnail").takeIf(String::isNotBlank),
            downloadUrl = json.optString("downloadUrl").takeIf(String::isNotBlank),
            originalStreamUrl = json.optString("originalStreamUrl").takeIf(String::isNotBlank)
        )
    }


    private fun catalogItemJson(
        id: String,
        kind: String,
        title: String,
        subtitle: String,
        cover: String?,
        searchQuery: String,
        source: String,
        confidence: Double
    ): JSONObject = JSONObject()
        .put("id", id)
        .put("kind", kind)
        .put("title", title)
        .put("subtitle", subtitle)
        .put("cover", cover ?: JSONObject.NULL)
        .put(
            "metadata",
            JSONObject()
                .put("entityType", kind)
                .put("source", source)
                .put("browseId", id)
                .put("searchQuery", searchQuery)
                .put("confidence", confidence)
        )

    private fun mergeCatalogItems(vararg groups: JSONArray): JSONArray =
        JSONArray().also { output ->
            groups.forEach { group ->
                for (index in 0 until group.length()) {
                    output.put(group.get(index))
                }
            }
        }

    private fun genreSuggestions(query: String): List<String> {
        val genres = listOf(
            "Pop", "Hip-hop", "R&B", "Rock", "Electronic", "Indie",
            "Jazz", "Classical", "Metal", "Afrobeats", "Latin", "Country",
            "Reggae", "K-pop", "Ambient", "Lo-fi", "Chill", "Workout",
            "Focus", "Party", "Sleep", "Romance", "Energy"
        )
        val clean = query.trim().lowercase()
        val matching = genres.filter { genre ->
            genre.lowercase().contains(clean) ||
                clean.contains(genre.lowercase())
        }
        return (if (matching.isNotEmpty()) matching else genres).take(16)
    }

    private fun trackJson(track: Track): JSONObject = JSONObject()
        .put("id", track.id)
        .put("kind", "youtube")
        .put("title", track.title)
        .put("artist", track.artist)
        .put("album", track.album)
        .put("streamUrl", track.streamUrl)
        .put("durationMs", track.durationMs)
        .put("durationSeconds", track.durationMs / 1000.0)
        .put("artworkSeed", track.artworkSeed)
        .put("artworkUrl", track.artworkUrl ?: JSONObject.NULL)
        .put("cover", track.artworkUrl ?: JSONObject.NULL)
        .put("downloadUrl", track.downloadUrl ?: JSONObject.NULL)
        .put("originalStreamUrl", track.originalStreamUrl ?: JSONObject.NULL)
        .put("source", "Vitr Android")

    private fun tracksJson(tracks: List<Track>): JSONArray =
        JSONArray().also { array -> tracks.forEach { array.put(trackJson(it)) } }

    private fun currentRepeatMode(): QueueRepeatMode =
        when (controller?.repeatMode) {
            Player.REPEAT_MODE_ALL -> QueueRepeatMode.All
            Player.REPEAT_MODE_ONE -> QueueRepeatMode.One
            else -> QueueRepeatMode.Off
        }

    private fun playerStateJson(): JSONObject {
        val player = controller
        val track = PlaybackQueueStore.currentTrack()
        return JSONObject()
            .put("track", track?.let(::trackJson) ?: JSONObject.NULL)
            .put("playing", player?.isPlaying == true)
            .put("positionMs", player?.currentPosition?.coerceAtLeast(0L) ?: 0L)
            .put(
                "durationMs",
                player?.duration?.takeIf { it > 0L }
                    ?: track?.durationMs
                    ?: 0L
            )
            .put("bufferedPercent", player?.bufferedPercentage ?: 0)
            .put("volume", player?.volume ?: 1f)
            .put("shuffle", player?.shuffleModeEnabled == true)
            .put(
                "repeatMode",
                when (player?.repeatMode) {
                    Player.REPEAT_MODE_ALL -> "all"
                    Player.REPEAT_MODE_ONE -> "one"
                    else -> "off"
                }
            )
    }

    private fun reply(requestId: String, ok: Boolean, payload: Any) {
        val request = JSONObject.quote(requestId)
        val data = when (payload) {
            is JSONObject -> payload.toString()
            is JSONArray -> payload.toString()
            else -> JSONObject.wrap(payload).toString()
        }
        val script = "window.__vitrNativeResult&&window.__vitrNativeResult($request,$ok,$data);"
        webView.post { webView.evaluateJavascript(script, null) }
    }

    private fun replyError(requestId: String, error: Throwable) {
        reply(
            requestId,
            false,
            JSONObject().put(
                "message",
                error.message
                    ?.lineSequence()
                    ?.firstOrNull()
                    ?.take(240)
                    ?: "Android backend error"
            )
        )
    }

    private fun emitPlayerState() {
        val payload = playerStateJson().toString()
        webView.post {
            webView.evaluateJavascript(
                "window.__vitrNativePlayerState&&window.__vitrNativePlayerState($payload);",
                null
            )
        }
    }

    fun release() {
        controller?.removeListener(playerListener)
        MediaController.releaseFuture(controllerFuture)
        controller = null
        scope.cancel()
    }
}
