import Foundation
import MultipeerConnectivity
import UIKit

struct VitrNearbyPeer: Identifiable {
    let id: String
    let name: String
    fileprivate let peerID: MCPeerID
}

final class VitrNearbySyncManager:
    NSObject,
    ObservableObject {
    static let shared =
        VitrNearbySyncManager()

    @Published private(set)
        var peers:
        [VitrNearbyPeer] = []

    @Published private(set)
        var status =
        "Nearby sync is off"

    @Published private(set)
        var progress:
        Double = 0

    private let serviceType =
        "vitr-nearby"

    private let localPeer =
        MCPeerID(
            displayName:
                UIDevice
                    .current
                    .name
        )

    private lazy var session =
        MCSession(
            peer: localPeer,
            securityIdentity: nil,
            encryptionPreference:
                .required
        )

    private lazy var advertiser =
        MCNearbyServiceAdvertiser(
            peer: localPeer,
            discoveryInfo: nil,
            serviceType:
                serviceType
        )

    private lazy var browser =
        MCNearbyServiceBrowser(
            peer: localPeer,
            serviceType:
                serviceType
        )

    private var pendingCode:
        [String: String] = [:]

    private var incomingMetadata:
        [String: RemoteItem] = [:]

    private override init() {
        super.init()

        session.delegate = self
        advertiser.delegate = self
        browser.delegate = self
    }

    func start() {
        advertiser.startAdvertisingPeer()
        browser.startBrowsingForPeers()

        DispatchQueue.main.async {
            self.status =
                "Nearby sync ready"
        }
    }

    func stop() {
        advertiser.stopAdvertisingPeer()
        browser.stopBrowsingForPeers()
        session.disconnect()

        DispatchQueue.main.async {
            self.peers = []
            self.status =
                "Nearby sync is off"
            self.progress = 0
        }
    }

    func syncFrom(
        peer: VitrNearbyPeer,
        pairCode: String
    ) {
        let code =
            pairCode
                .trimmingCharacters(
                    in:
                        .whitespacesAndNewlines
                )

        guard code.count == 6 else {
            status =
                "Enter the 6-digit code shown on the other device"
            return
        }

        pendingCode[
            peer.peerID
                .displayName
        ] = code

        if session
            .connectedPeers
            .contains(
                peer.peerID
            ) {
            sendListRequest(
                to:
                    peer.peerID,
                code: code
            )
        } else {
            status =
                "Connecting to \(peer.name)…"

            browser.invitePeer(
                peer.peerID,
                to: session,
                withContext: nil,
                timeout: 30
            )
        }
    }

    private func sendListRequest(
        to peer: MCPeerID,
        code: String
    ) {
        send(
            [
                "op":
                    "list",
                "code":
                    code
            ],
            to: peer
        )

        DispatchQueue.main.async {
            self.status =
                "Reading \(peer.displayName)…"
            self.progress = 0
        }
    }

    private func handleMessage(
        _ object: [String: Any],
        from peer: MCPeerID
    ) {
        let op =
            object["op"]
                as? String
                ?? ""

        switch op {
        case "list":
            let code =
                object["code"]
                    as? String
                    ?? ""

            Task {
                let localCode =
                    await MainActor.run {
                        VitrLANSyncManager
                            .shared
                            .pairCode
                    }

                guard
                    code ==
                        localCode,
                    !code.isEmpty
                else {
                    send(
                        [
                            "op":
                                "error",
                            "message":
                                "Pairing code does not match"
                        ],
                        to: peer
                    )
                    return
                }

                let items =
                    await MainActor.run {
                        VitrDownloadLibrary
                            .shared
                            .items
                    }

                send(
                    [
                        "op":
                            "listResponse",
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
                    ],
                    to: peer
                )
            }

        case "listResponse":
            let values =
                object["items"]
                    as? [
                        [String: Any]
                    ]
                    ?? []

            let remote =
                values.map {
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

            Task {
                let local =
                    await MainActor.run {
                        VitrDownloadLibrary
                            .shared
                            .items
                    }

                let missing =
                    remote.filter {
                        item in

                        !local.contains {
                            existing in

                            !item
                                .sourceURL
                                .isEmpty &&
                            existing
                                .sourceURL ==
                                item
                                    .sourceURL &&
                            existing
                                .format
                                .caseInsensitiveCompare(
                                    item.format
                                ) ==
                                .orderedSame &&
                            existing
                                .quality ==
                                item
                                    .quality
                        }
                    }

                let code =
                    pendingCode[
                        peer.displayName
                    ] ?? ""

                if missing.isEmpty {
                    DispatchQueue.main.async {
                        self.status =
                            "Already in sync with \(peer.displayName)"
                        self.progress = 1
                    }
                    return
                }

                missing.forEach {
                    item in

                    send(
                        [
                            "op":
                                "get",
                            "code":
                                code,
                            "id":
                                item.id
                        ],
                        to: peer
                    )
                }

                DispatchQueue.main.async {
                    self.status =
                        "Receiving \(missing.count) track\(missing.count == 1 ? "" : "s") from \(peer.displayName)"
                }
            }

        case "get":
            let code =
                object["code"]
                    as? String
                    ?? ""

            let itemID =
                object["id"]
                    as? String
                    ?? ""

            Task {
                let localCode =
                    await MainActor.run {
                        VitrLANSyncManager
                            .shared
                            .pairCode
                    }

                guard
                    code ==
                        localCode,
                    !code.isEmpty
                else {
                    return
                }

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
                    return
                }

                let transferID =
                    UUID()
                        .uuidString

                send(
                    [
                        "op":
                            "fileMeta",
                        "transferId":
                            transferID,
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
                    ],
                    to: peer
                )

                session.sendResource(
                    at:
                        item.fileURL,
                    withName:
                        transferID,
                    toPeer:
                        peer
                ) {
                    error in

                    if let error {
                        DispatchQueue
                            .main
                            .async {
                                self.status =
                                    error
                                        .localizedDescription
                            }
                    }
                }
            }

        case "fileMeta":
            guard
                let transferID =
                    object[
                        "transferId"
                    ]
                    as? String
            else {
                return
            }

            incomingMetadata[
                transferID
            ] =
                RemoteItem(
                    id:
                        transferID,
                    title:
                        object["title"]
                            as? String
                            ?? "Synced track",
                    artist:
                        object["artist"]
                            as? String
                            ?? "Unknown artist",
                    format:
                        object["format"]
                            as? String
                            ?? "MP3",
                    quality:
                        object["quality"]
                            as? String
                            ?? "Synced",
                    sourceURL:
                        object["sourceUrl"]
                            as? String
                            ?? ""
                )

        case "error":
            DispatchQueue.main.async {
                self.status =
                    object["message"]
                        as? String
                        ?? "Nearby sync failed"
            }

        default:
            break
        }
    }

    private func send(
        _ object: [String: Any],
        to peer: MCPeerID
    ) {
        guard
            JSONSerialization
                .isValidJSONObject(
                    object
                )
        else {
            return
        }

        do {
            let data =
                try JSONSerialization
                    .data(
                        withJSONObject:
                            object
                    )

            try session.send(
                data,
                toPeers: [
                    peer
                ],
                with: .reliable
            )
        } catch {
            DispatchQueue.main.async {
                self.status =
                    error
                        .localizedDescription
            }
        }
    }

    private struct RemoteItem {
        let id: String
        let title: String
        let artist: String
        let format: String
        let quality: String
        let sourceURL: String
    }
}

