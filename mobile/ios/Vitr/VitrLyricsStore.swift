import Foundation

struct VitrLyricLine: Identifiable, Hashable {
    let id = UUID()
    let startSeconds: Double?
    let text: String
}

@MainActor
final class VitrLyricsStore: ObservableObject {
    @Published private(set) var isLoading = false
    @Published private(set) var lines: [VitrLyricLine] = []
    @Published private(set) var synced = false
    @Published private(set) var source: String? = nil
    @Published private(set) var message: String? = nil

    private var loadedKey = ""
    private var task: Task<Void, Never>?

    deinit {
        task?.cancel()
    }

    func load(
        title: String,
        artist: String,
        album: String,
        durationSeconds: Int?
    ) {
        let key = [
            title.trimmingCharacters(in: .whitespacesAndNewlines),
            artist.trimmingCharacters(in: .whitespacesAndNewlines),
            album.trimmingCharacters(in: .whitespacesAndNewlines),
            durationSeconds.map(String.init) ?? ""
        ].joined(separator: "|").lowercased()

        if key == loadedKey, (!lines.isEmpty || isLoading) {
            return
        }

        loadedKey = key
        task?.cancel()
        isLoading = true
        lines = []
        synced = false
        source = nil
        message = nil

        task = Task { [weak self] in
            guard let self else { return }

            do {
                let payload =
                    try await Self.fetchLyrics(
                        title: title,
                        artist: artist,
                        album: album,
                        durationSeconds: durationSeconds
                    )

                guard !Task.isCancelled else {
                    return
                }

                if payload.instrumental {
                    self.isLoading = false
                    self.source = "LRCLIB"
                    self.message = "Instrumental"
                    return
                }

                if let syncedLyrics = payload.syncedLyrics,
                   !syncedLyrics.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    let parsed = Self.parseSyncedLyrics(syncedLyrics)

                    if !parsed.isEmpty {
                        self.lines = parsed
                        self.synced = true
                        self.source = "LRCLIB"
                        self.message = nil
                        self.isLoading = false
                        return
                    }
                }

                if let plainLyrics = payload.plainLyrics,
                   !plainLyrics.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    self.lines =
                        plainLyrics
                            .split(
                                whereSeparator:
                                    \.isNewline
                            )
                            .map {
                                String($0)
                                    .trimmingCharacters(
                                        in:
                                            .whitespacesAndNewlines
                                    )
                            }
                            .filter {
                                !$0.isEmpty
                            }
                            .map {
                                VitrLyricLine(
                                    startSeconds: nil,
                                    text: $0
                                )
                            }

                    self.synced = false
                    self.source = "LRCLIB"
                    self.message = nil
                    self.isLoading = false
                    return
                }

                self.isLoading = false
                self.message = "No lyrics available"
            } catch is CancellationError {
                return
            } catch {
                guard !Task.isCancelled else {
                    return
                }

                self.isLoading = false
                self.lines = []
                self.synced = false
                self.source = nil
                self.message =
                    error.localizedDescription
            }
        }
    }

    func line(
        at seconds: Double?
    ) -> String? {
        guard !lines.isEmpty else {
            return nil
        }

        guard
            synced,
            let seconds
        else {
            return lines.first?.text
        }

        let match =
            lines.last {
                ($0.startSeconds
                    ?? .greatestFiniteMagnitude)
                    <= seconds
            }

        return match?.text
            ?? lines.first?.text
    }

    func activeLineID(
        at seconds: Double
    ) -> UUID? {
        guard synced else {
            return nil
        }

        let match =
            lines.last {
                ($0.startSeconds
                    ?? .greatestFiniteMagnitude)
                    <= seconds
            }

        return match?.id
    }

    private static func fetchLyrics(
        title: String,
        artist: String,
        album: String,
        durationSeconds: Int?
    ) async throws -> LyricsPayload {
        if let exactURL =
            exactURL(
                title: title,
                artist: artist,
                album: album,
                durationSeconds:
                    durationSeconds
            ) {
            do {
                let payload =
                    try await requestObject(
                        exactURL
                    )

                if let decoded =
                    try? JSONDecoder()
                        .decode(
                            LyricsPayload.self,
                            from: payload
                        ) {
                    return decoded
                }
            } catch let error as LyricsError {
                if case .notFound = error {
                } else {
                    throw error
                }
            }
        }

        guard let searchURL =
            searchURL(
                title: title,
                artist: artist
            )
        else {
            throw LyricsError.invalidRequest
        }

        let data =
            try await requestObject(
                searchURL
            )

        let results =
            try JSONDecoder()
                .decode(
                    [LyricsPayload].self,
                    from: data
                )

        guard
            let best =
                results.first(
                    where: {
                        !$0.syncedLyrics
                            .orEmpty
                            .isEmpty
                    }
                )
                ?? results.first(
                    where: {
                        !$0.plainLyrics
                            .orEmpty
                            .isEmpty
                    }
                )
                ?? results.first
        else {
            throw LyricsError.notFound
        }

        return best
    }

    private static func exactURL(
        title: String,
        artist: String,
        album: String,
        durationSeconds: Int?
    ) -> URL? {
        var components =
            URLComponents(
                string:
                    "https://lrclib.net/api/get"
            )

        var items = [
            URLQueryItem(
                name:
                    "track_name",
                value:
                    title
            ),
            URLQueryItem(
                name:
                    "artist_name",
                value:
                    artist
            )
        ]

        if !album
            .trimmingCharacters(
                in:
                    .whitespacesAndNewlines
            )
            .isEmpty {
            items.append(
                URLQueryItem(
                    name:
                        "album_name",
                    value:
                        album
                )
            )
        }

        if let durationSeconds {
            items.append(
                URLQueryItem(
                    name:
                        "duration",
                    value:
                        String(
                            durationSeconds
                        )
                )
            )
        }

        components?.queryItems =
            items
        return components?.url
    }

    private static func searchURL(
        title: String,
        artist: String
    ) -> URL? {
        var components =
            URLComponents(
                string:
                    "https://lrclib.net/api/search"
            )

        components?.queryItems = [
            URLQueryItem(
                name:
                    "track_name",
                value:
                    title
            ),
            URLQueryItem(
                name:
                    "artist_name",
                value:
                    artist
            )
        ]

        return components?.url
    }

    private static func requestObject(
        _ url: URL
    ) async throws -> Data {
        var request =
            URLRequest(
                url: url
            )

        request.setValue(
            "Vitr iOS",
            forHTTPHeaderField:
                "User-Agent"
        )

        request.setValue(
            "Vitr iOS",
            forHTTPHeaderField:
                "Lrclib-Client"
        )

        request.setValue(
            "application/json",
            forHTTPHeaderField:
                "Accept"
        )

        let (
            data,
            response
        ) =
            try await URLSession
                .shared
                .data(
                    for: request
                )

        guard let http =
            response
                as? HTTPURLResponse
        else {
            throw LyricsError.invalidResponse
        }

        if http.statusCode == 404 {
            throw LyricsError.notFound
        }

        guard
            200..<300
                ~= http.statusCode
        else {
            throw LyricsError.http(
                http.statusCode
            )
        }

        return data
    }

    private static func parseSyncedLyrics(
        _ text: String
    ) -> [VitrLyricLine] {
        let expression =
            try? NSRegularExpression(
                pattern:
                    #"^\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$"#
            )

        guard let expression else {
            return []
        }

        return text
            .split(
                whereSeparator:
                    \.isNewline
            )
            .compactMap {
                row in

                let line =
                    String(row)

                let range =
                    NSRange(
                        line.startIndex..<line.endIndex,
                        in: line
                    )

                guard
                    let match =
                        expression
                            .firstMatch(
                                in: line,
                                range: range
                            ),
                    let minuteRange =
                        Range(
                            match.range(
                                at: 1
                            ),
                            in: line
                        ),
                    let secondRange =
                        Range(
                            match.range(
                                at: 2
                            ),
                            in: line
                        )
                else {
                    return nil
                }

                let minutes =
                    Double(
                        line[
                            minuteRange
                        ]
                    )
                    ?? 0

                let seconds =
                    Double(
                        line[
                            secondRange
                        ]
                    )
                    ?? 0

                var fraction = 0.0

                if
                    match.range(
                        at: 3
                    ).location
                        != NSNotFound,
                    let fractionRange =
                        Range(
                            match.range(
                                at: 3
                            ),
                            in: line
                        ) {
                    let raw =
                        String(
                            line[
                                fractionRange
                            ]
                        )

                    fraction =
                        (
                            Double(raw)
                            ?? 0
                        )
                        /
                        pow(
                            10,
                            Double(
                                raw.count
                            )
                        )
                }

                let lyricText:
                    String

                if
                    match.range(
                        at: 4
                    ).location
                        != NSNotFound,
                    let lyricRange =
                        Range(
                            match.range(
                                at: 4
                            ),
                            in: line
                        ) {
                    lyricText =
                        String(
                            line[
                                lyricRange
                            ]
                        )
                        .trimmingCharacters(
                            in:
                                .whitespacesAndNewlines
                        )
                } else {
                    lyricText = ""
                }

                guard
                    !lyricText.isEmpty
                else {
                    return nil
                }

                return VitrLyricLine(
                    startSeconds:
                        minutes * 60
                        + seconds
                        + fraction,
                    text:
                        lyricText
                )
            }
    }

    private struct LyricsPayload:
        Decodable {
        let plainLyrics: String?
        let syncedLyrics: String?
        let instrumental: Bool

        enum CodingKeys:
            String,
            CodingKey {
            case plainLyrics
            case syncedLyrics
            case instrumental
        }

        init(
            from decoder: Decoder
        ) throws {
            let container =
                try decoder.container(
                    keyedBy:
                        CodingKeys.self
                )

            plainLyrics =
                try container.decodeIfPresent(
                    String.self,
                    forKey:
                        .plainLyrics
                )

            syncedLyrics =
                try container.decodeIfPresent(
                    String.self,
                    forKey:
                        .syncedLyrics
                )

            instrumental =
                (
                    try container
                        .decodeIfPresent(
                            Bool.self,
                            forKey:
                                .instrumental
                        )
                    )
                    ?? false
        }
    }

    private enum LyricsError:
        LocalizedError {
        case invalidRequest
        case invalidResponse
        case notFound
        case http(Int)

        var errorDescription:
            String? {
            switch self {
            case .invalidRequest:
                return "Could not create lyrics request"
            case .invalidResponse:
                return "Lyrics service returned an invalid response"
            case .notFound:
                return "No lyrics available"
            case .http(
                let status
            ):
                return "Lyrics service returned HTTP \(status)"
            }
        }
    }
}

private extension Optional
where Wrapped == String {
    var orEmpty: String {
        self ?? ""
    }
}
