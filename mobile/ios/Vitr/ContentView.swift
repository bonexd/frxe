import SwiftUI
import UIKit

private enum VitrTab: String, CaseIterable, Identifiable {
    case home = "Home"
    case library = "Library"
    case downloads = "Downloads"
    case search = "Search"
    case settings = "Settings"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .home: return "house.fill"
        case .library: return "books.vertical.fill"
        case .downloads: return "arrow.down.circle.fill"
        case .search: return "magnifyingglass"
        case .settings: return "gearshape.fill"
        }
    }
}

struct VitrTrack: Identifiable, Hashable {
    let id: UUID
    let title: String
    let artist: String
    let album: String
    let duration: String
    let colors: [Color]
    let sourceVideoID: String?
    let remoteAudioURL: URL?
    let localURL: URL?

    init(
        id: UUID = UUID(),
        title: String,
        artist: String,
        album: String,
        duration: String,
        colors: [Color],
        sourceVideoID: String? = nil,
        remoteAudioURL: URL? = nil,
        localURL: URL? = nil
    ) {
        self.id = id
        self.title = title
        self.artist = artist
        self.album = album
        self.duration = duration
        self.colors = colors
        self.sourceVideoID = sourceVideoID
        self.remoteAudioURL = remoteAudioURL
        self.localURL = localURL
    }

    var sourceURL: String? {
        sourceVideoID.map {
            "https://www.youtube.com/watch?v=\($0)"
        }
    }

    var durationSeconds: Double {
        let parts =
            duration
                .split(separator: ":")
                .compactMap {
                    Double($0)
                }

        guard
            parts.count == 2
        else {
            return 0
        }

        return parts[0] * 60
            + parts[1]
    }
}

private struct VitrPlaylist: Codable, Identifiable, Hashable {
    let id: UUID
    var name: String
    var trackTitles: [String]
}

@MainActor
private final class VitrPlaylistStore: ObservableObject {
    static let shared = VitrPlaylistStore()

    @Published private(set) var playlists: [VitrPlaylist] = []

    private let storageKey = "vitr.playlists.v1"

    init() {
        load()
    }

    @discardableResult
    func createPlaylist(named rawName: String, adding track: VitrTrack? = nil) -> VitrPlaylist? {
        let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return nil }

        let playlist = VitrPlaylist(
            id: UUID(),
            name: name,
            trackTitles: track.map { [$0.title] } ?? []
        )
        playlists.append(playlist)
        persist()
        return playlist
    }

    func addTrack(_ track: VitrTrack, to playlistID: UUID) {
        guard let index = playlists.firstIndex(where: { $0.id == playlistID }) else { return }
        guard !playlists[index].trackTitles.contains(track.title) else { return }
        playlists[index].trackTitles.append(track.title)
        persist()
    }

    func deletePlaylist(_ playlistID: UUID) {
        playlists.removeAll { $0.id == playlistID }
        persist()
    }

    func renamePlaylist(_ playlistID: UUID, to rawName: String) {
        let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty,
              let index = playlists.firstIndex(where: { $0.id == playlistID })
        else {
            return
        }

        playlists[index].name = name
        persist()
    }

    func removeTrack(_ track: VitrTrack, from playlistID: UUID) {
        guard let index = playlists.firstIndex(where: { $0.id == playlistID }) else {
            return
        }
        playlists[index].trackTitles.removeAll { $0 == track.title }
        persist()
    }

    func moveTrack(
        in playlistID: UUID,
        from source: IndexSet,
        to destination: Int
    ) {
        guard let index = playlists.firstIndex(where: { $0.id == playlistID }) else {
            return
        }

        playlists[index].trackTitles.move(
            fromOffsets: source,
            toOffset: destination
        )
        persist()
    }

    func reset() {
        playlists = []
        UserDefaults.standard.removeObject(forKey: storageKey)
    }

    func tracks(in playlist: VitrPlaylist) -> [VitrTrack] {
        playlist.trackTitles.compactMap { title in
            vitrTracks.first { $0.title == title }
        }
    }

    private func load() {
        guard
            let data = UserDefaults.standard.data(forKey: storageKey),
            let decoded = try? JSONDecoder().decode([VitrPlaylist].self, from: data)
        else {
            playlists = []
            return
        }
        playlists = decoded
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(playlists) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }
}

@MainActor
private final class VitrLocalLibraryStore: ObservableObject {
    static let shared = VitrLocalLibraryStore()

    @Published private(set) var likedKeys: Set<String> = []
    @Published private(set) var recentKeys: [String] = []
    @Published private(set) var searchHistory: [String] = []

    private let likedKey = "vitr.likes.v1"
    private let recentKey = "vitr.recent.v1"
    private let searchKey = "vitr.searchHistory.v1"

    private init() {
        let defaults = UserDefaults.standard
        likedKeys = Set(defaults.stringArray(forKey: likedKey) ?? [])
        recentKeys = defaults.stringArray(forKey: recentKey) ?? []
        searchHistory = defaults.stringArray(forKey: searchKey) ?? []
    }

    func key(for track: VitrTrack) -> String {
        "\(track.title)\u{1F}\(track.artist)"
    }

    func isLiked(_ track: VitrTrack) -> Bool {
        likedKeys.contains(key(for: track))
    }

    func toggleLike(_ track: VitrTrack) {
        let value = key(for: track)
        if likedKeys.contains(value) {
            likedKeys.remove(value)
        } else {
            likedKeys.insert(value)
        }
        UserDefaults.standard.set(
            Array(likedKeys).sorted(),
            forKey: likedKey
        )
    }

    func recordPlayed(_ track: VitrTrack) {
        let value = key(for: track)
        recentKeys.removeAll { $0 == value }
        recentKeys.insert(value, at: 0)
        recentKeys = Array(recentKeys.prefix(100))
        UserDefaults.standard.set(recentKeys, forKey: recentKey)
    }

    func clearRecentlyPlayed() {
        recentKeys = []
        UserDefaults.standard.removeObject(forKey: recentKey)
    }

    func recordSearch(_ rawQuery: String) {
        let query = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return }

        searchHistory.removeAll {
            $0.caseInsensitiveCompare(query) == .orderedSame
        }
        searchHistory.insert(query, at: 0)
        searchHistory = Array(searchHistory.prefix(20))
        UserDefaults.standard.set(searchHistory, forKey: searchKey)
    }

    func removeSearch(_ query: String) {
        searchHistory.removeAll {
            $0.caseInsensitiveCompare(query) == .orderedSame
        }
        UserDefaults.standard.set(searchHistory, forKey: searchKey)
    }

    func clearSearchHistory() {
        searchHistory = []
        UserDefaults.standard.removeObject(forKey: searchKey)
    }

    func reset() {
        likedKeys = []
        recentKeys = []
        searchHistory = []

        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: likedKey)
        defaults.removeObject(forKey: recentKey)
        defaults.removeObject(forKey: searchKey)
    }
}

private let vitrTracks: [VitrTrack] = [
    .init(
        title: "Neon Skies",
        artist: "The Velvet Hours",
        album: "The Velvet Hours",
        duration: "4:52",
        colors: [Color(red: 0.98, green: 0.17, blue: 0.39), Color(red: 0.22, green: 0.08, blue: 0.30)]
    ),
    .init(
        title: "Lunar Static",
        artist: "Velvet Circuit",
        album: "Lunar Static",
        duration: "3:48",
        colors: [Color(red: 0.38, green: 0.54, blue: 1.0), Color(red: 0.12, green: 0.18, blue: 0.42)]
    ),
    .init(
        title: "Echoes",
        artist: "Polar Tide",
        album: "Echoes",
        duration: "4:06",
        colors: [Color(red: 0.71, green: 0.45, blue: 0.98), Color(red: 0.17, green: 0.16, blue: 0.39)]
    ),
    .init(
        title: "Velvet Circuit",
        artist: "The Stake",
        album: "Afterglow",
        duration: "3:35",
        colors: [Color(red: 1.0, green: 0.38, blue: 0.58), Color(red: 0.10, green: 0.25, blue: 0.48)]
    ),
    .init(
        title: "A Quieter Tomorrow",
        artist: "Vitr",
        album: "Fragments",
        duration: "5:14",
        colors: [Color(red: 0.46, green: 0.68, blue: 1.0), Color(red: 0.28, green: 0.11, blue: 0.37)]
    )
]

struct ContentView: View {
    @State private var selectedTab: VitrTab = .home
    @State private var currentTrack: VitrTrack = vitrTracks[0]
    @State private var playerOpen = false
    @State private var isPlaying = true
    @StateObject private var lyricsStore = VitrLyricsStore()
    @StateObject private var playlistStore = VitrPlaylistStore.shared
    @StateObject private var localLibrary = VitrLocalLibraryStore.shared
    @StateObject private var playback = VitrPlaybackController.shared
    @AppStorage("vitr.reduceMotion") private var reduceMotion = false
    @AppStorage("vitr.miniPlayerMode") private var miniPlayerMode = "standard"

