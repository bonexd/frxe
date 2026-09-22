import AVFoundation
import Foundation
import MediaPlayer
import SwiftUI

@MainActor
final class VitrPlaybackController: NSObject, ObservableObject, @preconcurrency AVAudioPlayerDelegate {
    static let shared = VitrPlaybackController()

    @Published private(set) var currentTrack: VitrTrack?
    @Published private(set) var queue: [VitrTrack] = []
    @Published private(set) var currentIndex: Int = -1
    @Published private(set) var isPlaying = false
    @Published private(set) var position: TimeInterval = 0
    @Published private(set) var duration: TimeInterval = 0
    @Published var volume: Double = 0.8 {
        didSet {
            let normalized = min(max(volume, 0), 1)
            if normalized != volume {
                volume = normalized
                return
            }
            player?.volume = Float(normalized)
            UserDefaults.standard.set(normalized, forKey: "vitr.playback.volume")
        }
    }

    @Published private(set) var shuffleEnabled = false
    @Published private(set) var repeatMode = 0
    @Published private(set) var sleepTimerEndDate: Date?
    @Published private(set) var sleepAtEndOfTrack = false

    private var player: AVAudioPlayer?
    private var timer: Timer?

    private override init() {
        super.init()

        let defaults = UserDefaults.standard
        volume =
            defaults.object(
                forKey: "vitr.playback.volume"
            ) as? Double
            ?? 0.8
        shuffleEnabled =
            defaults.bool(
                forKey: "vitr.playback.shuffle"
            )
        repeatMode =
            defaults.integer(
                forKey: "vitr.playback.repeatMode"
            )

        let storedSleepEnd =
            defaults.double(
                forKey: "vitr.sleepTimer.endDate"
            )
        if storedSleepEnd >
            Date().timeIntervalSince1970 {
            sleepTimerEndDate =
                Date(
                    timeIntervalSince1970:
                        storedSleepEnd
                )
        }

        configureAudioSession()
        configureRemoteCommands()
        restorePlaybackState()
    }

    deinit {
        timer?.invalidate()
    }

    @discardableResult
    func play(
        _ track: VitrTrack,
        queue requestedQueue: [VitrTrack]? = nil,
        startAt: TimeInterval? = nil
    ) -> Bool {
        let resolvedQueue = requestedQueue?.isEmpty == false ? requestedQueue! : [track]
        queue = resolvedQueue

        if let matching = resolvedQueue.firstIndex(where: { $0.id == track.id }) {
            currentIndex = matching
        } else {
            queue = [track]
            currentIndex = 0
        }

        guard let url = playableURL(for: track) else {
            currentTrack = track
            isPlaying = false
            position = 0
            duration = track.durationSeconds
            updateNowPlaying()
            return false
        }

        do {
            let next = try AVAudioPlayer(contentsOf: url)
            next.delegate = self
            next.volume = Float(volume)
            next.prepareToPlay()

            if let startAt {
                next.currentTime = min(max(startAt, 0), next.duration)
            }

            player?.stop()
            player = next
            currentTrack = track
            duration = next.duration
            position = next.currentTime

            next.play()
            isPlaying = next.isPlaying
            startProgressTimer()
            persistPlaybackState()
            updateNowPlaying()
            return true
        } catch {
            player = nil
            currentTrack = track
            isPlaying = false
            position = 0
            duration = track.durationSeconds
            updateNowPlaying()
            return false
        }
    }

    @discardableResult
    func playDownloaded(
        _ item: VitrDownloadedItem,
        queue items: [VitrDownloadedItem]? = nil
    ) -> Bool {
        let mappedQueue = (items ?? [item]).map(VitrTrack.init(downloaded:))
        let track = VitrTrack(downloaded: item)
        return play(track, queue: mappedQueue)
    }

    func togglePlayPause() {
        guard let player else {
            if let currentTrack {
                _ = play(currentTrack, queue: queue)
            }
            return
        }

        if player.isPlaying {
            player.pause()
        } else {
            do {
                try AVAudioSession.sharedInstance().setActive(true)
            } catch {
            }
            player.play()
        }

        isPlaying = player.isPlaying
        persistPlaybackState()
        updateNowPlaying()
    }

    func pause() {
        player?.pause()
        isPlaying = false
        persistPlaybackState()
        updateNowPlaying()
    }

    func next() {
        guard !queue.isEmpty else { return }

        let nextIndex: Int
        if shuffleEnabled, queue.count > 1 {
            let candidates = queue.indices.filter { $0 != currentIndex }
            nextIndex = candidates.randomElement() ?? min(currentIndex + 1, queue.count - 1)
        } else if currentIndex < queue.count - 1 {
            nextIndex = currentIndex + 1
        } else if repeatMode == 1 {
            nextIndex = 0
        } else {
            return
        }

        currentIndex = nextIndex
        _ = play(queue[nextIndex], queue: queue)
    }

