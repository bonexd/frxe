package com.frxe.music.social

import android.content.Context
import android.net.wifi.WifiManager
import java.net.DatagramPacket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.MulticastSocket
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.random.Random
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject

enum class ListenTogetherRole { Off, Host, Guest }

data class ListenTogetherUiState(
    val role: ListenTogetherRole = ListenTogetherRole.Off,
    val roomCode: String = "",
    val connected: Boolean = false,
    val members: Int = 0,
    val status: String = "Bereit"
)

data class ListenTogetherTrack(
    val id: String,
    val title: String,
    val artist: String,
    val album: String,
    val streamUrl: String,
    val durationMs: Long,
    val artworkSeed: Int,
    val artworkUrl: String?,
    val downloadUrl: String?
)

data class ListenTogetherPlayback(
    val track: ListenTogetherTrack,
    val positionMs: Long,
    val playing: Boolean,
    val sentAtMs: Long = System.currentTimeMillis()
)

/**
 * Zero-account Listen Together transport for devices on the same Wi-Fi/LAN.
 * A host multicasts playback snapshots; guests follow the matching room code.
 */
class ListenTogetherManager(
    context: Context,
    private val localPlayback: () -> ListenTogetherPlayback?,
    private val onRemotePlayback: (ListenTogetherPlayback) -> Unit
) {
    private val app = context.applicationContext
    private val senderId = UUID.randomUUID().toString()
    private val stateMutable = MutableStateFlow(ListenTogetherUiState())
    val state: StateFlow<ListenTogetherUiState> = stateMutable.asStateFlow()

    private var scope: CoroutineScope? = null
    private var socket: MulticastSocket? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    private val memberSeenAt = ConcurrentHashMap<String, Long>()

    @Synchronized
    fun host(): String {
        val code = newRoomCode()
        start(ListenTogetherRole.Host, code)
        return code
    }

    @Synchronized
    fun join(rawCode: String): Boolean {
        val code = normalizeRoomCode(rawCode)
        if (code.length != ROOM_CODE_LENGTH) {
            stateMutable.value = ListenTogetherUiState(status = "Raumcode muss 6 Zeichen haben.")
            return false
        }
        start(ListenTogetherRole.Guest, code)
        return true
    }

    @Synchronized
    fun leave() {
        stopTransport()
        stateMutable.value = ListenTogetherUiState()
    }

    fun close() {
        leave()
    }

    private fun start(role: ListenTogetherRole, roomCode: String) {
        stopTransport()
        val sessionScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        scope = sessionScope
        memberSeenAt.clear()
        stateMutable.value = ListenTogetherUiState(
            role = role,
            roomCode = roomCode,
            connected = role == ListenTogetherRole.Host,
            members = if (role == ListenTogetherRole.Host) 1 else 0,
            status = if (role == ListenTogetherRole.Host) "Raum aktiv · gleiches WLAN" else "Suche Host im gleichen WLAN…"
        )

        runCatching {
            val wifi = app.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            multicastLock = wifi?.createMulticastLock("frxe-listen-together")?.apply {
                setReferenceCounted(false)
                acquire()
            }
            socket = MulticastSocket(null).apply {
                reuseAddress = true
                bind(InetSocketAddress(PORT))
                timeToLive = 1
                joinGroup(GROUP)
            }
        }.onFailure { error ->
            stopTransport()
            stateMutable.value = ListenTogetherUiState(status = "Listen Together konnte nicht starten: ${error.message ?: "Netzwerkfehler"}")
            return
        }

        val activeSocket = socket ?: return
        sessionScope.launch { receiveLoop(activeSocket, role, roomCode) }
        sessionScope.launch { sendLoop(activeSocket, role, roomCode) }
    }

    private suspend fun receiveLoop(activeSocket: MulticastSocket, role: ListenTogetherRole, roomCode: String) {
        val buffer = ByteArray(MAX_PACKET_BYTES)
        while (scope?.isActive == true) {
            val packet = DatagramPacket(buffer, buffer.size)
            val received = try {
                activeSocket.receive(packet)
                String(packet.data, packet.offset, packet.length, Charsets.UTF_8)
            } catch (_: Throwable) {
                if (scope?.isActive != true) break
                delay(250)
                continue
            }
            val root = runCatching { JSONObject(received) }.getOrNull() ?: continue
            if (root.optInt("v") != PROTOCOL_VERSION) continue
            if (root.optString("room") != roomCode) continue
            val remoteSender = root.optString("sender")
            if (remoteSender.isBlank() || remoteSender == senderId) continue

            when (root.optString("kind")) {
                KIND_HELLO -> if (role == ListenTogetherRole.Host) {
                    memberSeenAt[remoteSender] = System.currentTimeMillis()
                }
                KIND_STATE -> if (role == ListenTogetherRole.Guest) {
                    val remote = root.toPlayback() ?: continue
                    stateMutable.value = stateMutable.value.copy(
                        connected = true,
                        members = root.optInt("members", 2).coerceAtLeast(2),
                        status = "Synchronisiert · ${root.optInt("members", 2).coerceAtLeast(2)} Teilnehmer"
                    )
                    onRemotePlayback(remote)
                }
            }
        }
    }

    private suspend fun sendLoop(activeSocket: MulticastSocket, role: ListenTogetherRole, roomCode: String) {
        while (scope?.isActive == true) {
            if (role == ListenTogetherRole.Host) {
                val now = System.currentTimeMillis()
                memberSeenAt.entries.removeIf { now - it.value > MEMBER_TIMEOUT_MS }
                val members = 1 + memberSeenAt.size
                stateMutable.value = stateMutable.value.copy(members = members, connected = true, status = "Raum aktiv · $members Teilnehmer")
                localPlayback()?.let { playback ->
                    send(activeSocket, playback.toJson(roomCode, members).toString())
                }
                delay(HOST_BROADCAST_MS)
            } else {
                val hello = JSONObject()
                    .put("v", PROTOCOL_VERSION)
                    .put("kind", KIND_HELLO)
                    .put("room", roomCode)
                    .put("sender", senderId)
                    .put("sentAt", System.currentTimeMillis())
                send(activeSocket, hello.toString())
                delay(GUEST_HELLO_MS)
            }
        }
    }

    private fun send(activeSocket: MulticastSocket, text: String) {
        val bytes = text.toByteArray(Charsets.UTF_8)
        if (bytes.size > MAX_PACKET_BYTES) return
        runCatching {
            activeSocket.send(DatagramPacket(bytes, bytes.size, GROUP, PORT))
        }
    }

    private fun ListenTogetherPlayback.toJson(roomCode: String, members: Int): JSONObject = JSONObject()
        .put("v", PROTOCOL_VERSION)
        .put("kind", KIND_STATE)
        .put("room", roomCode)
        .put("sender", senderId)
        .put("members", members)
        .put("sentAt", sentAtMs)
        .put("position", positionMs)
        .put("playing", playing)
        .put(
            "track",
            JSONObject()
                .put("id", track.id)
                .put("title", track.title)
                .put("artist", track.artist)
                .put("album", track.album)
                .put("streamUrl", track.streamUrl)
                .put("duration", track.durationMs)
                .put("artworkSeed", track.artworkSeed)
                .put("artworkUrl", track.artworkUrl)
                .put("downloadUrl", track.downloadUrl)
        )

    private fun JSONObject.toPlayback(): ListenTogetherPlayback? {
        val trackJson = optJSONObject("track") ?: return null
        val id = trackJson.optString("id").takeIf(String::isNotBlank) ?: return null
        val streamUrl = trackJson.optString("streamUrl").takeIf(String::isNotBlank) ?: return null
        return ListenTogetherPlayback(
            track = ListenTogetherTrack(
                id = id,
                title = trackJson.optString("title", "Vitr track"),
                artist = trackJson.optString("artist", "Unknown artist"),
                album = trackJson.optString("album"),
                streamUrl = streamUrl,
                durationMs = trackJson.optLong("duration", 0L).coerceAtLeast(0L),
                artworkSeed = trackJson.optInt("artworkSeed", id.hashCode()),
                artworkUrl = trackJson.optString("artworkUrl").takeIf(String::isNotBlank),
                downloadUrl = trackJson.optString("downloadUrl").takeIf(String::isNotBlank)
            ),
            positionMs = optLong("position", 0L).coerceAtLeast(0L),
            playing = optBoolean("playing"),
            sentAtMs = optLong("sentAt", System.currentTimeMillis())
        )
    }

    private fun stopTransport() {
        scope?.cancel()
        scope = null
        runCatching { socket?.leaveGroup(GROUP) }
        runCatching { socket?.close() }
        socket = null
        runCatching { multicastLock?.release() }
        multicastLock = null
        memberSeenAt.clear()
    }

    private fun newRoomCode(): String = buildString(ROOM_CODE_LENGTH) {
        repeat(ROOM_CODE_LENGTH) { append(ROOM_ALPHABET[Random.nextInt(ROOM_ALPHABET.length)]) }
    }

    companion object {
        private const val PROTOCOL_VERSION = 1
        private const val KIND_HELLO = "hello"
        private const val KIND_STATE = "state"
        private const val PORT = 42899
        private val GROUP: InetAddress = InetAddress.getByName("239.255.42.99")
        private const val MAX_PACKET_BYTES = 16 * 1024
        private const val HOST_BROADCAST_MS = 650L
        private const val GUEST_HELLO_MS = 1_500L
        private const val MEMBER_TIMEOUT_MS = 5_000L
        private const val ROOM_CODE_LENGTH = 6
        private const val ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

        fun normalizeRoomCode(value: String): String = value.trim().uppercase().filter { it in ROOM_ALPHABET }.take(ROOM_CODE_LENGTH)
    }
}
