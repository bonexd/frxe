import Foundation
import SwiftUI

struct VitrDownloadedItem: Codable, Identifiable, Hashable {
    let id: String
    var title: String
    var artist: String
    var format: String
    var quality: String
    var sourceURL: String
    var fileName: String
    var updatedAt: Date

    var fileURL: URL {
        VitrDownloadLibrary.downloadsFolderURL
            .appendingPathComponent(fileName)
    }
}

@MainActor
final class VitrDownloadLibrary: ObservableObject {
    static let shared = VitrDownloadLibrary()

    @Published private(set) var items: [VitrDownloadedItem] = []

    nonisolated static var downloadsFolderURL: URL {
        let documents = FileManager.default.urls(
            for: .documentDirectory,
            in: .userDomainMask
        ).first!

        return documents
            .appendingPathComponent(
                "Vitr",
                isDirectory: true
            )
    }

    let folderURL: URL
    private let indexURL: URL

    private init() {
        folderURL = Self.downloadsFolderURL

        indexURL = folderURL
            .appendingPathComponent(
                ".vitr-library.json"
            )

        try? FileManager.default.createDirectory(
            at: folderURL,
            withIntermediateDirectories: true
        )

        refresh()
    }

    func refresh() {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let stored: [VitrDownloadedItem] =
            (try? Data(contentsOf: indexURL))
                .flatMap {
                    try? decoder.decode(
                        [VitrDownloadedItem].self,
                        from: $0
                    )
                }
                ?? []

        let valid = stored.filter {
            FileManager.default.fileExists(
                atPath: $0.fileURL.path
            )
        }

        let indexedNames = Set(
            valid.map(\.fileName)
        )

        let directoryContents =
            (
                try? FileManager.default
                    .contentsOfDirectory(
                        at: folderURL,
                        includingPropertiesForKeys: nil
                    )
            ) ?? []

        let discovered =
            directoryContents
                .filter {
                    !$0.lastPathComponent
                        .hasPrefix(".") &&
                    ["m4a", "mp3", "flac", "wav"]
                        .contains(
                            $0.pathExtension
                                .lowercased()
                        ) &&
                    !indexedNames.contains(
                        $0.lastPathComponent
                    )
                }
                .map {
                    VitrDownloadedItem(
                        id: UUID().uuidString,
                        title: $0
                            .deletingPathExtension()
                            .lastPathComponent,
                        artist: "Unknown artist",
                        format: $0.pathExtension
                            .uppercased(),
                        quality: "Imported",
                        sourceURL: "",
                        fileName: $0.lastPathComponent,
                        updatedAt: Date()
                    )
                }

        items = (valid + discovered)
            .sorted {
                $0.updatedAt > $1.updatedAt
            }

        persist()
    }

    @discardableResult
    func register(
        fileURL: URL,
        title: String,
        artist: String,
        format: String,
        quality: String,
        sourceURL: String
    ) throws -> VitrDownloadedItem {
        let normalizedExtension =
            format.lowercased()
                .trimmingCharacters(
                    in: .whitespacesAndNewlines
                )

        let safeTitle =
            title
                .replacingOccurrences(
                    of: "/",
                    with: "_"
                )
                .replacingOccurrences(
                    of: ":",
                    with: "_"
                )
                .trimmingCharacters(
                    in: .whitespacesAndNewlines
                )

        let destinationName =
            uniqueFileName(
                base:
                    safeTitle.isEmpty
                    ? "Vitr synced track"
                    : safeTitle,
                ext:
                    normalizedExtension.isEmpty
                    ? fileURL.pathExtension.lowercased()
                    : normalizedExtension
            )

        let destination =
            folderURL
                .appendingPathComponent(
                    destinationName
                )

        if (
            fileURL.standardizedFileURL !=
            destination.standardizedFileURL
        ) {
            try? FileManager.default.removeItem(
                at: destination
            )
            try FileManager.default.moveItem(
                at: fileURL,
                to: destination
            )
        }

        let item =
            VitrDownloadedItem(
                id: UUID().uuidString,
                title:
                    title.isEmpty
                    ? destination
                        .deletingPathExtension()
                        .lastPathComponent
                    : title,
                artist:
                    artist.isEmpty
                    ? "Unknown artist"
                    : artist,
                format:
                    format.isEmpty
                    ? destination.pathExtension.uppercased()
                    : format.uppercased(),
                quality:
                    quality.isEmpty
                    ? "Synced"
                    : quality,
                sourceURL: sourceURL,
                fileName:
                    destination.lastPathComponent,
                updatedAt: Date()
            )

        items.removeAll {
            $0.fileName == item.fileName
        }
        items.insert(
            item,
            at: 0
        )

        persist()
        return item
    }

    func remove(
        _ item: VitrDownloadedItem
    ) {
        try? FileManager.default.removeItem(
            at: item.fileURL
        )

        items.removeAll {
            $0.id == item.id
        }

        persist()
    }

    func removeAll() {
        let existing = items
        existing.forEach { item in
            try? FileManager.default.removeItem(
                at: item.fileURL
            )
        }

        items = []
        persist()
    }

    var approximateStorageBytes: Int64 {
        items.reduce(into: Int64(0)) { total, item in
            let attributes = try? FileManager.default.attributesOfItem(
                atPath: item.fileURL.path
            )
            total += (attributes?[.size] as? NSNumber)?.int64Value ?? 0
        }
    }

    func contains(
        sourceURL: String,
        format: String,
        quality: String
    ) -> Bool {
        items.contains {
            !$0.sourceURL.isEmpty &&
            $0.sourceURL == sourceURL &&
            $0.format.caseInsensitiveCompare(format) == .orderedSame &&
            $0.quality == quality
        }
    }

    private func uniqueFileName(
        base: String,
        ext: String
    ) -> String {
        let normalizedExt =
            ext.isEmpty
            ? "mp3"
            : ext

        var candidate =
            "\(base).\(normalizedExt)"
        var index = 2

        while FileManager.default.fileExists(
            atPath:
                folderURL
                    .appendingPathComponent(
                        candidate
                    )
                    .path
        ) {
            candidate =
                "\(base) \(index).\(normalizedExt)"
            index += 1
        }

        return candidate
    }

    private func persist() {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [
            .prettyPrinted,
            .sortedKeys
        ]
        encoder.dateEncodingStrategy = .iso8601

        if let data =
            try? encoder.encode(items) {
            try? data.write(
                to: indexURL,
                options: .atomic
            )
        }
    }
}
