import Foundation
import Network
import UIKit

struct VitrLANPeer: Identifiable {
    let id: String
    let name: String
    let endpoint: NWEndpoint
}

final class VitrLANSyncManager: ObservableObject {
    static let shared = VitrLANSyncManager()

    @Published private(set) var sharing = false
    @Published private(set) var pairCode = ""
    @Published private(set) var peers: [VitrLANPeer] = []
    @Published private(set) var status = "WLAN sync is off"
    @Published private(set) var progress: Double = 0

    private let queue = DispatchQueue(
        label: "vitr.lan.sync",
        qos: .userInitiated
    )

    private var listener: NWListener?
    private var browser: NWBrowser?
    private var serviceName = ""

    private init() {}

    func start() {
        if listener != nil {
            return
        }

        let code =
            String(
                format: "%06d",
                Int.random(
                    in: 100000...999999
                )
            )

        DispatchQueue.main.async {
            self.pairCode = code
            self.status =
                "Sharing completed downloads on WLAN"
        }

        do {
            let listener =
                try NWListener(
                    using: .tcp
                )

            serviceName =
                "Vitr-" +
                String(
                    UIDevice.current.name
                        .replacingOccurrences(
                            of: " ",
                            with: "-"
                        )
                        .prefix(24)
                )

            listener.service =
                NWListener.Service(
                    name: serviceName,
                    type: "_vitr-sync._tcp"
                )

            listener.newConnectionHandler = {
                [weak self]
                connection in

                guard let self else {
                    return
                }

                connection.start(
                    queue: self.queue
                )

                Task {
                    await self.handle(
                        connection:
                            connection
                    )
                }
            }

            listener.stateUpdateHandler = {
                [weak self]
                state in

                guard let self else {
                    return
                }

                DispatchQueue.main.async {
                    switch state {
                    case .ready:
                        self.sharing = true

                    case .failed(let error):
                        self.sharing = false
                        self.status =
                            "WLAN sync failed: \(error.localizedDescription)"

                    default:
                        break
                    }
                }
            }

            self.listener = listener
            listener.start(
                queue: queue
            )

            let browser =
                NWBrowser(
                    for:
                        .bonjour(
                            type:
                                "_vitr-sync._tcp",
                            domain: nil
                        ),
                    using: .tcp
                )

            browser.browseResultsChangedHandler = {
                [weak self]
                results,
                _ in

                guard let self else {
                    return
                }

                let next =
                    results
                        .compactMap {
                            result ->
                            VitrLANPeer? in

                            guard
                                case let
                                    .service(
                                        name,
                                        _,
                                        _,
                                        _
                                    ) =
                                    result.endpoint,
                                name !=
                                    self.serviceName
                            else {
                                return nil
                            }

                            return VitrLANPeer(
                                id:
                                    "\(name)-\(result.endpoint.debugDescription)",
                                name: name,
                                endpoint:
                                    result.endpoint
                            )
                        }
                        .sorted {
                            $0.name <
                                $1.name
                        }

                DispatchQueue.main.async {
                    self.peers = next
                }
            }

            browser.stateUpdateHandler = {
                [weak self]
                state in

                guard let self else {
                    return
                }

                if case .failed(let error) =
                    state {
                    DispatchQueue.main.async {
                        self.status =
                            "WLAN discovery failed: \(error.localizedDescription)"
                    }
                }
            }

            self.browser = browser
            browser.start(
                queue: queue
            )
        } catch {
            DispatchQueue.main.async {
                self.status =
                    "WLAN sync could not start"
            }
        }
    }

    func stop() {
        listener?.cancel()
        browser?.cancel()
        listener = nil
        browser = nil

        DispatchQueue.main.async {
            self.sharing = false
            self.peers = []
            self.status =
                "WLAN sync is off"
            self.progress = 0
        }
    }