    private var recentTracks: [VitrTrack] {
        localLibrary.recentKeys.compactMap { key in
            vitrTracks.first {
                localLibrary.key(for: $0) == key
            }
        }
    }

    private var likedTrackIDs: Set<UUID> {
        Set(
            vitrTracks
                .filter(localLibrary.isLiked)
                .map(\.id)
        )
    }

    private var recommendedTracks: [VitrTrack] {
        VitrRecommendationEngine.rank(
            candidates: vitrTracks,
            history: recentTracks,
            library: vitrTracks,
            likedTrackIDs: likedTrackIDs,
            limit: 8
        )
    }

    var body: some View {
        ZStack {
            VitrLiquidBackground(
                accent: currentTrack.colors.first ?? .pink,
                secondary: currentTrack.colors.last ?? .blue,
                reduceMotion: reduceMotion
            )

            Group {
                switch selectedTab {
                case .home:
                    VitrHomeView(
                        currentTrack: playback.currentTrack ?? currentTrack,
                        recentTracks: recentTracks,
                        recommendedTracks: recommendedTracks,
                        onPlay: play,
                        onOpenCurrentPlayer: {
                            playerOpen = true
                        },
                        onOpenSettings: {
                            selectedTab = .settings
                        }
                    )
                case .library:
                    VitrLibraryView(
                        tracks: vitrTracks,
                        playlistStore: playlistStore,
                        localLibrary: localLibrary,
                        onPlay: play,
                        onOpenDownloads: {
                            selectedTab = .downloads
                        }
                    )
                case .downloads:
                    VitrDownloadsView()
                case .search:
                    VitrSearchView(
                        tracks: vitrTracks,
                        playlistStore: playlistStore,
                        localLibrary: localLibrary,
                        onPlay: play
                    )
                case .settings:
                    VitrSettingsView()
                }
            }
            .transition(
                .asymmetric(
                    insertion: .opacity.combined(with: .scale(scale: 0.985)),
                    removal: .opacity.combined(with: .scale(scale: 1.015))
                )
            )
            .animation(
                reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.42, dampingFraction: 0.86),
                value: selectedTab
            )

            VStack(spacing: 10) {
                Spacer()

                VitrMiniPlayer(
                    track: playback.currentTrack ?? currentTrack,
                    isPlaying: playback.currentTrack != nil ? playback.isPlaying : isPlaying,
                    mode: miniPlayerMode,
                    progress: playback.currentTrack != nil && playback.duration > 0
                        ? playback.position / playback.duration
                        : 0,
                    lyricsStore: lyricsStore,
                    onOpen: { playerOpen = true },
                    onToggle: {
                        if playback.currentTrack != nil {
                            playback.togglePlayPause()
                        } else {
                            isPlaying.toggle()
                        }
                    },
                    onNext: {
                        playback.next()
                    }
                )

                VitrBottomBar(selectedTab: $selectedTab)
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 4)
        }
        .preferredColorScheme(.dark)
        .fullScreenCover(isPresented: $playerOpen) {
            VitrNowPlayingView(
                track: playback.currentTrack ?? currentTrack,
                isPlaying: $isPlaying,
                playback: playback,
                lyricsStore: lyricsStore,
                playlistStore: playlistStore,
                localLibrary: localLibrary,
                onClose: { playerOpen = false }
            )
        }
        .task(id: currentTrack.id) {
            lyricsStore.load(
                title: currentTrack.title,
                artist: currentTrack.artist,
                album: currentTrack.album,
                durationSeconds:
                    Int(currentTrack.durationSeconds)
            )
        }
        .onReceive(
            NotificationCenter.default.publisher(
                for: Notification.Name("vitrDidReset")
            )
        ) { _ in
            selectedTab = .home
            currentTrack = vitrTracks[0]
            playerOpen = false
            isPlaying = false
        }
    }

    private func play(_ track: VitrTrack) {
        currentTrack = track
        localLibrary.recordPlayed(track)
        playerOpen = true

        if track.localURL == nil,
           track.sourceVideoID != nil {
            isPlaying = false

            Task { @MainActor in
                do {
                    let item =
                        try await VitrSealDownloadService
                            .shared
                            .download(track)

                    currentTrack =
                        VitrTrack(
                            downloaded: item
                        )

                    isPlaying =
                        playback
                            .playDownloaded(
                                item
                            )
                } catch {
                    isPlaying = false
                }
            }

            return
        }

        isPlaying =
            playback.play(
                track,
                queue: vitrTracks
            )
    }
}

private struct VitrLiquidBackground: View {
    let accent: Color
    let secondary: Color
    let reduceMotion: Bool

    @AppStorage("vitr.appearanceMode")
    private var appearanceMode = "liquid_glass"

    @AppStorage("vitr.liquidEffects")
    private var liquidEffects = true

    @AppStorage("vitr.animationIntensity")
    private var animationIntensity = "normal"

    @Environment(\.accessibilityReduceMotion)
    private var accessibilityReduceMotion

