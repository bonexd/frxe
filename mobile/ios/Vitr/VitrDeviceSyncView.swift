import SwiftUI

struct VitrDeviceSyncView: View {
    @Environment(\.dismiss)
    private var dismiss

    @ObservedObject
    private var lan =
        VitrLANSyncManager.shared

    @ObservedObject
    private var nearby =
        VitrNearbySyncManager.shared

    @State
    private var remoteCode =
        ""

    var body: some View {
        NavigationStack {
            ScrollView(
                showsIndicators: false
            ) {
                VStack(
                    alignment: .leading,
                    spacing: 16
                ) {
                    Text(
                        "Vitr Sync"
                    )
                    .font(
                        .system(
                            size: 30,
                            weight: .bold
                        )
                    )

                    Text(
                        "Transfer Vitr music between Windows and mobile using the existing Vitr Sync transports. Local playback stays available offline."
                    )
                    .font(.caption)
                    .foregroundStyle(
                        .secondary
                    )

                    panel {
                        VStack(
                            alignment: .leading,
                            spacing: 9
                        ) {
                            Label(
                                "This device",
                                systemImage:
                                    "arrow.triangle.2.circlepath"
                            )
                            .font(
                                .headline
                            )

                            Text(
                                lan.pairCode
                                    .isEmpty
                                ? "Starting…"
                                : lan.pairCode
                            )
                            .font(
                                .system(
                                    size: 34,
                                    weight: .black,
                                    design:
                                        .rounded
                                )
                            )
                            .foregroundStyle(
                                Color(
                                    red: 1.0,
                                    green: 0.28,
                                    blue: 0.44
                                )
                            )

                            Text(
                                "Pairing code"
                            )
                            .font(.caption)
                            .foregroundStyle(
                                .secondary
                            )
                        }
                    }

                    panel {
                        VStack(
                            alignment: .leading,
                            spacing: 10
                        ) {
                            Text(
                                "Other device"
                            )
                            .font(
                                .headline
                            )

                            TextField(
                                "6-digit code",
                                text:
                                    $remoteCode
                            )
                            .keyboardType(
                                .numberPad
                            )
                            .textFieldStyle(
                                .roundedBorder
                            )
                            .onChange(
                                of: remoteCode
                            ) {
                                newValue in

                                remoteCode =
                                    String(
                                        newValue
                                            .filter(
                                                \.isNumber
                                            )
                                            .prefix(
                                                6
                                            )
                                    )
                            }
                        }
                    }

                    sectionHeader(
                        title: "WLAN",
                        symbol: "wifi",
                        status: lan.status,
                        progress:
                            lan.progress
                    )

                    if lan.peers.isEmpty {
                        helper(
                            "Waiting for Vitr for Windows or another Vitr device on this Wi-Fi network."
                        )
                    } else {
                        ForEach(
                            lan.peers
                        ) { peer in
                            peerRow(
                                name:
                                    peer.name,
                                subtitle:
                                    "Vitr Sync • Same Wi-Fi network",
                                action: {
                                    lan.syncFrom(
                                        peer:
                                            peer,
                                        pairCode:
                                            remoteCode
                                    )
                                }
                            )
                        }
                    }

                    sectionHeader(
                        title:
                            "Nearby",
                        symbol:
                            "dot.radiowaves.left.and.right",
                        status:
                            nearby.status,
                        progress:
                            nearby.progress
                    )

                    helper(
                        "Nearby uses Apple's peer-to-peer connectivity for iPhone/iPad transfers and may use Wi-Fi or Bluetooth-assisted discovery."
                    )

                    if nearby.peers.isEmpty {
                        helper(
                            "Keep Vitr Sync open on the other Apple device."
                        )
                    } else {
                        ForEach(
                            nearby.peers
                        ) { peer in
                            peerRow(
                                name:
                                    peer.name,
                                subtitle:
                                    "Nearby Apple device",
                                action: {
                                    nearby
                                        .syncFrom(
                                            peer:
                                                peer,
                                            pairCode:
                                                remoteCode
                                        )
                                }
                            )
                        }
                    }

                    Color.clear
                        .frame(
                            height: 24
                        )
                }
                .padding(16)
            }
            .background(
                LinearGradient(
                    colors: [
                        Color(
                            red: 0.055,
                            green: 0.01,
                            blue: 0.022
                        ),
                        Color(
                            red: 0.12,
                            green: 0.01,
                            blue: 0.035
                        ),
                        Color.black
                    ],
                    startPoint:
                        .topLeading,
                    endPoint:
                        .bottomTrailing
                )
                .ignoresSafeArea()
            )
            .toolbar {
                ToolbarItem(
                    placement:
                        .topBarTrailing
                ) {
                    Button(
                        "Done"
                    ) {
                        dismiss()
                    }
                }
            }
        }
        .preferredColorScheme(
            .dark
        )
        .onAppear {
            lan.start()
            nearby.start()
        }
        .onDisappear {
            lan.stop()
            nearby.stop()
        }
    }

    @ViewBuilder
    private func panel<
        Content: View
    >(
        @ViewBuilder
        content:
            () -> Content
    ) -> some View {
        content()
            .padding(16)
            .frame(
                maxWidth:
                    .infinity,
                alignment:
                    .leading
            )
            .background(
                .ultraThinMaterial,
                in:
                    RoundedRectangle(
                        cornerRadius: 24,
                        style:
                            .continuous
                    )
            )
            .overlay(
                RoundedRectangle(
                    cornerRadius: 24,
                    style:
                        .continuous
                )
                .stroke(
                    .white.opacity(
                        0.15
                    ),
                    lineWidth: 1
                )
            )
    }

    @ViewBuilder
    private func sectionHeader(
        title: String,
        symbol: String,
        status: String,
        progress: Double
    ) -> some View {
        panel {
            VStack(
                alignment: .leading,
                spacing: 10
            ) {
                Label(
                    title,
                    systemImage:
                        symbol
                )
                .font(
                    .headline
                )

                if
                    progress > 0,
                    progress < 1 {
                    ProgressView(
                        value:
                            progress
                    )
                    .tint(
                        Color(
                            red: 1.0,
                            green: 0.28,
                            blue: 0.44
                        )
                    )
                }

                Text(
                    status
                )
                .font(.caption)
                .foregroundStyle(
                    .secondary
                )
            }
        }
    }

    @ViewBuilder
    private func peerRow(
        name: String,
        subtitle: String,
        action:
            @escaping () -> Void
    ) -> some View {
        panel {
            HStack(
                spacing: 12
            ) {
                VStack(
                    alignment:
                        .leading,
                    spacing: 3
                ) {
                    Text(
                        name
                    )
                    .font(
                        .subheadline
                            .weight(
                                .semibold
                            )
                    )

                    Text(
                        subtitle
                    )
                    .font(.caption)
                    .foregroundStyle(
                        .secondary
                    )
                }

                Spacer()

                Button(
                    "Sync",
                    action:
                        action
                )
                .buttonStyle(
                    .borderedProminent
                )
                .tint(
                    Color(
                        red: 1.0,
                        green: 0.28,
                        blue: 0.44
                    )
                )
            }
        }
    }

    @ViewBuilder
    private func helper(
        _ text: String
    ) -> some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(
                .secondary
            )
            .padding(
                .horizontal,
                4
            )
    }
}
