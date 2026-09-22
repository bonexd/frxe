import Foundation

struct VitrYtDlpSearchService {
    private let endpoint =
        URL(string: "https://vitr.nont.me/api/mobile-search")!

    func searchVideoIDs(
        query rawQuery: String
    ) async throws -> [String] {
        let query =
            rawQuery.trimmingCharacters(
                in: .whitespacesAndNewlines
            )

        guard !query.isEmpty else {
            return []
        }

        var components =
            URLComponents(
                url: endpoint,
                resolvingAgainstBaseURL: false
            )!

        components.queryItems = [
            URLQueryItem(
                name: "q",
                value: query
            )
        ]

        guard let url = components.url else {
            throw URLError(.badURL)
        }

        let (
            data,
            response
        ) =
            try await URLSession.shared.data(
                from: url
            )

        guard
            let http =
                response as?
                    HTTPURLResponse,
            200..<300 ~= http.statusCode
        else {
            throw URLError(
                .badServerResponse
            )
        }

        let payload =
            try JSONDecoder()
                .decode(
                    SearchResponse.self,
                    from: data
                )

        return payload.items
            .map(\.id)
            .filter {
                $0.count == 11
            }
    }

    private struct SearchResponse:
        Decodable {
        let items: [SearchItem]
    }

    private struct SearchItem:
        Decodable {
        let id: String
    }
}

@MainActor
final class VitrRemoteSearchStore:
    ObservableObject {
    @Published private(set)
    var tracks: [VitrTrack] = []

    @Published private(set)
    var isLoading = false

    @Published private(set)
    var message: String?

    @Published private(set)
    var query = ""

    private let searchService =
        VitrYtDlpSearchService()

    private let metadataService =
        VitrInnerTubeMetadataService()

    func clear() {
        tracks = []
        isLoading = false
        message = nil
        query = ""
    }

    func search(
        _ rawQuery: String
    ) async {
        let normalized =
            rawQuery.trimmingCharacters(
                in:
                    .whitespacesAndNewlines
            )

        guard !normalized.isEmpty else {
            clear()
            return
        }

        query = normalized
        isLoading = true
        message = nil

        do {
            let ids =
                try await searchService
                    .searchVideoIDs(
                        query: normalized
                    )

            guard
                query == normalized
            else {
                return
            }

            tracks =
                await metadataService
                    .tracks(
                        for: ids
                    )

            if tracks.isEmpty {
                message =
                    "No music found."
            }
        } catch {
            guard
                query == normalized
            else {
                return
            }

            tracks = []
            message =
                "yt-dlp search is unavailable."
        }

        if query == normalized {
            isLoading = false
        }
    }
}
