import Foundation
import SwiftUI

struct VitrInnerTubeMetadataService {
    func tracks(
        for videoIDs: [String]
    ) async -> [VitrTrack] {
        await withTaskGroup(
            of:
                (
                    Int,
                    VitrTrack?
                ).self
        ) { group in
            for (
                index,
                videoID
            ) in videoIDs.enumerated() {
                group.addTask {
                    (
                        index,
                        await track(
                            videoID:
                                videoID
                        )
                    )
                }
            }

            var resolved:
                [
                    (
                        Int,
                        VitrTrack
                    )
                ] = []

            for await (
                index,
                track
            ) in group {
                if let track {
                    resolved.append(
                        (
                            index,
                            track
                        )
                    )
                }
            }

            return resolved
                .sorted {
                    $0.0 < $1.0
                }
                .map(\.1)
        }
    }

    private func track(
        videoID: String
    ) async -> VitrTrack? {
        guard videoID.count == 11 else {
            return nil
        }

        guard
            let url =
                URL(
                    string:
                        "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
                )
        else {
            return nil
        }

        var request =
            URLRequest(
                url: url
            )

        request.httpMethod = "POST"
        request.setValue(
            "application/json; charset=utf-8",
            forHTTPHeaderField:
                "Content-Type"
        )
        request.setValue(
            "https://www.youtube.com",
            forHTTPHeaderField:
                "Origin"
        )
        request.setValue(
            "1",
            forHTTPHeaderField:
                "X-Youtube-Client-Name"
        )
        request.setValue(
            Self.clientVersion,
            forHTTPHeaderField:
                "X-Youtube-Client-Version"
        )

        let body:
            [String: Any] = [
                "context": [
                    "client": [
                        "clientName":
                            "WEB",
                        "clientVersion":
                            Self
                            .clientVersion,
                        "hl": "en",
                        "gl": "US"
                    ]
                ],
                "videoId":
                    videoID
            ]

        request.httpBody =
            try? JSONSerialization
                .data(
                    withJSONObject:
                        body
                )

        do {
            let (
                data,
                response
            ) =
                try await URLSession
                    .shared
                    .data(
                        for: request
                    )

            guard
                let http =
                    response as?
                        HTTPURLResponse,
                200..<300 ~=
                    http.statusCode
            else {
                return nil
            }

            let payload =
                try JSONDecoder()
                    .decode(
                        PlayerResponse
                            .self,
                        from: data
                    )

            guard
                let details =
                    payload.videoDetails
            else {
                return nil
            }

            let seconds =
                Double(
                    details
                        .lengthSeconds
                ) ?? 0

            let remoteAudioURL =
                payload.streamingData?
                    .adaptiveFormats?
                    .filter {
                        $0.mimeType?
                            .lowercased()
                            .hasPrefix(
                                "audio/mp4"
                            ) == true
                    }
                    .sorted {
                        ($0.bitrate ?? 0) >
                            ($1.bitrate ?? 0)
                    }
                    .compactMap {
                        raw in
                        raw.url.flatMap {
                            URL(
                                string:
                                    $0
                            )
                        }
                    }
                    .first

            return VitrTrack(
                title:
                    details.title,
                artist:
                    details.author,
                album:
                    "YouTube",
                duration:
                    durationText(
                        seconds
                    ),
                colors: [
                    Color(
                        red: 0.96,
                        green: 0.08,
                        blue: 0.27
                    ),
                    Color(
                        red: 0.12,
                        green: 0.01,
                        blue: 0.04
                    )
                ],
                sourceVideoID:
                    videoID,
                remoteAudioURL:
                    remoteAudioURL
            )
        } catch {
            return nil
        }
    }

    private func durationText(
        _ seconds: Double
    ) -> String {
        let total =
            max(
                Int(seconds.rounded()),
                0
            )

        return String(
            format:
                "%d:%02d",
            total / 60,
            total % 60
        )
    }

    private struct PlayerResponse:
        Decodable {
        let videoDetails:
            VideoDetails?
        let streamingData:
            StreamingData?
    }

    private struct StreamingData:
        Decodable {
        let adaptiveFormats:
            [AdaptiveFormat]?
    }

    private struct AdaptiveFormat:
        Decodable {
        let mimeType:
            String?
        let bitrate:
            Int?
        let url:
            String?
    }

    private struct VideoDetails:
        Decodable {
        let title: String
        let author: String
        let lengthSeconds:
            String
    }

    private static let clientVersion =
        "2.20250925.01.00"
}
