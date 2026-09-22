import Foundation

enum VitrRecommendationReason {
    case sessionMatch
    case tasteMatch
    case likedArtist
    case discovery
    case coldStart
}

struct VitrRankedRecommendation {
    let track: VitrTrack
    let score: Double
    let reason: VitrRecommendationReason
}

/// Local-first recommendation engine shared by the native iOS surfaces.
///
/// V1 uses deterministic metadata feature hashing so it works offline with no
/// ML runtime. The ranking contract is intentionally compatible with future
/// precomputed audio embeddings from Vitr Sync.
enum VitrRecommendationEngine {
    private static let dimensions = 64
    private static let sessionSize = 12
    private static let historySize = 40
    private static let libraryProfileSize = 100

    static func rank(
        candidates: [VitrTrack],
        history: [VitrTrack],
        library: [VitrTrack],
        likedTrackIDs: Set<UUID> = [],
        limit: Int = 12,
        maxPerArtist: Int = 2
    ) -> [VitrTrack] {
        rankDetailed(
            candidates: candidates,
            history: history,
            library: library,
            likedTrackIDs: likedTrackIDs,
            limit: limit,
            maxPerArtist: maxPerArtist
        ).map(\.track)
    }

    static func rankDetailed(
        candidates: [VitrTrack],
        history: [VitrTrack],
        library: [VitrTrack],
        likedTrackIDs: Set<UUID> = [],
        limit: Int = 12,
        maxPerArtist: Int = 2
    ) -> [VitrRankedRecommendation] {
        guard limit > 0, !candidates.isEmpty else { return [] }

        var seenIDs = Set<UUID>()
        let uniqueCandidates = candidates.filter { seenIDs.insert($0.id).inserted }
        let profile = buildProfile(
            history: history,
            library: library,
            likedTrackIDs: likedTrackIDs
        )

        let scored = uniqueCandidates.enumerated().map { index, track in
            score(
                track: track,
                originalIndex: index,
                profile: profile,
                likedTrackIDs: likedTrackIDs
            )
        }

        return diversify(
            scored,
            limit: limit,
            maxPerArtist: maxPerArtist
        )
    }

    private static func buildProfile(
        history: [VitrTrack],
        library: [VitrTrack],
        likedTrackIDs: Set<UUID>
    ) -> Profile {
        var longTerm = Array(repeating: 0.0, count: dimensions)
        var session = Array(repeating: 0.0, count: dimensions)
        var artistAffinity: [String: Double] = [:]
        var recentIndexByID: [UUID: Int] = [:]

        for (index, track) in history.prefix(historySize).enumerated() {
            let vector = trackVector(track)
            let recencyWeight = 2.75 / (1.0 + Double(index) * 0.22)
            let likedBoost = likedTrackIDs.contains(track.id) ? 4.0 : 0.0
            let longWeight = recencyWeight + likedBoost

            addWeighted(&longTerm, vector, weight: longWeight)
            artistAffinity[artistKey(track.artist), default: 0] += longWeight
            if recentIndexByID[track.id] == nil {
                recentIndexByID[track.id] = index
            }

            if index < sessionSize {
                let sessionWeight = 1.75 / (1.0 + Double(index) * 0.42)
                addWeighted(&session, vector, weight: sessionWeight)
            }
        }

        for track in library.prefix(libraryProfileSize) {
            let savedWeight = 0.70 + (likedTrackIDs.contains(track.id) ? 4.0 : 0.0)
            let vector = trackVector(track)
            addWeighted(&longTerm, vector, weight: savedWeight)
            artistAffinity[artistKey(track.artist), default: 0] += savedWeight
        }

        let longNormalized = normalize(longTerm)
        let sessionNormalized = normalize(session)

        return Profile(
            longTerm: longNormalized,
            session: sessionNormalized,
            artistAffinity: artistAffinity,
            recentIndexByID: recentIndexByID,
            hasTaste: longNormalized.contains(where: { $0 != 0 }) ||
                sessionNormalized.contains(where: { $0 != 0 })
        )
    }