extension VitrNearbySyncManager:
    MCNearbyServiceAdvertiserDelegate {
    func advertiser(
        _ advertiser:
            MCNearbyServiceAdvertiser,
        didReceiveInvitationFromPeer
            peerID: MCPeerID,
        withContext context: Data?,
        invitationHandler:
            @escaping (
                Bool,
                MCSession?
            ) -> Void
    ) {
        invitationHandler(
            true,
            session
        )
    }

    func advertiser(
        _ advertiser:
            MCNearbyServiceAdvertiser,
        didNotStartAdvertisingPeer
            error: Error
    ) {
        DispatchQueue.main.async {
            self.status =
                error
                    .localizedDescription
        }
    }
}

extension VitrNearbySyncManager:
    MCNearbyServiceBrowserDelegate {
    func browser(
        _ browser:
            MCNearbyServiceBrowser,
        foundPeer peerID:
            MCPeerID,
        withDiscoveryInfo info:
            [String: String]?
    ) {
        DispatchQueue.main.async {
            if
                !self.peers
                    .contains(
                        where: {
                            $0.id ==
                                peerID.displayName
                        }
                    ) {
                self.peers.append(
                    VitrNearbyPeer(
                        id:
                            peerID
                                .displayName,
                        name:
                            peerID
                                .displayName,
                        peerID:
                            peerID
                    )
                )
            }
        }
    }

    func browser(
        _ browser:
            MCNearbyServiceBrowser,
        lostPeer peerID:
            MCPeerID
    ) {
        DispatchQueue.main.async {
            self.peers
                .removeAll {
                    $0.id ==
                        peerID
                            .displayName
                }
        }
    }

    func browser(
        _ browser:
            MCNearbyServiceBrowser,
        didNotStartBrowsingForPeers
            error: Error
    ) {
        DispatchQueue.main.async {
            self.status =
                error
                    .localizedDescription
        }
    }
}