    func toggleShuffle() {
        shuffleEnabled.toggle()
        UserDefaults.standard.set(
            shuffleEnabled,
            forKey: "vitr.playback.shuffle"
        )
    }

    func cycleRepeatMode() {
        repeatMode = (repeatMode + 1) % 3
        UserDefaults.standard.set(
            repeatMode,
            forKey: "vitr.playback.repeatMode"
        )
    }

    func setSleepTimer(minutes: Double?) {
        sleepAtEndOfTrack = false

        guard let minutes, minutes > 0 else {
            sleepTimerEndDate = nil
            UserDefaults.standard.removeObject(
                forKey: "vitr.sleepTimer.endDate"
            )
            return
        }

        let endDate = Date().addingTimeInterval(minutes * 60)
        sleepTimerEndDate = endDate
        UserDefaults.standard.set(
            endDate.timeIntervalSince1970,
            forKey: "vitr.sleepTimer.endDate"
        )
    }

    func setSleepAtEndOfTrack() {
        sleepTimerEndDate = nil
        sleepAtEndOfTrack = true
        UserDefaults.standard.removeObject(
            forKey: "vitr.sleepTimer.endDate"
        )
    }

    func cancelSleepTimer() {
        sleepTimerEndDate = nil
        sleepAtEndOfTrack = false
        UserDefaults.standard.removeObject(
            forKey: "vitr.sleepTimer.endDate"
        )
    }

    var sleepTimerRemaining: TimeInterval {
        guard let sleepTimerEndDate else { return 0 }
        return max(
            sleepTimerEndDate.timeIntervalSinceNow,
            0
        )
    }

    func previous() {
        if let player, player.currentTime > 4 {
            player.currentTime = 0
            position = 0
            persistPlaybackState()
            updateNowPlaying()
            return
        }

        guard !queue.isEmpty else { return }
        let previousIndex = max(currentIndex - 1, 0)
        currentIndex = previousIndex
        _ = play(queue[previousIndex], queue: queue)
    }

    func seek(toFraction fraction: Double) {
        guard let player else { return }
        let normalized = min(max(fraction, 0), 1)
        player.currentTime = player.duration * normalized
        position = player.currentTime
        persistPlaybackState()
        updateNowPlaying()
    }

    func seek(to time: TimeInterval) {
        guard let player else { return }
        player.currentTime = min(max(time, 0), player.duration)
        position = player.currentTime
        persistPlaybackState()
        updateNowPlaying()
    }

    func clearLocalPlaybackState() {
        player?.stop()
        player = nil
        timer?.invalidate()
        timer = nil
        currentTrack = nil
        queue = []
        currentIndex = -1
        position = 0
        duration = 0
        isPlaying = false
        shuffleEnabled = false
        repeatMode = 0
        sleepTimerEndDate = nil
        sleepAtEndOfTrack = false

        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: "vitr.sleepTimer.endDate")
        defaults.removeObject(forKey: "vitr.playback.shuffle")
        defaults.removeObject(forKey: "vitr.playback.repeatMode")
        [
            "vitr.playback.trackTitle",
            "vitr.playback.artist",
            "vitr.playback.position",
            "vitr.playback.queueTitles"
        ].forEach(defaults.removeObject(forKey:))

        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    func audioPlayerDidFinishPlaying(
        _ player: AVAudioPlayer,
        successfully flag: Bool
    ) {
        if sleepAtEndOfTrack {
            sleepAtEndOfTrack = false
            isPlaying = false
            position = duration
            updateNowPlaying()
            return
        }

        if repeatMode == 2, let currentTrack {
            _ = play(currentTrack, queue: queue)
        } else if currentIndex >= 0,
                  currentIndex < queue.count - 1 || repeatMode == 1 {
            next()
        } else {
            isPlaying = false
            position = duration
            persistPlaybackState()
            updateNowPlaying()
        }
    }

    private func playableURL(for track: VitrTrack) -> URL? {
        if let localURL = track.localURL,
           FileManager.default.fileExists(atPath: localURL.path) {
            return localURL
        }

        if let downloaded =
            VitrDownloadLibrary.shared.items.first(
                where: {
                    $0.title == track.title &&
                    $0.artist == track.artist &&
                    FileManager.default.fileExists(
                        atPath: $0.fileURL.path
                    )
                }
            ) {
            return downloaded.fileURL
        }

        return nil
    }