    func syncFrom(
        peer: VitrLANPeer,
        pairCode: String
    ) {
        let code =
            pairCode
                .trimmingCharacters(
                    in: .whitespacesAndNewlines
                )

        guard code.count == 6 else {
            status =
                "Enter the 6-digit code shown on the other device"
            return
        }

        Task {
            do {
                await publish(
                    status:
                        "Reading \(peer.name)…",
                    progress: 0
                )

                let remote =
                    try await requestList(
                        peer: peer,
                        pairCode: code
                    )

                let local =
                    await MainActor.run {
                        VitrDownloadLibrary
                            .shared
                            .items
                    }

                let missing =
                    remote.filter {
                        remoteItem in

                        !local.contains {
                            localItem in

                            !remoteItem
                                .sourceURL
                                .isEmpty &&
                            localItem
                                .sourceURL ==
                                remoteItem
                                    .sourceURL &&
                            localItem
                                .format
                                .caseInsensitiveCompare(
                                    remoteItem
                                        .format
                                ) ==
                                .orderedSame &&
                            localItem
                                .quality ==
                                remoteItem
                                    .quality
                        }
                    }

                if missing.isEmpty {
                    await publish(
                        status:
                            "Already in sync with \(peer.name)",
                        progress: 1
                    )
                    return
                }

                for (
                    index,
                    item
                ) in
                    missing.enumerated() {
                    await publish(
                        status:
                            "Receiving \(item.title)",
                        progress:
                            Double(index) /
                            Double(
                                missing.count
                            )
                    )

                    try await receiveFile(
                        peer: peer,
                        pairCode: code,
                        remote: item
                    )
                }

                await publish(
                    status:
                        "Synced \(missing.count) track\(missing.count == 1 ? "" : "s") from \(peer.name)",
                    progress: 1
                )
            } catch {
                await publish(
                    status:
                        error
                            .localizedDescription,
                    progress: 0
                )
            }
        }
    }

    private func handle(
        connection: NWConnection
    ) async {
        do {
            let requestData =
                try await receiveLine(
                    connection
                )

            guard
                let request =
                    try JSONSerialization
                        .jsonObject(
                            with:
                                requestData
                        )
                        as? [
                            String: Any
                        ]
            else {
                try await sendError(
                    connection,
                    message:
                        "Invalid sync request"
                )
                connection.cancel()
                return
            }

            guard
                request["version"]
                    as? Int == 1
            else {
                try await sendError(
                    connection,
                    message:
                        "Unsupported Vitr Sync version"
                )
                connection.cancel()
                return
            }

            let currentCode =
                await MainActor.run {
                    self.pairCode
                }

            guard
                request["code"]
                    as? String ==
                    currentCode
            else {
                try await sendError(
                    connection,
                    message:
                        "Pairing code does not match"
                )
                connection.cancel()
                return
            }

            switch
                request["op"]
                    as? String {
            case "list":
                try await sendList(
                    connection
                )

            case "get":
                guard
                    let id =
                        request["id"]
                            as? String
                else {
                    try await sendError(
                        connection,
                        message:
                            "Track id is missing"
                    )
                    break
                }

                try await sendFile(
                    connection,
                    itemID: id
                )

            default:
                try await sendError(
                    connection,
                    message:
                        "Unknown sync request"
                )
            }

            try await finishSending(
                connection
            )
            connection.cancel()
        } catch {
            connection.cancel()
        }
    }

    private func sendList(
        _ connection: NWConnection
    ) async throws {
        let items =
            await MainActor.run {
                VitrDownloadLibrary
                    .shared
                    .items
            }

        let payload:
            [String: Any] = [
                "ok": true,
                "items":
                    items.map {
                        item in
                        [
                            "id":
                                item.id,
                            "title":
                                item.title,
                            "artist":
                                item.artist,
                            "format":
                                item.format,
                            "quality":
                                item.quality,
                            "sourceUrl":
                                item.sourceURL
                        ]
                    }
            ]

        try await sendJSONLine(
            connection,
            object: payload
        )
    }

    private func sendFile(
        _ connection: NWConnection,
        itemID: String
    ) async throws {
        let selectedItem =
            await MainActor.run {
                VitrDownloadLibrary
                    .shared
                    .items
                    .first {
                        $0.id ==
                            itemID
                    }
            }

        guard let item = selectedItem else {
            try await sendError(
                connection,
                message:
                    "Track is not available"
            )
            return
        }

        let values =
            try item
                .fileURL
                .resourceValues(
                    forKeys: [
                        .fileSizeKey
                    ]
                )

        guard
            let size =
                values.fileSize,
            size > 0
        else {
            try await sendError(
                connection,
                message:
                    "Track size is unavailable"
            )
            return
        }

        try await sendJSONLine(
            connection,
            object: [
                "ok": true,
                "size": size,
                "title": item.title,
                "artist": item.artist,
                "format": item.format,
                "quality": item.quality,
                "sourceUrl":
                    item.sourceURL
            ]
        )

        let handle =
            try FileHandle(
                forReadingFrom:
                    item.fileURL
            )

        defer {
            try? handle.close()
        }

        while true {
            let chunk =
                try handle.read(
                    upToCount:
                        64 * 1024
                )
                ?? Data()

            if chunk.isEmpty {
                break
            }

            try await send(
                connection,
                data: chunk
            )
        }
    }