extension VitrNearbySyncManager:
    MCSessionDelegate {
    func session(
        _ session: MCSession,
        peer peerID:
            MCPeerID,
        didChange state:
            MCSessionState
    ) {
        if state == .connected {
            if
                let code =
                    pendingCode[
                        peerID
                            .displayName
                    ] {
                sendListRequest(
                    to:
                        peerID,
                    code:
                        code
                )
            }
        }
    }

    func session(
        _ session: MCSession,
        didReceive data: Data,
        fromPeer peerID:
            MCPeerID
    ) {
        guard
            let object =
                try? JSONSerialization
                    .jsonObject(
                        with: data
                    )
                    as? [
                        String: Any
                    ]
        else {
            return
        }

        handleMessage(
            object,
            from:
                peerID
        )
    }

    func session(
        _ session: MCSession,
        didStartReceivingResourceWithName
            resourceName: String,
        fromPeer peerID:
            MCPeerID,
        with progress:
            Progress
    ) {
        DispatchQueue.main.async {
            self.status =
                "Receiving from \(peerID.displayName)"
        }
    }

    func session(
        _ session: MCSession,
        didFinishReceivingResourceWithName
            resourceName: String,
        fromPeer peerID:
            MCPeerID,
        at localURL:
            URL?,
        withError error:
            Error?
    ) {
        if let error {
            DispatchQueue.main.async {
                self.status =
                    error
                        .localizedDescription
            }
            return
        }

        guard
            let localURL,
            let metadata =
                incomingMetadata
                    .removeValue(
                        forKey:
                            resourceName
                    )
        else {
            return
        }

        let temporary =
            FileManager
                .default
                .temporaryDirectory
                .appendingPathComponent(
                    UUID()
                        .uuidString +
                    "." +
                    metadata
                        .format
                        .lowercased()
                )

        do {
            try FileManager
                .default
                .copyItem(
                    at:
                        localURL,
                    to:
                        temporary
                )

            Task {
                do {
                    try await MainActor.run {
                        try VitrDownloadLibrary
                            .shared
                            .register(
                                fileURL:
                                    temporary,
                                title:
                                    metadata
                                        .title,
                                artist:
                                    metadata
                                        .artist,
                                format:
                                    metadata
                                        .format,
                                quality:
                                    metadata
                                        .quality,
                                sourceURL:
                                    metadata
                                        .sourceURL
                            )
                    }

                    DispatchQueue.main.async {
                        self.status =
                            "Nearby sync complete"
                        self.progress = 1
                    }
                } catch {
                    DispatchQueue.main.async {
                        self.status =
                            error
                                .localizedDescription
                    }
                }
            }
        } catch {
            DispatchQueue.main.async {
                self.status =
                    error
                        .localizedDescription
            }
        }
    }

    func session(
        _ session: MCSession,
        didReceive stream:
            InputStream,
        withName streamName:
            String,
        fromPeer peerID:
            MCPeerID
    ) {
    }

    func session(
        _ session: MCSession,
        didReceiveCertificate
            certificate:
            [Any]?,
        fromPeer peerID:
            MCPeerID,
        certificateHandler:
            @escaping (
                Bool
            ) -> Void
    ) {
        certificateHandler(
            true
        )
    }
}