    var body: some View {
        GeometryReader { proxy in
            if appearanceMode == "normal" {
                ZStack {
                    Color(red: 0.015, green: 0.015, blue: 0.018)

                    RadialGradient(
                        colors: [
                            Color(red: 0.78, green: 0.02, blue: 0.16)
                                .opacity(0.16),
                            .clear
                        ],
                        center: .topTrailing,
                        startRadius: 10,
                        endRadius: proxy.size.width * 1.1
                    )

                    LinearGradient(
                        colors: [
                            .clear,
                            .black.opacity(0.62)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                }
                .ignoresSafeArea()
            } else {
                TimelineView(
                    .animation(
                        minimumInterval:
                            reduceMotion || accessibilityReduceMotion || !liquidEffects
                            ? 1
                            : frameInterval
                    )
                ) { timeline in
                    let t = timeline.date.timeIntervalSinceReferenceDate
                    let motionEnabled =
                        liquidEffects &&
                        !reduceMotion &&
                        !accessibilityReduceMotion
                    ZStack {
                        LinearGradient(
                            colors: [
                                Color(red: 0.055, green: 0.01, blue: 0.022),
                                Color(red: 0.025, green: 0.006, blue: 0.012),
                                Color(red: 0.008, green: 0.008, blue: 0.010)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )

                        liquidBlob(
                            color: Color(red: 0.54, green: 0.02, blue: 0.13)
                                .opacity(0.62),
                            size: proxy.size.width * 1.18,
                            x:
                                proxy.size.width
                                * (
                                    0.66
                                    + 0.11
                                    * wave(t / 5.2, enabled: motionEnabled)
                                ),
                            y:
                                proxy.size.height
                                * (
                                    0.16
                                    + 0.05
                                    * wave(t / 6.4 + 1.1, enabled: motionEnabled)
                                )
                        )

                        liquidBlob(
                            color: accent.opacity(0.44),
                            size: proxy.size.width * 0.94,
                            x:
                                proxy.size.width
                                * (
                                    0.16
                                    + 0.08
                                    * wave(t / 4.8 + 2.2, enabled: motionEnabled)
                                ),
                            y:
                                proxy.size.height
                                * (
                                    0.68
                                    + 0.08
                                    * wave(t / 7.4, enabled: motionEnabled)
                                )
                        )

                        liquidBlob(
                            color: Color(red: 0.96, green: 0.08, blue: 0.27)
                                .opacity(0.26),
                            size: proxy.size.width * 0.72,
                            x:
                                proxy.size.width
                                * (
                                    0.84
                                    + 0.05
                                    * wave(t / 5.7, enabled: motionEnabled)
                                ),
                            y:
                                proxy.size.height
                                * (
                                    0.77
                                    + 0.05
                                    * wave(t / 8.3 + 0.8, enabled: motionEnabled)
                                )
                        )

                        LinearGradient(
                            colors: [
                                .white.opacity(0.045),
                                .clear,
                                .black.opacity(0.42)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    }
                    .ignoresSafeArea()
                }
            }
        }
    }

    private var frameInterval: TimeInterval {
        switch animationIntensity {
        case "reduced":
            return 1.0 / 20.0
        case "high":
            return 1.0 / 60.0
        default:
            return 1.0 / 30.0
        }
    }

    @ViewBuilder
    private func liquidBlob(
        color: Color,
        size: CGFloat,
        x: CGFloat,
        y: CGFloat
    ) -> some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .blur(
                radius:
                    animationIntensity == "high"
                    ? 96
                    : 82
            )
            .position(x: x, y: y)
    }

    private func wave(
        _ value: Double,
        enabled: Bool
    ) -> Double {
        enabled ? sin(value) : 0
    }
}

private struct VitrGlassCard<Content: View>: View {
    let radius: CGFloat
    let padding: CGFloat
    @ViewBuilder let content: () -> Content

    @AppStorage("vitr.appearanceMode")
    private var appearanceMode = "liquid_glass"

    @AppStorage("vitr.liquidEffects")
    private var liquidEffects = true

    init(
        radius: CGFloat = 24,
        padding: CGFloat = 16,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.radius = radius
        self.padding = padding
        self.content = content
    }

    var body: some View {
        content()
            .padding(padding)
            .background {
                if appearanceMode == "normal" {
                    RoundedRectangle(
                        cornerRadius: radius,
                        style: .continuous
                    )
                    .fill(
                        Color(
                            red: 0.045,
                            green: 0.045,
                            blue: 0.052
                        )
                    )
                } else {
                    RoundedRectangle(
                        cornerRadius: radius,
                        style: .continuous
                    )
                    .fill(.ultraThinMaterial)
                    .overlay {
                        if liquidEffects {
                            LinearGradient(
                                colors: [
                                    Color(red: 0.96, green: 0.08, blue: 0.27)
                                        .opacity(0.13),
                                    .clear,
                                    Color.white.opacity(0.055)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                            .clipShape(
                                RoundedRectangle(
                                    cornerRadius: radius,
                                    style: .continuous
                                )
                            )
                        }
                    }
                }
            }
            .overlay(
                RoundedRectangle(
                    cornerRadius: radius,
                    style: .continuous
                )
                .stroke(
                    appearanceMode == "normal"
                        ? Color.white.opacity(0.10)
                        : Color(red: 0.96, green: 0.08, blue: 0.27)
                            .opacity(0.24),
                    lineWidth: 1
                )
            )
            .shadow(
                color: .black.opacity(
                    appearanceMode == "normal"
                        ? 0.18
                        : 0.34
                ),
                radius:
                    appearanceMode == "normal"
                    ? 8
                    : 24,
                y:
                    appearanceMode == "normal"
                    ? 4
                    : 12
            )
    }
}

private struct VitrArtwork: View {
    let track: VitrTrack
    let size: CGFloat
    var radius: CGFloat = 22

    var body: some View {
        ZStack {
            LinearGradient(
                colors: track.colors,
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Circle()
                .fill(Color.white.opacity(0.16))
                .frame(width: size * 0.52, height: size * 0.52)
                .blur(radius: 8)
                .offset(x: size * 0.18, y: -size * 0.14)

            Circle()
                .fill(Color(red: 1.0, green: 0.18, blue: 0.38).opacity(0.78))
                .frame(width: size * 0.23, height: size * 0.23)
                .shadow(color: .pink.opacity(0.7), radius: 24)

            Image(systemName: "waveform.path")
                .font(.system(size: size * 0.24, weight: .medium))
                .foregroundStyle(.white.opacity(0.82))
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .stroke(.white.opacity(0.22), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.34), radius: 18, y: 10)
    }
}

private struct VitrMiniPlayer: View {
    let track: VitrTrack
    let isPlaying: Bool
    let mode: String
    let progress: Double
    @ObservedObject var lyricsStore: VitrLyricsStore
    let onOpen: () -> Void
    let onToggle: () -> Void
    let onNext: () -> Void

    private var lyricText: String {
        if lyricsStore.isLoading {
            return "Loading lyrics…"
        }

        return lyricsStore.line(at: nil)
            ?? lyricsStore.message
            ?? "No lyrics available"
    }

    var body: some View {
        VitrGlassCard(radius: 21, padding: 9) {
            VStack(spacing: 7) {
                HStack(spacing: 11) {
                    VitrArtwork(
                        track: track,
                        size: 46,
                        radius: 13
                    )

                    VStack(
                        alignment: .leading,
                        spacing: 2
                    ) {
                        if mode == "lyrics" {
                            Text(lyricText)
                                .font(.subheadline.weight(.semibold))
                                .lineLimit(2)

                            Text(track.title)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        } else {
                            Text(track.title)
                                .font(.subheadline.weight(.semibold))
                                .lineLimit(1)

                            Text(track.artist)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }

                    Spacer()

                    Button(action: onToggle) {
                        Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                            .frame(width: 36, height: 36)
                            .background(Color.white.opacity(0.10), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(isPlaying ? "Pause" : "Play")

                    Button(action: onNext) {
                        Image(systemName: "forward.end.fill")
                            .frame(width: 36, height: 36)
                            .background(Color.white.opacity(0.08), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Next")
                }

                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Color.white.opacity(0.10))
                        Capsule()
                            .fill(Color(red: 0.91, green: 0.07, blue: 0.25))
                            .frame(
                                width:
                                    proxy.size.width
                                    * min(max(progress, 0), 1)
                            )
                    }
                }
                .frame(height: 2)
            }
            .contentShape(Rectangle())
            .onTapGesture(perform: onOpen)
        }
    }
}

private struct VitrBottomBar: View {
    @Binding var selectedTab: VitrTab

    var body: some View {
        VitrGlassCard(radius: 28, padding: 6) {
            HStack(spacing: 2) {
                ForEach([VitrTab.home, .search, .library]) { tab in
                    Button {
                        withAnimation(.spring(response: 0.36, dampingFraction: 0.78)) {
                            selectedTab = tab
                        }
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: tab.symbol)
                                .font(.system(size: 16, weight: .semibold))
                            Text(tab.rawValue)
                                .font(.system(size: 9, weight: .semibold))
                        }
                        .foregroundStyle(
                            selectedTab == tab
                                ? Color(red: 1.0, green: 0.28, blue: 0.44)
                                : Color.white.opacity(0.68)
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                        .background(
                            selectedTab == tab
                                ? Color.white.opacity(0.08)
                                : Color.clear,
                            in: RoundedRectangle(cornerRadius: 20, style: .continuous)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private struct VitrHomeView: View {
    let currentTrack: VitrTrack
    let recentTracks: [VitrTrack]
    let recommendedTracks: [VitrTrack]
    let onPlay: (VitrTrack) -> Void
    let onOpenCurrentPlayer: () -> Void
    let onOpenSettings: () -> Void

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("vitr")
                            .font(.system(size: 30, weight: .black, design: .rounded))
                        Text("Music flows different here.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("made by blood")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(
                                Color(red: 0.96, green: 0.08, blue: 0.27)
                            )
                    }
                    Spacer()
                    Button(action: onOpenSettings) {
                        Image(systemName: "gearshape.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .frame(width: 40, height: 40)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Settings")
                    VitrDropLogo(size: 34)
                }
                .padding(.top, 12)

                VitrGlassCard(radius: 30, padding: 14) {
                    VStack(alignment: .leading, spacing: 14) {
                        VitrArtwork(track: currentTrack, size: 250, radius: 24)
                            .frame(maxWidth: .infinity)

                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(currentTrack.title)
                                    .font(.title3.weight(.bold))
                                Text(currentTrack.artist)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "heart.fill")
                                .foregroundStyle(Color(red: 1.0, green: 0.28, blue: 0.44))
                        }

                        Button {
                            onOpenCurrentPlayer()
                        } label: {
                            Label("Open player", systemImage: "rectangle.stack.fill")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 13)
                                .background(
                                    LinearGradient(
                                        colors: [
                                            Color(red: 1.0, green: 0.25, blue: 0.43),
                                            Color(red: 0.89, green: 0.15, blue: 0.35)
                                        ],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    ),
                                    in: Capsule()
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }

                if !recentTracks.isEmpty {
                    Text("Recently played")
                        .font(.title3.weight(.bold))

                    ForEach(recentTracks.prefix(8)) { track in
                        VitrTrackRow(track: track) {
                            onPlay(track)
                        }
                    }
                }

                if !recommendedTracks.isEmpty {
                    Text("For you")
                        .font(.title3.weight(.bold))

                    Text("Based on your recent listening, likes and local library")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    ForEach(recommendedTracks) { track in
                        VitrTrackRow(track: track) {
                            onPlay(track)
                        }
                    }
                }

                Color.clear.frame(height: 150)
            }
            .padding(.horizontal, 16)
        }
    }
}

private enum VitrLibrarySection: String, CaseIterable, Identifiable {
    case liked = "Liked Songs"
    case playlists = "Playlists"
    case artists = "Artists"
    case albums = "Albums"
    case songs = "Songs"
    case downloaded = "Downloaded"
    case recent = "Recently Played"

    var id: String { rawValue }
}

private struct VitrLibraryView: View {
    let tracks: [VitrTrack]
    @ObservedObject var playlistStore: VitrPlaylistStore
    @ObservedObject var localLibrary: VitrLocalLibraryStore
    let onPlay: (VitrTrack) -> Void
    let onOpenDownloads: () -> Void

    @ObservedObject private var downloads = VitrDownloadLibrary.shared
    @State private var section: VitrLibrarySection = .liked
    @State private var creatingPlaylist = false
    @State private var newPlaylistName = ""
    @State private var showingClearRecent = false

    private var likedTracks: [VitrTrack] {
        tracks.filter(localLibrary.isLiked)
    }

    private var recentTracks: [VitrTrack] {
        localLibrary.recentKeys.compactMap { key in
            tracks.first {
                localLibrary.key(for: $0) == key
            }
        }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Library")
                        .font(.system(size: 32, weight: .bold))
                    Spacer()
                    Button {
                        newPlaylistName = ""
                        creatingPlaylist = true
                    } label: {
                        Image(systemName: "plus")
                            .font(.headline)
                            .frame(width: 40, height: 40)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Create playlist")
                }
                .padding(.top, 12)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(VitrLibrarySection.allCases) { item in
                            Button {
                                section = item
                            } label: {
                                Text(item.rawValue)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(
                                        section == item
                                            ? Color.white
                                            : Color.white.opacity(0.62)
                                    )
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 9)
                                    .background(
                                        section == item
                                            ? Color(red: 0.91, green: 0.07, blue: 0.25)
                                                .opacity(0.42)
                                            : Color.white.opacity(0.06),
                                        in: Capsule()
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                switch section {
                case .liked:
                    if likedTracks.isEmpty {
                        VitrEmptyLibraryCard(
                            symbol: "heart",
                            title: "No Liked Songs yet",
                            detail: "Tap the heart on any track to add it here."
                        )
                    } else {
                        ForEach(likedTracks) { track in
                            VitrTrackRow(track: track) {
                                onPlay(track)
                            }
                        }
                    }

                case .playlists:
                    if playlistStore.playlists.isEmpty {
                        VitrEmptyLibraryCard(
                            symbol: "music.note.list",
                            title: "No playlists yet",
                            detail: "Tap + to create one, then add songs from Now Playing."
                        )
                    } else {
                        ForEach(playlistStore.playlists) { playlist in
                            VitrGlassCard(radius: 20, padding: 10) {
                                HStack(spacing: 12) {
                                    Button {
                                        if let first = playlistStore.tracks(in: playlist).first {
                                            onPlay(first)
                                        }
                                    } label: {
                                        HStack(spacing: 12) {
                                            Image(systemName: "music.note.list")
                                                .frame(width: 40, height: 40)
                                                .background(
                                                    Color.white.opacity(0.07),
                                                    in: RoundedRectangle(cornerRadius: 12)
                                                )
                                            VStack(alignment: .leading, spacing: 3) {
                                                Text(playlist.name)
                                                    .font(.subheadline.weight(.semibold))
                                                    .foregroundStyle(.white)
                                                Text("\(playlist.trackTitles.count) tracks")
                                                    .font(.caption)
                                                    .foregroundStyle(.secondary)
                                            }
                                        }
                                    }
                                    .buttonStyle(.plain)

                                    Spacer()

                                    Button(role: .destructive) {
                                        playlistStore.deletePlaylist(playlist.id)
                                    } label: {
                                        Image(systemName: "trash")
                                            .frame(width: 36, height: 36)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Delete playlist")
                                }
                            }
                        }
                    }

                case .artists:
                    let groups = Dictionary(grouping: tracks, by: \.artist)
                    ForEach(groups.keys.sorted(), id: \.self) { artist in
                        let artistTracks = groups[artist] ?? []
                        VitrLibraryGroupRow(
                            title: artist,
                            detail: "\(artistTracks.count) tracks",
                            symbol: "music.mic"
                        ) {
                            if let first = artistTracks.first {
                                onPlay(first)
                            }
                        }
                    }

                case .albums:
                    let groups = Dictionary(grouping: tracks, by: \.album)
                    ForEach(groups.keys.sorted(), id: \.self) { album in
                        let albumTracks = groups[album] ?? []
                        VitrLibraryGroupRow(
                            title: album,
                            detail:
                                albumTracks.first.map {
                                    "\($0.artist) • \(albumTracks.count) tracks"
                                }
                                ?? "\(albumTracks.count) tracks",
                            symbol: "square.stack"
                        ) {
                            if let first = albumTracks.first {
                                onPlay(first)
                            }
                        }
                    }

                case .songs:
                    ForEach(tracks) { track in
                        VitrTrackRow(track: track) {
                            onPlay(track)
                        }
                    }

                case .downloaded:
                    Button(action: onOpenDownloads) {
                        Label(
                            "Open Downloads",
                            systemImage: "arrow.down.circle.fill"
                        )
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(
                            Color(red: 0.91, green: 0.07, blue: 0.25)
                                .opacity(0.32),
                            in: Capsule()
                        )
                    }
                    .buttonStyle(.plain)

                    if downloads.items.isEmpty {
                        VitrEmptyLibraryCard(
                            symbol: "arrow.down.circle",
                            title: "No downloads yet",
                            detail: "Downloaded and synced music will appear here."
                        )
                    } else {
                        ForEach(downloads.items) { item in
                            let track = VitrTrack(downloaded: item)
                            VitrTrackRow(track: track) {
                                onPlay(track)
                            }
                        }
                    }

                case .recent:
                    HStack {
                        Text("Recently Played")
                            .font(.headline)
                        Spacer()
                        if !recentTracks.isEmpty {
                            Button("Clear Recently Played") {
                                showingClearRecent = true
                            }
                            .font(.caption.weight(.semibold))
                        }
                    }

                    if recentTracks.isEmpty {
                        VitrEmptyLibraryCard(
                            symbol: "clock.arrow.circlepath",
                            title: "Nothing played yet",
                            detail: "Your chronological listening history will appear here."
                        )
                    } else {
                        ForEach(recentTracks) { track in
                            VitrTrackRow(track: track) {
                                onPlay(track)
                            }
                        }
                    }
                }

                Color.clear.frame(height: 150)
            }
            .padding(.horizontal, 16)
        }
        .alert("Create a playlist", isPresented: $creatingPlaylist) {
            TextField("Playlist name", text: $newPlaylistName)
            Button("Create") {
                _ = playlistStore.createPlaylist(named: newPlaylistName)
                newPlaylistName = ""
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Name your new Vitr playlist.")
        }
        .confirmationDialog(
            "Clear Recently Played?",
            isPresented: $showingClearRecent,
            titleVisibility: .visible
        ) {
            Button(
                "Clear Recently Played",
                role: .destructive
            ) {
                localLibrary.clearRecentlyPlayed()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(
                "This removes listening history from this device. Your music, likes, playlists and downloads are kept."
            )
        }
    }
}

private struct VitrEmptyLibraryCard: View {
    let symbol: String
    let title: String
    let detail: String

    var body: some View {
        VitrGlassCard(radius: 22, padding: 16) {
            HStack(spacing: 13) {
                Image(systemName: symbol)
                    .font(.title3)
                    .foregroundStyle(
                        Color(red: 0.96, green: 0.08, blue: 0.27)
                    )
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct VitrLibraryGroupRow: View {
    let title: String
    let detail: String
    let symbol: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VitrGlassCard(radius: 20, padding: 12) {
                HStack(spacing: 12) {
                    Image(systemName: symbol)
                        .foregroundStyle(
                            Color(red: 0.96, green: 0.08, blue: 0.27)
                        )
                    VStack(alignment: .leading, spacing: 3) {
                        Text(title)
                            .font(.subheadline.weight(.semibold))
                        Text(detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: "play.fill")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

private enum VitrSearchCategory: String, CaseIterable, Identifiable {
    case songs = "Songs"
    case artists = "Artists"
    case albums = "Albums"
    case playlists = "Playlists"

    var id: String { rawValue }
}

private struct VitrSearchView: View {
    let tracks: [VitrTrack]
    @ObservedObject var playlistStore: VitrPlaylistStore
    @ObservedObject var localLibrary: VitrLocalLibraryStore
    let onPlay: (VitrTrack) -> Void

    @State private var query = ""
    @State private var category: VitrSearchCategory = .songs
    @StateObject private var remoteSearch = VitrRemoteSearchStore()

    private var filtered: [VitrTrack] {
        let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else {
            return tracks
        }

        guard remoteSearch.query == normalized else {
            return []
        }

        return remoteSearch.tracks
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                Text("Search")
                    .font(.system(size: 32, weight: .bold))
                    .padding(.top, 12)

                Text("Music only")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                VitrGlassCard(radius: 22, padding: 12) {
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(.secondary)
                        TextField(
                            "Songs, artists, albums, playlists",
                            text: $query
                        )
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit {
                            localLibrary.recordSearch(query)
                        }

                        if !query.isEmpty {
                            Button {
                                query = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.secondary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                Picker("Category", selection: $category) {
                    ForEach(VitrSearchCategory.allCases) {
                        Text($0.rawValue).tag($0)
                    }
                }
                .pickerStyle(.segmented)

                if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                   !localLibrary.searchHistory.isEmpty {
                    HStack {
                        Text("Recent Searches")
                            .font(.headline)
                        Spacer()
                        Button("Clear Search History") {
                            localLibrary.clearSearchHistory()
                        }
                        .font(.caption.weight(.semibold))
                    }

                    ForEach(localLibrary.searchHistory, id: \.self) { recent in
                        VitrGlassCard(radius: 18, padding: 10) {
                            HStack {
                                Button {
                                    query = recent
                                } label: {
                                    HStack {
                                        Image(systemName: "clock")
                                        Text(recent)
                                            .foregroundStyle(.white)
                                    }
                                }
                                .buttonStyle(.plain)

                                Spacer()

                                Button {
                                    localLibrary.removeSearch(recent)
                                } label: {
                                    Image(systemName: "xmark")
                                        .frame(width: 30, height: 30)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Remove recent search")
                            }
                        }
                    }
                } else {
                    if remoteSearch.isLoading {
                        ProgressView("Searching with yt-dlp…")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                    } else if let message = remoteSearch.message,
                              !message.isEmpty {
                        Text(message)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                    }

                    switch category {
                    case .songs:
                        ForEach(filtered) { track in
                            VitrTrackRow(track: track) {
                                localLibrary.recordSearch(query)
                                onPlay(track)
                            }
                        }

                    case .artists:
                        let groups = Dictionary(grouping: filtered, by: \.artist)
                        ForEach(groups.keys.sorted(), id: \.self) { artist in
                            let group = groups[artist] ?? []
                            VitrLibraryGroupRow(
                                title: artist,
                                detail: "\(group.count) tracks",
                                symbol: "music.mic"
                            ) {
                                localLibrary.recordSearch(query)
                                if let first = group.first {
                                    onPlay(first)
                                }
                            }
                        }

                    case .albums:
                        let groups = Dictionary(grouping: filtered, by: \.album)
                        ForEach(groups.keys.sorted(), id: \.self) { album in
                            let group = groups[album] ?? []
                            VitrLibraryGroupRow(
                                title: album,
                                detail:
                                    group.first.map {
                                        "\($0.artist) • \(group.count) tracks"
                                    }
                                    ?? "\(group.count) tracks",
                                symbol: "square.stack"
                            ) {
                                localLibrary.recordSearch(query)
                                if let first = group.first {
                                    onPlay(first)
                                }
                            }
                        }

                    case .playlists:
                        let visible = playlistStore.playlists.filter {
                            query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || $0.name.localizedCaseInsensitiveContains(query)
                        }

                        if visible.isEmpty {
                            VitrEmptyLibraryCard(
                                symbol: "music.note.list",
                                title: "No matching playlists",
                                detail: "Create a playlist from Library."
                            )
                        } else {
                            ForEach(visible) { playlist in
                                VitrLibraryGroupRow(
                                    title: playlist.name,
                                    detail: "\(playlist.trackTitles.count) tracks",
                                    symbol: "music.note.list"
                                ) {
                                    localLibrary.recordSearch(query)
                                    if let first = playlistStore.tracks(in: playlist).first {
                                        onPlay(first)
                                    }
                                }
                            }
                        }
                    }
                }

                Color.clear.frame(height: 150)
            }
            .padding(.horizontal, 16)
        }
        .task(id: query) {
            let normalized =
                query.trimmingCharacters(
                    in: .whitespacesAndNewlines
                )

            if normalized.isEmpty {
                remoteSearch.clear()
                return
            }

            do {
                try await Task.sleep(
                    nanoseconds: 350_000_000
                )
            } catch {
                return
            }

            guard !Task.isCancelled else {
                return
            }

            await remoteSearch.search(
                normalized
            )
        }
    }
}

private struct VitrTrackRow: View {
    let track: VitrTrack
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VitrGlassCard(radius: 20, padding: 9) {
                HStack(spacing: 12) {
                    VitrArtwork(track: track, size: 52, radius: 13)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(track.title)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                        Text("\(track.artist) · \(track.album)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white.opacity(0.42))
                }
            }
        }
        .buttonStyle(.plain)
    }
}

private struct VitrNowPlayingView: View {
    let track: VitrTrack
    @Binding var isPlaying: Bool
    @ObservedObject var playback: VitrPlaybackController
    @ObservedObject var lyricsStore: VitrLyricsStore
    @ObservedObject var playlistStore: VitrPlaylistStore
    @ObservedObject var localLibrary: VitrLocalLibraryStore
    let onClose: () -> Void
    @State private var progress = 0.44
    @State private var showLyrics = false
    @State private var showTrackActions = false
    @State private var showPlaylistPicker = false
    @State private var createPlaylistForTrack = false
    @State private var newPlaylistName = ""
    @State private var trackActionStatus: String?

    var body: some View {
        ZStack {
            VitrLiquidBackground(
                accent: track.colors.first ?? .pink,
                secondary: track.colors.last ?? .blue,
                reduceMotion: false
            )

            ScrollView(showsIndicators: false) {
                VStack(spacing: 20) {
                    HStack {
                        Button(action: onClose) {
                            Image(systemName: "chevron.down")
                                .font(.headline)
                                .frame(width: 38, height: 38)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                        .buttonStyle(.plain)

                        Spacer()

                        VitrDropLogo(size: 28)

                        Text("vitr")
                            .font(.headline.weight(.bold))

                        Spacer()

                        Button {
                            showTrackActions = true
                        } label: {
                            Image(systemName: "ellipsis")
                                .frame(width: 38, height: 38)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Track actions")
                    }

                    VitrArtwork(track: track, size: 318, radius: 28)

                    HStack(alignment: .center) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(track.title)
                                .font(.title2.weight(.bold))
                            Text(track.artist)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button {
                            openPlaylistPickerForTrack()
                        } label: {
                            Image(systemName: "plus.circle.fill")
                                .font(.title2)
                                .foregroundStyle(Color(red: 1.0, green: 0.28, blue: 0.44))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Add to playlist")

                        Button {
                            localLibrary.toggleLike(track)
                            UIImpactFeedbackGenerator(style: .light)
                                .impactOccurred()
                        } label: {
                            Image(
                                systemName:
                                    localLibrary.isLiked(track)
                                    ? "heart.fill"
                                    : "heart"
                            )
                            .font(.title3)
                            .foregroundStyle(
                                localLibrary.isLiked(track)
                                ? Color(red: 0.96, green: 0.08, blue: 0.27)
                                : Color.white.opacity(0.72)
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(
                            localLibrary.isLiked(track)
                            ? "Remove from Liked Songs"
                            : "Add to Liked Songs"
                        )
                    }

                    Slider(
                        value: Binding(
                            get: {
                                if playback.currentTrack?.id == track.id,
                                   playback.duration > 0 {
                                    return min(max(playback.position / playback.duration, 0), 1)
                                }
                                return progress
                            },
                            set: { value in
                                progress = value
                                if playback.currentTrack?.id == track.id {
                                    playback.seek(toFraction: value)
                                }
                            }
                        ),
                        in: 0...1
                    )
                    .tint(Color(red: 0.91, green: 0.07, blue: 0.25))
                    .accessibilityLabel("Playback position")

                    HStack {
                        Text(
                            formatTime(
                                playback.currentTrack?.id == track.id
                                    ? playback.position
                                    : progress * track.durationSeconds
                            )
                        )
                        Spacer()
                        Text(
                            formatTime(
                                playback.currentTrack?.id == track.id && playback.duration > 0
                                    ? playback.duration
                                    : track.durationSeconds
                            )
                        )
                    }
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)

                    HStack(spacing: 18) {
                        playerButton(
                            "shuffle",
                            size: 17,
                            emphasized: playback.shuffleEnabled
                        ) {
                            playback.toggleShuffle()
                        }

                        playerButton("backward.end.fill", size: 21) {
                            playback.previous()
                        }

                        Button {
                            withAnimation(.spring(response: 0.28, dampingFraction: 0.72)) {
                                if playback.currentTrack?.id == track.id {
                                    playback.togglePlayPause()
                                    isPlaying = playback.isPlaying
                                } else {
                                    isPlaying.toggle()
                                }
                            }
                        } label: {
                            Image(
                                systemName:
                                    (
                                        playback.currentTrack?.id == track.id
                                        ? playback.isPlaying
                                        : isPlaying
                                    )
                                    ? "pause.fill"
                                    : "play.fill"
                            )
                            .font(.system(size: 28, weight: .bold))
                            .frame(width: 68, height: 68)
                            .background(
                                LinearGradient(
                                    colors: [
                                        Color(red: 0.96, green: 0.08, blue: 0.27),
                                        Color(red: 0.60, green: 0.02, blue: 0.14)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                in: Circle()
                            )
                            .shadow(
                                color: Color(red: 0.91, green: 0.07, blue: 0.25).opacity(0.42),
                                radius: 22
                            )
                        }
                        .buttonStyle(.plain)

                        playerButton("forward.end.fill", size: 21) {
                            playback.next()
                        }

                        playerButton(
                            playback.repeatMode == 2 ? "repeat.1" : "repeat",
                            size: 17,
                            emphasized: playback.repeatMode != 0
                        ) {
                            playback.cycleRepeatMode()
                        }
                        .accessibilityLabel(
                            playback.repeatMode == 2
                                ? "Repeat track"
                                : playback.repeatMode == 1
                                    ? "Repeat all"
                                    : "Repeat off"
                        )
                    }

                    VitrGlassCard(radius: 22, padding: 12) {
                        HStack(spacing: 10) {
                            Image(systemName: "speaker.wave.2.fill")
                                .foregroundStyle(
                                    Color(red: 0.96, green: 0.08, blue: 0.27)
                                )

                            Slider(
                                value: Binding(
                                    get: { playback.volume },
                                    set: { playback.volume = $0 }
                                ),
                                in: 0...1
                            )
                            .tint(Color(red: 0.91, green: 0.07, blue: 0.25))
                            .accessibilityLabel("Volume")

                            Text("\(Int(playback.volume * 100))%")
                                .font(.caption.monospacedDigit().weight(.bold))
                                .frame(width: 42, alignment: .trailing)
                        }
                    }

                    VitrPlayerPill(
                        icon: "quote.bubble",
                        title: "Lyrics"
                    ) {
                        showLyrics = true
                    }

                    if let trackActionStatus {
                        Text(trackActionStatus)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }

                    Color.clear.frame(height: 28)
                }
                .padding(.horizontal, 18)
                .padding(.top, 10)
            }
        }
        .preferredColorScheme(.dark)
        .sheet(
            isPresented:
                $showLyrics
        ) {
            VitrLyricsSheet(
                track: track,
                store: lyricsStore,
                currentSeconds:
                    playback.currentTrack?.id == track.id
                    ? playback.position
                    : progress * track.durationSeconds
            )
            .preferredColorScheme(
                .dark
            )
        }
        .confirmationDialog(
            "Track actions",
            isPresented: $showTrackActions,
            titleVisibility: .visible
        ) {
            Button("Add to playlist") {
                openPlaylistPickerForTrack()
            }
            if track.sourceVideoID != nil {
                Button("Download") {
                    downloadTrackFromActions()
                }
            }
            Button("Lyrics") {
                showLyrics = true
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog(
            "Add to playlist",
            isPresented: $showPlaylistPicker,
            titleVisibility: .visible
        ) {
            ForEach(playlistStore.playlists) { playlist in
                Button(playlist.name) {
                    playlistStore.addTrack(track, to: playlist.id)
                }
            }
            Button("New playlist") {
                newPlaylistName = ""
                createPlaylistForTrack = true
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Create a playlist", isPresented: $createPlaylistForTrack) {
            TextField("Playlist name", text: $newPlaylistName)
            Button("Create & Add") {
                _ = playlistStore.createPlaylist(named: newPlaylistName, adding: track)
                newPlaylistName = ""
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("No playlists yet? Create one and this track will be added automatically.")
        }
    }

    private func openPlaylistPickerForTrack() {
        if playlistStore.playlists.isEmpty {
            newPlaylistName = ""
            createPlaylistForTrack = true
        } else {
            showPlaylistPicker = true
        }
    }

    private func downloadTrackFromActions() {
        guard track.sourceVideoID != nil else {
            trackActionStatus = "This track is already local or cannot be downloaded."
            return
        }

        trackActionStatus = "Downloading with Seal…"

        Task { @MainActor in
            do {
                let item =
                    try await VitrSealDownloadService
                        .shared
                        .download(track)
                trackActionStatus =
                    "Downloaded \(item.title)."
            } catch {
                trackActionStatus =
                    "Download failed."
            }
        }
    }

    private func playerButton(
        _ symbol: String,
        size: CGFloat,
        emphasized: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: size, weight: .semibold))
                .frame(width: 42, height: 42)
                .background(
                    emphasized
                        ? Color(red: 0.91, green: 0.07, blue: 0.25).opacity(0.32)
                        : Color.white.opacity(0.07),
                    in: Circle()
                )
        }
        .buttonStyle(.plain)
    }

    private func formatTime(_ rawSeconds: TimeInterval) -> String {
        guard rawSeconds.isFinite, rawSeconds >= 0 else { return "0:00" }
        let seconds = Int(rawSeconds.rounded(.down))
        return "\(seconds / 60):\(String(format: "%02d", seconds % 60))"
    }
}

private struct VitrWaveProgress: View {
    let progress: Double

    var body: some View {
        GeometryReader { proxy in
            HStack(alignment: .center, spacing: 2) {
                ForEach(0..<48, id: \.self) { index in
                    let ratio = Double(index) / 47.0
                    let height = 6 + abs(sin(Double(index) * 0.63)) * 18
                    Capsule()
                        .fill(
                            ratio <= progress
                                ? Color(red: 1.0, green: 0.28, blue: 0.44)
                                : Color.white.opacity(0.28)
                        )
                        .frame(
                            width: max(2, (proxy.size.width - 94) / 48),
                            height: height
                        )
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

private struct VitrPlayerPill: View {
    let icon: String
    let title: String
    let action: () -> Void

    var body: some View {
        Button(
            action: action
        ) {
            Label(
                title,
                systemImage: icon
            )
            .font(
                .caption
                    .weight(
                        .semibold
                    )
            )
            .frame(
                maxWidth:
                    .infinity
            )
            .padding(
                .vertical,
                11
            )
            .background(
                .ultraThinMaterial,
                in: Capsule()
            )
            .overlay(
                Capsule()
                    .stroke(
                        .white.opacity(
                            0.16
                        ),
                        lineWidth: 1
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

private struct VitrLyricsSheet: View {
    let track: VitrTrack
    @ObservedObject var store: VitrLyricsStore
    let currentSeconds: Double

    var body: some View {
        NavigationStack {
            ScrollView(
                showsIndicators: false
            ) {
                VStack(
                    alignment: .leading,
                    spacing: 14
                ) {
                    VStack(
                        alignment: .leading,
                        spacing: 4
                    ) {
                        Text(track.title)
                            .font(
                                .title2
                                    .weight(
                                        .bold
                                    )
                            )

                        Text(track.artist)
                            .foregroundStyle(
                                .secondary
                            )
                    }

                    if store.isLoading {
                        ProgressView(
                            "Loading lyrics…"
                        )
                    } else if
                        store.lines.isEmpty {
                        Text(
                            store.message
                            ?? "No lyrics available"
                        )
                        .foregroundStyle(
                            .secondary
                        )
                    } else {
                        ForEach(
                            store.lines
                        ) { line in
                            let active =
                                store.synced
                                && store.activeLineID(
                                    at:
                                        currentSeconds
                                )
                                    == line.id

                            Text(line.text)
                                .font(
                                    active
                                    ? .title3
                                        .weight(
                                            .bold
                                        )
                                    : .body
                                )
                                .foregroundStyle(
                                    active
                                    ? Color.white
                                    : Color.white
                                        .opacity(
                                            0.62
                                        )
                                )
                                .padding(
                                    .vertical,
                                    3
                                )
                        }
                    }

                    if let source =
                        store.source {
                        Text(
                            "Lyrics · \(source)"
                        )
                        .font(.caption2)
                        .foregroundStyle(
                            .secondary
                        )
                        .padding(
                            .top,
                            8
                        )
                    }
                }
                .padding(18)
            }
            .navigationTitle(
                "Lyrics"
            )
            .navigationBarTitleDisplayMode(
                .inline
            )
        }
    }
}

private struct VitrSettingsView: View {
    @State private var showResetConfirmation = false

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Settings")
                        .font(.system(size: 32, weight: .bold))
                        .padding(.top, 12)

                    VitrGlassCard(radius: 26, padding: 4) {
                        VStack(spacing: 0) {
                            VitrSettingsLink(
                                icon: "paintbrush",
                                title: "Appearance"
                            ) {
                                VitrAppearanceSettings()
                            }
                            divider
                            VitrSettingsLink(
                                icon: "waveform",
                                title: "Audio Quality"
                            ) {
                                VitrAudioSettings(title: "Audio Quality")
                            }
                            divider
                            VitrSettingsLink(
                                icon: "arrow.down.circle",
                                title: "Downloads"
                            ) {
                                VitrDownloadsView()
                            }
                            divider
                            VitrSettingsLink(
                                icon: "slider.horizontal.3",
                                title: "Equalizer"
                            ) {
                                VitrEqualizerSettings()
                            }
                            divider
                            VitrSettingsLink(
                                icon: "moon.zzz",
                                title: "Sleep Timer"
                            ) {
                                VitrSleepTimerSettings()
                            }
                            divider
                            VitrSettingsLink(
                                icon: "arrow.triangle.2.circlepath",
                                title: "Vitr Sync"
                            ) {
                                VitrDeviceSyncView()
                            }
                            divider
                            VitrSettingsLink(
                                icon: "globe",
                                title: "Language"
                            ) {
                                VitrGeneralSettings()
                            }
                            divider
                            VitrSettingsLink(
                                icon: "internaldrive",
                                title: "Storage"
                            ) {
                                VitrStorageSettings()
                            }
                        }
                    }

                    VitrGlassCard(radius: 26, padding: 4) {
                        VitrSettingsLink(
                            icon: "info.circle",
                            title: "About Vitr"
                        ) {
                            VitrAboutView()
                        }
                    }

                    Button {
                        showResetConfirmation = true
                    } label: {
                        Label(
                            "Reset Vitr",
                            systemImage: "exclamationmark.arrow.triangle.2.circlepath"
                        )
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(
                            Color.red.opacity(0.10),
                            in: RoundedRectangle(
                                cornerRadius: 18,
                                style: .continuous
                            )
                        )
                        .overlay(
                            RoundedRectangle(
                                cornerRadius: 18,
                                style: .continuous
                            )
                            .stroke(
                                Color.red.opacity(0.36),
                                lineWidth: 1
                            )
                        )
                    }
                    .buttonStyle(.plain)

                    Color.clear.frame(height: 150)
                }
                .padding(.horizontal, 16)
            }
            .toolbar(.hidden, for: .navigationBar)
            .confirmationDialog(
                "Reset Vitr?",
                isPresented: $showResetConfirmation,
                titleVisibility: .visible
            ) {
                Button(
                    "Reset Vitr",
                    role: .destructive
                ) {
                    resetVitr()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(
                    "This will erase your local Vitr library data, playlists, likes, listening history, downloads, search history, settings and this device's Sync configuration. Windows, other devices and server-side music are not deleted."
                )
            }
        }
    }

    private func resetVitr() {
        VitrPlaybackController.shared.clearLocalPlaybackState()
        VitrDownloadLibrary.shared.removeAll()
        VitrPlaylistStore.shared.reset()
        VitrLocalLibraryStore.shared.reset()

        let defaults = UserDefaults.standard
        defaults.dictionaryRepresentation()
            .keys
            .filter { $0.hasPrefix("vitr.") }
            .forEach(defaults.removeObject(forKey:))

        URLCache.shared.removeAllCachedResponses()
        clearDirectory(
            FileManager.default.urls(
                for: .cachesDirectory,
                in: .userDomainMask
            ).first
        )

        defaults.set("system", forKey: "vitr.language")
        defaults.set(true, forKey: "vitr.playerGestures")
        defaults.set(true, forKey: "vitr.autoUpdates")
        defaults.set(false, forKey: "vitr.reduceMotion")
        defaults.set("liquid_glass", forKey: "vitr.appearanceMode")
        defaults.set(true, forKey: "vitr.liquidEffects")
        defaults.set("normal", forKey: "vitr.animationIntensity")
        defaults.set("standard", forKey: "vitr.miniPlayerMode")
        defaults.set("mp3", forKey: "vitr.download.format")
        defaults.set("320", forKey: "vitr.download.quality")
        defaults.set("Normal", forKey: "vitr.equalizer.preset")

        NotificationCenter.default.post(
            name: Notification.Name("vitrDidReset"),
            object: nil
        )
    }

    private func clearDirectory(_ directory: URL?) {
        guard let directory else { return }
        let contents =
            (try? FileManager.default.contentsOfDirectory(
                at: directory,
                includingPropertiesForKeys: nil
            )) ?? []
        contents.forEach {
            try? FileManager.default.removeItem(at: $0)
        }
    }

    private var divider: some View {
        Divider()
            .overlay(Color.white.opacity(0.08))
            .padding(.horizontal, 12)
    }
}

private struct VitrSettingsLink<Destination: View>: View {
    let icon: String
    let title: String
    @ViewBuilder let destination: () -> Destination

    var body: some View {
        NavigationLink(destination: destination()) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .frame(width: 28, height: 28)
                    .background(Color.white.opacity(0.06), in: Circle())
                Text(title)
                    .font(.subheadline.weight(.medium))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 13)
        }
        .buttonStyle(.plain)
    }
}

private struct VitrGeneralSettings: View {
    @AppStorage("vitr.language") private var language = "system"
    @AppStorage("vitr.playerGestures") private var gestures = true

    var body: some View {
        VitrSettingsPage(title: "Language") {
            Picker("Language", selection: $language) {
                Text("System").tag("system")
                Text("English").tag("en")
                Text("Deutsch").tag("de")
                Text("Français").tag("fr")
                Text("Italiano").tag("it")
                Text("Español").tag("es")
                Text("Português").tag("pt")
                Text("Nederlands").tag("nl")
                Text("Svenska").tag("sv")
                Text("Norsk").tag("no")
                Text("Dansk").tag("da")
                Text("Suomi").tag("fi")
                Text("Polski").tag("pl")
                Text("Čeština").tag("cs")
                Text("Türkçe").tag("tr")
                Text("Русский").tag("ru")
                Text("Українська").tag("uk")
                Text("Ελληνικά").tag("el")
                Text("العربية").tag("ar")
                Text("فارسی").tag("fa")
                Text("עברית").tag("he")
                Text("اردو").tag("ur")
                Text("हिन्दी").tag("hi")
                Text("বাংলা").tag("bn")
                Text("中文").tag("zh")
                Text("日本語").tag("ja")
                Text("한국어").tag("ko")
                Text("Bahasa Indonesia").tag("id")
                Text("Bahasa Melayu").tag("ms")
                Text("ไทย").tag("th")
                Text("Tiếng Việt").tag("vi")
            }
            .pickerStyle(.menu)

            Toggle("Player gestures", isOn: $gestures)
        }
    }
}

private struct VitrAppearanceSettings: View {
    @AppStorage("vitr.appearanceMode")
    private var appearanceMode = "liquid_glass"

    @AppStorage("vitr.liquidEffects")
    private var liquidEffects = true

    @AppStorage("vitr.animationIntensity")
    private var animationIntensity = "normal"

    @AppStorage("vitr.reduceMotion")
    private var reduceMotion = false

    @AppStorage("vitr.miniPlayerMode")
    private var miniPlayerMode = "standard"

    var body: some View {
        VitrSettingsPage(title: "Appearance") {
            Picker("Appearance", selection: $appearanceMode) {
                Text("Normal").tag("normal")
                Text("Liquid Glass").tag("liquid_glass")
            }
            .pickerStyle(.segmented)

            Text(
                appearanceMode == "normal"
                    ? "Fast. Dark. Minimal. Sharp."
                    : "Fluid. Reflective. Wet. Deep. Cinematic. Alive."
            )
            .font(.caption)
            .foregroundStyle(.secondary)

            if appearanceMode == "liquid_glass" {
                Toggle("Liquid Effects", isOn: $liquidEffects)

                Picker(
                    "Animation Intensity",
                    selection: $animationIntensity
                ) {
                    Text("Reduced").tag("reduced")
                    Text("Normal").tag("normal")
                    Text("High").tag("high")
                }
                .pickerStyle(.segmented)
            }

            Toggle("Reduce Motion", isOn: $reduceMotion)

            Picker("Mini player", selection: $miniPlayerMode) {
                Text("Standard").tag("standard")
                Text("Lyrics").tag("lyrics")
            }
            .pickerStyle(.segmented)
        }
    }
}

private struct VitrAudioSettings: View {
    let title: String

    @AppStorage("vitr.download.format")
    private var format = "mp3"

    @AppStorage("vitr.download.quality")
    private var quality = "320"

    var body: some View {
        VitrSettingsPage(title: title) {
            Picker("Default format", selection: $format) {
                Text("M4A").tag("m4a")
                Text("MP3").tag("mp3")
                Text("FLAC").tag("flac")
                Text("WAV").tag("wav")
            }
            .pickerStyle(.segmented)

            Picker("Audio quality", selection: $quality) {
                Text("192 kbps").tag("192")
                Text("256 kbps").tag("256")
                Text("320 kbps").tag("320")
                Text("Lossless").tag("lossless")
            }
            .pickerStyle(.menu)

            Text("Downloaded music is stored locally in Files/Vitr and remains playable offline.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

private struct VitrEqualizerSettings: View {
    @AppStorage("vitr.equalizer.preset")
    private var preset = "Normal"

    private let presets = [
        "Normal",
        "Bass",
        "Treble",
        "Vocal",
        "Electronic",
        "Custom"
    ]

    var body: some View {
        VitrSettingsPage(title: "Equalizer") {
            Picker("Preset", selection: $preset) {
                ForEach(presets, id: \.self) {
                    Text($0).tag($0)
                }
            }
            .pickerStyle(.menu)

            Text(
                "The selected Vitr equalizer preset is stored locally on this device."
            )
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }
}

private struct VitrSleepTimerSettings: View {
    @ObservedObject private var playback =
        VitrPlaybackController.shared

    @State private var customMinutes = 90.0

    var body: some View {
        VitrSettingsPage(title: "Sleep Timer") {
            if playback.sleepAtEndOfTrack {
                Text("Active • End of track")
                    .font(.headline)
            } else if playback.sleepTimerRemaining > 0 {
                Text(
                    "Remaining • \(formatRemaining(playback.sleepTimerRemaining))"
                )
                .font(.headline)
            } else {
                Text("No sleep timer active")
                    .foregroundStyle(.secondary)
            }

            Button("End of track") {
                playback.setSleepAtEndOfTrack()
            }
            .buttonStyle(.bordered)

            HStack {
                ForEach([15, 30, 45, 60], id: \.self) { minutes in
                    Button(
                        minutes == 60
                            ? "1 hour"
                            : "\(minutes)m"
                    ) {
                        playback.setSleepTimer(
                            minutes: Double(minutes)
                        )
                    }
                    .buttonStyle(.bordered)
                }
            }

            Stepper(
                "Custom • \(Int(customMinutes)) minutes",
                value: $customMinutes,
                in: 5...480,
                step: 5
            )

            Button("Start Custom") {
                playback.setSleepTimer(
                    minutes: customMinutes
                )
            }
            .buttonStyle(.borderedProminent)
            .tint(
                Color(red: 0.91, green: 0.07, blue: 0.25)
            )

            Button(
                "Cancel Sleep Timer",
                role: .destructive
            ) {
                playback.cancelSleepTimer()
            }
        }
    }

    private func formatRemaining(
        _ seconds: TimeInterval
    ) -> String {
        let total = max(Int(seconds), 0)
        return String(
            format: "%d:%02d:%02d",
            total / 3600,
            (total % 3600) / 60,
            total % 60
        )
    }
}

private struct VitrStorageSettings: View {
    @ObservedObject private var downloads =
        VitrDownloadLibrary.shared

    @State private var showDeleteAll = false

    var body: some View {
        VitrSettingsPage(title: "Storage") {
            storageRow(
                "Downloaded Music",
                bytes: downloads.approximateStorageBytes
            )
            storageRow(
                "Artwork Cache",
                bytes: cacheBytes
            )
            storageRow(
                "Metadata / Local Database",
                bytes: 0
            )
            storageRow(
                "Temporary Files",
                bytes: cacheBytes
            )

            Button("Clear Cache") {
                URLCache.shared.removeAllCachedResponses()
                clearCacheDirectory()
            }
            .buttonStyle(.bordered)

            Button(
                "Delete All Downloads",
                role: .destructive
            ) {
                showDeleteAll = true
            }
            .disabled(downloads.items.isEmpty)
        }
        .confirmationDialog(
            "Delete All Downloads?",
            isPresented: $showDeleteAll,
            titleVisibility: .visible
        ) {
            Button(
                "Delete All Downloads",
                role: .destructive
            ) {
                VitrPlaybackController.shared.clearLocalPlaybackState()
                downloads.removeAll()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(
                "Only downloaded music on this device will be removed."
            )
        }
    }

    @ViewBuilder
    private func storageRow(
        _ title: String,
        bytes: Int64
    ) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(ByteCountFormatter.string(
                fromByteCount: bytes,
                countStyle: .file
            ))
            .foregroundStyle(.secondary)
        }
    }

    private var cacheBytes: Int64 {
        let directory = FileManager.default.urls(
            for: .cachesDirectory,
            in: .userDomainMask
        ).first

        return ((try? FileManager.default.contentsOfDirectory(
            at: directory!,
            includingPropertiesForKeys: [.fileSizeKey]
        )) ?? [])
            .reduce(into: Int64(0)) { total, url in
                let values = try? url.resourceValues(
                    forKeys: [.fileSizeKey]
                )
                total += Int64(values?.fileSize ?? 0)
            }
    }

    private func clearCacheDirectory() {
        guard let directory = FileManager.default.urls(
            for: .cachesDirectory,
            in: .userDomainMask
        ).first else {
            return
        }

        let files = (try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil
        )) ?? []

        files.forEach {
            try? FileManager.default.removeItem(at: $0)
        }
    }
}

private struct VitrSettingsPage<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        ZStack {
            VitrLiquidBackground(
                accent: Color(red: 0.96, green: 0.08, blue: 0.27),
                secondary: Color(red: 0.45, green: 0.01, blue: 0.11),
                reduceMotion: true
            )

            ScrollView {
                VitrGlassCard(radius: 28, padding: 18) {
                    VStack(alignment: .leading, spacing: 18) {
                        content()
                    }
                }
                .padding(16)
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.dark)
    }
}

private struct VitrAboutView: View {
    @Environment(\.openURL)
    private var openURL

    var body: some View {
        ZStack {
            VitrLiquidBackground(
                accent: Color(red: 0.96, green: 0.08, blue: 0.27),
                secondary: Color(red: 0.45, green: 0.01, blue: 0.11),
                reduceMotion: true
            )

            ScrollView {
                VitrGlassCard(radius: 30, padding: 22) {
                    VStack(spacing: 16) {
                        VitrDropLogo(size: 64)

                        Text("vitr")
                            .font(.title2.weight(.black))

                        Text("made by blood")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)

                        Text("Music flows different here.")
                            .font(.subheadline)
                            .multilineTextAlignment(.center)

                        Text(
                            "Version \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.5.3")"
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)

                        externalLinkButton(
                            imageName: "GitHubMark",
                            text: "github.com/bloodvitr/vitr",
                            url: URL(
                                string: "https://github.com/bloodvitr/vitr"
                            )!
                        )

                        externalLinkButton(
                            imageName: "KoFiMark",
                            text: "ko-fi.com/bloodvitr",
                            url: URL(
                                string: "https://ko-fi.com/bloodvitr"
                            )!
                        )
                    }
                }
                .padding(16)
            }
        }
        .navigationTitle("About Vitr")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.dark)
    }

    private func externalLinkButton(
        imageName: String,
        text: String,
        url: URL
    ) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light)
                .impactOccurred()
            openURL(url)
        } label: {
            HStack(spacing: 12) {
                Image(imageName)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 23, height: 23)

                Text(text)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .background(
                .ultraThinMaterial,
                in: Capsule()
            )
            .overlay(
                Capsule()
                    .stroke(
                        Color(red: 0.96, green: 0.08, blue: 0.27)
                            .opacity(0.32),
                        lineWidth: 1
                    )
            )
        }
        .buttonStyle(.plain)
        .foregroundStyle(.white)
    }
}

private struct VitrDropLogo: View {
    let size: CGFloat

    var body: some View {
        VitrDropShape()
            .fill(
                LinearGradient(
                    colors: [
                        Color(red: 1.0, green: 0.30, blue: 0.47),
                        Color(red: 0.88, green: 0.08, blue: 0.30)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(
                width: size * 0.82,
                height: size
            )
            .shadow(
                color: Color.pink.opacity(0.36),
                radius: 14
            )
    }
}

private struct VitrDropShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()

        path.move(
            to: CGPoint(
                x: rect.midX,
                y: rect.minY
            )
        )

        path.addCurve(
            to: CGPoint(
                x: rect.maxX,
                y: rect.height * 0.63
            ),
            control1: CGPoint(
                x: rect.width * 0.70,
                y: rect.height * 0.25
            ),
            control2: CGPoint(
                x: rect.maxX,
                y: rect.height * 0.46
            )
        )

        path.addCurve(
            to: CGPoint(
                x: rect.midX,
                y: rect.maxY
            ),
            control1: CGPoint(
                x: rect.maxX,
                y: rect.height * 0.84
            ),
            control2: CGPoint(
                x: rect.width * 0.74,
                y: rect.maxY
            )
        )

        path.addCurve(
            to: CGPoint(
                x: rect.minX,
                y: rect.height * 0.63
            ),
            control1: CGPoint(
                x: rect.width * 0.26,
                y: rect.maxY
            ),
            control2: CGPoint(
                x: rect.minX,
                y: rect.height * 0.84
            )
        )

        path.addCurve(
            to: CGPoint(
                x: rect.midX,
                y: rect.minY
            ),
            control1: CGPoint(
                x: rect.minX,
                y: rect.height * 0.46
            ),
            control2: CGPoint(
                x: rect.width * 0.30,
                y: rect.height * 0.25
            )
        )

        path.closeSubpath()
        return path
    }
}