    private func requestList(
        peer: VitrLANPeer,
        pairCode: String
    ) async throws
        -> [RemoteItem] {
        let connection =
            NWConnection(
                to: peer.endpoint,
                using: .tcp
            )

        connection.start(
            queue: queue
        )

        defer {
            connection.cancel()
        }

        try await waitUntilReady(
            connection
        )

        try await sendJSONLine(
            connection,
            object: [
                "version": 1,
                "op": "list",
                "code": pairCode
            ]
        )

        let responseData =
            try await receiveLine(
                connection
            )

        guard
            let response =
                try JSONSerialization
                    .jsonObject(
                        with:
                            responseData
                    )
                    as? [
                        String: Any
                    ]
        else {
            throw SyncError(
                "Invalid sync response"
            )
        }

        guard
            response["ok"]
                as? Bool == true
        else {
            throw SyncError(
                response["error"]
                    as? String
                    ?? "Could not read remote library"
            )
        }

        let values =
            response["items"]
                as? [[String: Any]]
                ?? []

        return values.map {
            value in
            RemoteItem(
                id:
                    value["id"]
                    as? String
                    ?? "",
                title:
                    value["title"]
                    as? String
                    ?? "Synced track",
                artist:
                    value["artist"]
                    as? String
                    ?? "Unknown artist",
                format:
                    value["format"]
                    as? String
                    ?? "MP3",
                quality:
                    value["quality"]
                    as? String
                    ?? "Synced",
                sourceURL:
                    value["sourceUrl"]
                    as? String
                    ?? ""
            )
        }
    }

    private func receiveFile(
        peer: VitrLANPeer,
        pairCode: String,
        remote: RemoteItem
    ) async throws {
        let connection =
            NWConnection(
                to: peer.endpoint,
                using: .tcp
            )

        connection.start(
            queue: queue
        )

        defer {
            connection.cancel()
        }

        try await waitUntilReady(
            connection
        )

        try await sendJSONLine(
            connection,
            object: [
                "version": 1,
                "op": "get",
                "code": pairCode,
                "id": remote.id
            ]
        )

        let headerData =
            try await receiveLine(
                connection
            )

        guard
            let header =
                try JSONSerialization
                    .jsonObject(
                        with:
                            headerData
                    )
                    as? [
                        String: Any
                    ]
        else {
            throw SyncError(
                "Invalid file response"
            )
        }

        guard
            header["ok"]
                as? Bool == true
        else {
            throw SyncError(
                header["error"]
                    as? String
                    ?? "Could not receive track"
            )
        }

        let size =
            (header["size"] as? NSNumber)?
                .int64Value
                ?? 0

        guard size > 0 else {
            throw SyncError(
                "Remote track is empty"
            )
        }

        let format =
            (
                header["format"]
                    as? String
                )
                ?? remote.format

        let tempURL =
            FileManager.default
                .temporaryDirectory
                .appendingPathComponent(
                    UUID().uuidString +
                    "." +
                    format.lowercased()
                )

        FileManager.default
            .createFile(
                atPath:
                    tempURL.path,
                contents: nil
            )

        let handle =
            try FileHandle(
                forWritingTo:
                    tempURL
            )

        do {
            var remaining =
                size

            while remaining > 0 {
                let chunk =
                    try await receiveChunk(
                        connection,
                        maximumLength:
                            Int(
                                min(
                                    64 * 1024,
                                    remaining
                                )
                            )
                    )

                guard
                    !chunk.isEmpty
                else {
                    throw SyncError(
                        "Sync transfer ended early"
                    )
                }

                try handle.write(
                    contentsOf:
                        chunk
                )

                remaining -=
                    Int64(
                        chunk.count
                    )
            }

            try handle.close()

            try await MainActor.run {
                try VitrDownloadLibrary
                    .shared
                    .register(
                        fileURL:
                            tempURL,
                        title:
                            header["title"]
                            as? String
                            ?? remote.title,
                        artist:
                            header["artist"]
                            as? String
                            ?? remote.artist,
                        format:
                            format,
                        quality:
                            header["quality"]
                            as? String
                            ?? remote.quality,
                        sourceURL:
                            header["sourceUrl"]
                            as? String
                            ?? remote.sourceURL
                    )
            }
        } catch {
            try? handle.close()
            try? FileManager.default
                .removeItem(
                    at:
                        tempURL
                )
            throw error
        }
    }

