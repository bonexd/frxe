import Foundation

@MainActor
final class VitrSealDownloadService:
    ObservableObject {
    static let shared =
        VitrSealDownloadService()

    @Published private(set)
    var isDownloading = false

    @Published private(set)
    var status:
        String?

    private let endpoint =
        URL(
            string:
                "https://vitr.nont.me/api/mobile-download"
        )!

    private init() {
    }

    func download(
        _ track: VitrTrack
    ) async throws
        -> VitrDownloadedItem {
        guard
            let videoID =
                track.sourceVideoID,
            videoID.count == 11
        else {
            throw DownloadError
                .missingVideoID
        }

        isDownloading = true
        status =
            "Downloading with Seal…"

        defer {
            isDownloading = false
        }

        do {
            let item =
                try await downloadWithSealEndpoint(
                    track,
                    videoID:
                        videoID
                )
            status =
                "Downloaded with Seal."
            return item
        } catch {
            guard
                let fallbackURL =
                    track.remoteAudioURL
            else {
                status =
                    "Download failed."
                throw error
            }

            status =
                "Seal unavailable · trying audio fallback…"

            do {
                let item =
                    try await downloadDirectAudio(
                        track,
                        videoID:
                            videoID,
                        url:
                            fallbackURL
                    )
                status =
                    "Downloaded with audio fallback."
                return item
            } catch {
                status =
                    "Download failed."
                throw error
            }
        }
    }

    private func downloadWithSealEndpoint(
        _ track: VitrTrack,
        videoID: String
    ) async throws
        -> VitrDownloadedItem {
        var request =
            URLRequest(
                url: endpoint
            )

        request.httpMethod = "POST"
        request.timeoutInterval = 120
        request.setValue(
            "application/json",
            forHTTPHeaderField:
                "Content-Type"
        )
        request.httpBody =
            try JSONSerialization
                .data(
                    withJSONObject: [
                        "videoId":
                            videoID
                    ]
                )

        let (
            temporaryURL,
            response
        ) =
            try await URLSession
                .shared
                .download(
                    for: request
                )

        guard
            let http =
                response as?
                    HTTPURLResponse,
            200..<300 ~=
                http.statusCode
        else {
            throw DownloadError
                .badResponse
        }

        return try register(
            temporaryURL:
                temporaryURL,
            track:
                track,
            videoID:
                videoID,
            quality:
                "Seal"
        )
    }

    private func downloadDirectAudio(
        _ track: VitrTrack,
        videoID: String,
        url: URL
    ) async throws
        -> VitrDownloadedItem {
        var request =
            URLRequest(
                url: url
            )

        request.timeoutInterval = 120
        request.setValue(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
            forHTTPHeaderField:
                "User-Agent"
        )
        request.setValue(
            "https://www.youtube.com/",
            forHTTPHeaderField:
                "Referer"
        )
        request.setValue(
            "https://www.youtube.com",
            forHTTPHeaderField:
                "Origin"
        )

        let (
            temporaryURL,
            response
        ) =
            try await URLSession
                .shared
                .download(
                    for: request
                )

        guard
            let http =
                response as?
                    HTTPURLResponse,
            200..<300 ~=
                http.statusCode
        else {
            throw DownloadError
                .badFallbackResponse
        }

        return try register(
            temporaryURL:
                temporaryURL,
            track:
                track,
            videoID:
                videoID,
            quality:
                "InnerTube fallback"
        )
    }

    private func register(
        temporaryURL: URL,
        track: VitrTrack,
        videoID: String,
        quality: String
    ) throws
        -> VitrDownloadedItem {
        try VitrDownloadLibrary
            .shared
            .register(
                fileURL:
                    temporaryURL,
                title:
                    track.title,
                artist:
                    track.artist,
                format: "m4a",
                quality:
                    quality,
                sourceURL:
                    "https://www.youtube.com/watch?v=\(videoID)"
            )
    }

    enum DownloadError:
        Error {
        case missingVideoID
        case badResponse
        case badFallbackResponse
    }
}