    private static func score(
        track: VitrTrack,
        originalIndex: Int,
        profile: Profile,
        likedTrackIDs: Set<UUID>
    ) -> VitrRankedRecommendation {
        guard profile.hasTaste else {
            return VitrRankedRecommendation(
                track: track,
                score: 1.0 - Double(originalIndex) * 0.001 +
                    (likedTrackIDs.contains(track.id) ? 0.05 : 0),
                reason: .coldStart
            )
        }

        let vector = trackVector(track)
        let longSimilarity = max(0, cosine(profile.longTerm, vector))
        let sessionSimilarity = max(0, cosine(profile.session, vector))
        let rawArtistAffinity = profile.artistAffinity[artistKey(track.artist)] ?? 0
        let artistAffinity = rawArtistAffinity / (rawArtistAffinity + 8.0)
        let recentIndex = profile.recentIndexByID[track.id]

        let repeatPenalty: Double
        if let recentIndex = recentIndex {
            switch recentIndex {
            case 0:
                repeatPenalty = 0.55
            case 1...2:
                repeatPenalty = 0.38
            case 3...7:
                repeatPenalty = 0.22
            case 8...19:
                repeatPenalty = 0.10
            default:
                repeatPenalty = 0.04
            }
        } else {
            repeatPenalty = 0
        }

        let novelty =
            recentIndex == nil && !likedTrackIDs.contains(track.id)
            ? 1.0
            : 0.0
        let likedBonus = likedTrackIDs.contains(track.id) ? 0.04 : 0.0

        let finalScore =
            0.44 * longSimilarity +
            0.30 * sessionSimilarity +
            0.12 * artistAffinity +
            0.08 * novelty +
            likedBonus -
            repeatPenalty

        let reason: VitrRecommendationReason
        if novelty > 0 && longSimilarity < 0.20 && sessionSimilarity < 0.20 {
            reason = .discovery
        } else if sessionSimilarity >= longSimilarity &&
                    sessionSimilarity >= artistAffinity {
            reason = .sessionMatch
        } else if artistAffinity > longSimilarity {
            reason = .likedArtist
        } else {
            reason = .tasteMatch
        }

        return VitrRankedRecommendation(
            track: track,
            score: finalScore,
            reason: reason
        )
    }

    private static func diversify(
        _ ranked: [VitrRankedRecommendation],
        limit: Int,
        maxPerArtist: Int
    ) -> [VitrRankedRecommendation] {
        var remaining = ranked.sorted {
            if $0.score == $1.score {
                return $0.track.id.uuidString < $1.track.id.uuidString
            }
            return $0.score > $1.score
        }
        var selected: [VitrRankedRecommendation] = []
        var artistCounts: [String: Int] = [:]
        var seenTrackKeys = Set<String>()
        let cap = max(1, maxPerArtist)

        while selected.count < limit && !remaining.isEmpty {
            var bestIndex: Int?
            var bestAdjusted = -Double.infinity

            for (index, candidate) in remaining.enumerated() {
                let artist = artistKey(candidate.track.artist)
                if !artist.isEmpty && artistCounts[artist, default: 0] >= cap {
                    continue
                }

                let trackKey =
                    "\(normalized(candidate.track.title))|\(normalized(candidate.track.artist))"
                if seenTrackKeys.contains(trackKey) {
                    continue
                }

                let candidateVector = trackVector(candidate.track)
                let maxSelectedSimilarity =
                    selected
                        .map { max(0, cosine(candidateVector, trackVector($0.track))) }
                        .max()
                        ?? 0
                let adjusted = candidate.score - 0.12 * maxSelectedSimilarity

                if adjusted > bestAdjusted {
                    bestAdjusted = adjusted
                    bestIndex = index
                }
            }

            guard let winnerIndex = bestIndex else { break }
            let winner = remaining.remove(at: winnerIndex)
            selected.append(winner)

            let artist = artistKey(winner.track.artist)
            if !artist.isEmpty {
                artistCounts[artist, default: 0] += 1
            }
            seenTrackKeys.insert(
                "\(normalized(winner.track.title))|\(normalized(winner.track.artist))"
            )
        }

        return selected
    }