    private func restorePlaybackState() {
        let defaults = UserDefaults.standard

        guard
            let title = defaults.string(
                forKey: "vitr.playback.trackTitle"
            ),
            let artist = defaults.string(
                forKey: "vitr.playback.artist"
            )
        else {
            return
        }

        let library = VitrDownloadLibrary.shared
        guard let item = library.items.first(
            where: {
                $0.title == title &&
                $0.artist == artist
            }
        ) else {
            return
        }

        let storedQueueTitles =
            defaults.stringArray(
                forKey: "vitr.playback.queueTitles"
            ) ?? []

        var restoredQueue =
            storedQueueTitles.compactMap { queueTitle in
                library.items.first {
                    $0.title == queueTitle
                }
            }
            .map(VitrTrack.init(downloaded:))

        let track = VitrTrack(downloaded: item)
        if restoredQueue.isEmpty {
            restoredQueue = [track]
        }

        queue = restoredQueue
        currentIndex =
            restoredQueue.firstIndex {
                $0.title == track.title &&
                $0.artist == track.artist
            } ?? 0
        currentTrack = track

        do {
            let restoredPlayer =
                try AVAudioPlayer(
                    contentsOf: item.fileURL
                )
            restoredPlayer.delegate = self
            restoredPlayer.volume = Float(volume)
            restoredPlayer.prepareToPlay()

            let storedPosition = defaults.double(
                forKey: "vitr.playback.position"
            )
            restoredPlayer.currentTime =
                min(
                    max(storedPosition, 0),
                    restoredPlayer.duration
                )

            player = restoredPlayer
            position = restoredPlayer.currentTime
            duration = restoredPlayer.duration
            isPlaying = false
            startProgressTimer()
            updateNowPlaying()
        } catch {
            player = nil
            position = 0
            duration = track.durationSeconds
            isPlaying = false
        }
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playback,
                mode: .default,
                options: [.allowAirPlay, .allowBluetoothA2DP]
            )
            try session.setActive(true)
        } catch {
        }
    }

    private func configureRemoteCommands() {
        let commands = MPRemoteCommandCenter.shared()

        commands.playCommand.isEnabled = true
        commands.pauseCommand.isEnabled = true
        commands.togglePlayPauseCommand.isEnabled = true
        commands.nextTrackCommand.isEnabled = true
        commands.previousTrackCommand.isEnabled = true
        commands.changePlaybackPositionCommand.isEnabled = true

        commands.playCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                if self?.isPlaying == false {
                    self?.togglePlayPause()
                }
            }
            return .success
        }

        commands.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                self?.pause()
            }
            return .success
        }

        commands.togglePlayPauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                self?.togglePlayPause()
            }
            return .success
        }

        commands.nextTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                self?.next()
            }
            return .success
        }

        commands.previousTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                self?.previous()
            }
            return .success
        }

        commands.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            Task { @MainActor in
                self?.seek(to: event.positionTime)
            }
            return .success
        }
    }

    private func startProgressTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(
            withTimeInterval: 0.5,
            repeats: true
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self, let player = self.player else { return }
                self.position = player.currentTime
                self.duration = player.duration
                self.isPlaying = player.isPlaying

                if let endDate = self.sleepTimerEndDate,
                   Date() >= endDate {
                    self.pause()
                    self.cancelSleepTimer()
                    return
                }

                self.updateNowPlaying()
            }
        }
        RunLoop.main.add(timer!, forMode: .common)
    }

    private func persistPlaybackState() {
        guard let currentTrack else { return }
        let defaults = UserDefaults.standard
        defaults.set(currentTrack.title, forKey: "vitr.playback.trackTitle")
        defaults.set(currentTrack.artist, forKey: "vitr.playback.artist")
        defaults.set(position, forKey: "vitr.playback.position")
        defaults.set(queue.map(\.title), forKey: "vitr.playback.queueTitles")
    }

    private func updateNowPlaying() {
        guard let currentTrack else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }

        var info: [String: Any] = [
            MPMediaItemPropertyTitle: currentTrack.title,
            MPMediaItemPropertyArtist: currentTrack.artist,
            MPMediaItemPropertyAlbumTitle: currentTrack.album,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0
        ]

        let resolvedDuration = duration > 0 ? duration : currentTrack.durationSeconds
        if resolvedDuration > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = resolvedDuration
        }

        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}

extension VitrTrack {
    init(downloaded item: VitrDownloadedItem) {
        self.init(
            title: item.title,
            artist: item.artist,
            album: "Downloads",
            duration: "0:00",
            colors: [
                Color(red: 0.91, green: 0.07, blue: 0.25),
                Color(red: 0.12, green: 0.01, blue: 0.04)
            ],
            localURL: item.fileURL
        )
    }
}