    private func sendError(
        _ connection: NWConnection,
        message: String
    ) async throws {
        try await sendJSONLine(
            connection,
            object: [
                "ok": false,
                "error": message
            ]
        )
    }

    private func sendJSONLine(
        _ connection: NWConnection,
        object: [String: Any]
    ) async throws {
        var data =
            try JSONSerialization
                .data(
                    withJSONObject:
                        object
                )

        data.append(
            0x0A
        )

        try await send(
            connection,
            data: data
        )
    }

    private func send(
        _ connection: NWConnection,
        data: Data
    ) async throws {
        try await withCheckedThrowingContinuation {
            (
                continuation:
                    CheckedContinuation<Void, Error>
            ) in

            connection.send(
                content: data,
                completion:
                    .contentProcessed {
                        error in

                        if let error {
                            continuation
                                .resume(
                                    throwing:
                                        error
                                )
                        } else {
                            continuation
                                .resume()
                        }
                    }
            )
        }
    }

    private func finishSending(
        _ connection: NWConnection
    ) async throws {
        try await withCheckedThrowingContinuation {
            (
                continuation:
                    CheckedContinuation<Void, Error>
            ) in

            connection.send(
                content: nil,
                contentContext:
                    .finalMessage,
                isComplete: true,
                completion:
                    .contentProcessed {
                        error in

                        if let error {
                            continuation
                                .resume(
                                    throwing:
                                        error
                                )
                        } else {
                            continuation
                                .resume()
                        }
                    }
            )
        }
    }

    private func receiveLine(
        _ connection: NWConnection
    ) async throws -> Data {
        var accumulated =
            Data()

        while
            accumulated.count <
                128 * 1024 {
            let chunk =
                try await receiveChunk(
                    connection,
                    maximumLength:
                        1
                )

            guard
                !chunk.isEmpty
            else {
                throw SyncError(
                    "Sync device closed the connection"
                )
            }

            if let newline =
                chunk.firstIndex(
                    of: 0x0A
                ) {
                accumulated.append(
                    chunk.prefix(
                        upTo: newline
                    )
                )
                return accumulated
            }

            accumulated.append(
                chunk
            )
        }

        throw SyncError(
            "Sync response is too large"
        )
    }

    private func receiveChunk(
        _ connection: NWConnection,
        maximumLength: Int
    ) async throws -> Data {
        try await withCheckedThrowingContinuation {
            continuation in

            connection.receive(
                minimumIncompleteLength:
                    1,
                maximumLength:
                    maximumLength
            ) {
                data,
                _,
                isComplete,
                error in

                if let error {
                    continuation
                        .resume(
                            throwing:
                                error
                        )
                    return
                }

                if
                    isComplete,
                    data == nil {
                    continuation
                        .resume(
                            returning:
                                Data()
                        )
                    return
                }

                continuation
                    .resume(
                        returning:
                            data
                            ?? Data()
                    )
            }
        }
    }

    private func waitUntilReady(
        _ connection: NWConnection
    ) async throws {
        try await withCheckedThrowingContinuation {
            continuation in

            connection.stateUpdateHandler = {
                state in

                switch state {
                case .ready:
                    continuation
                        .resume()

                case .failed(
                    let error
                ):
                    continuation
                        .resume(
                            throwing:
                                error
                        )

                case .cancelled:
                    continuation
                        .resume(
                            throwing:
                                SyncError(
                                    "Connection cancelled"
                                )
                        )

                default:
                    break
                }
            }
        }
    }

    @MainActor
    private func publish(
        status: String,
        progress: Double
    ) {
        self.status = status
        self.progress = progress
    }

    private struct RemoteItem {
        let id: String
        let title: String
        let artist: String
        let format: String
        let quality: String
        let sourceURL: String
    }

    private struct SyncError:
        LocalizedError {
        let message: String

        init(
            _ message: String
        ) {
            self.message =
                message
        }

        var errorDescription:
            String? {
            message
        }
    }
}