    private static func trackVector(_ track: VitrTrack) -> [Double] {
        var vector = Array(repeating: 0.0, count: dimensions)

        addFieldTokens(&vector, field: "artist", raw: track.artist, weight: 2.40)
        addFieldTokens(&vector, field: "album", raw: track.album, weight: 1.45)
        addFieldTokens(&vector, field: "title", raw: track.title, weight: 1.00)

        let durationBucket: String
        if track.durationSeconds <= 0 {
            durationBucket = "unknown"
        } else if track.durationSeconds < 150 {
            durationBucket = "short"
        } else if track.durationSeconds < 300 {
            durationBucket = "medium"
        } else {
            durationBucket = "long"
        }
        addToken(&vector, token: "duration:\(durationBucket)", weight: 0.25)

        return normalize(vector)
    }

    private static func addFieldTokens(
        _ vector: inout [Double],
        field: String,
        raw: String,
        weight: Double
    ) {
        let value = normalized(raw)
        guard !value.isEmpty else { return }

        addToken(&vector, token: "\(field):\(value)", weight: weight)

        let parts =
            value
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { $0.count >= 2 }

        var seen = Set<String>()
        for token in parts where seen.insert(token).inserted {
            addToken(
                &vector,
                token: "\(field)-token:\(token)",
                weight: weight * 0.55
            )
            if seen.count >= 8 { break }
        }
    }

    private static func addToken(
        _ vector: inout [Double],
        token: String,
        weight: Double
    ) {
        let hash = fnv1a32(token)
        let index = Int(hash % UInt32(dimensions))
        let sign = (hash & 1) == 0 ? 1.0 : -1.0
        vector[index] += weight * sign
    }

    private static func addWeighted(
        _ target: inout [Double],
        _ vector: [Double],
        weight: Double
    ) {
        for index in target.indices {
            target[index] += vector[index] * weight
        }
    }

    private static func cosine(_ left: [Double], _ right: [Double]) -> Double {
        var dot = 0.0
        var leftNorm = 0.0
        var rightNorm = 0.0

        for index in left.indices {
            dot += left[index] * right[index]
            leftNorm += left[index] * left[index]
            rightNorm += right[index] * right[index]
        }

        guard leftNorm > 0, rightNorm > 0 else { return 0 }
        return dot / (sqrt(leftNorm) * sqrt(rightNorm))
    }

    private static func normalize(_ vector: [Double]) -> [Double] {
        let norm = sqrt(vector.reduce(0) { $0 + $1 * $1 })
        guard norm > 0 else { return vector }
        return vector.map { $0 / norm }
    }

    private static func fnv1a32(_ value: String) -> UInt32 {
        var hash: UInt32 = 2_166_136_261
        for byte in value.utf8 {
            hash ^= UInt32(byte)
            hash = hash &* 16_777_619
        }
        return hash
    }

    private static func artistKey(_ value: String) -> String {
        var output = normalized(value)
        for separator in [" feat.", " ft.", " featuring "] {
            if let range = output.range(of: separator) {
                output = String(output[..<range.lowerBound])
            }
        }
        return normalized(output)
    }

    private static func normalized(_ value: String) -> String {
        value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(
                of: "\\s+",
                with: " ",
                options: .regularExpression
            )
    }

    private struct Profile {
        let longTerm: [Double]
        let session: [Double]
        let artistAffinity: [String: Double]
        let recentIndexByID: [UUID: Int]
        let hasTaste: Bool
    }
}
