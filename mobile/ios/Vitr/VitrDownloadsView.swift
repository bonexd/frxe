import SwiftUI

struct VitrDownloadsView: View {
    @ObservedObject private var library =
        VitrDownloadLibrary.shared

    @ObservedObject private var playback =
        VitrPlaybackController.shared

    @State private var showingSync = false
    @State private var showingDeleteAll = false

    var body: some View {
        ScrollView(
            showsIndicators: false
        ) {
            VStack(
                alignment: .leading,
                spacing: 16
            ) {
                HStack {
                    VStack(
                        alignment: .leading,
                        spacing: 3
                    ) {
                        Text("Downloads")
                            .font(
                                .system(
                                    size: 32,
                                    weight: .bold
                                )
                            )

                        Text(
                            "Offline music in Files/Vitr"
                        )
                        .font(.caption)
                        .foregroundStyle(
                            .secondary
                        )
                    }

                    Spacer()

                    if !library.items.isEmpty {
                        Button(role: .destructive) {
                            showingDeleteAll = true
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 16, weight: .bold))
                                .frame(width: 42, height: 42)
                                .background(
                                    .ultraThinMaterial,
                                    in: Circle()
                                )
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Delete All Downloads")
                    }

                    Button {
                        showingSync = true
                    } label: {
                        Image(
                            systemName:
                                "arrow.triangle.2.circlepath"
                        )
                        .font(
                            .system(
                                size: 17,
                                weight: .bold
                            )
                        )
                        .frame(
                            width: 42,
                            height: 42
                        )
                        .background(
                            .ultraThinMaterial,
                            in: Circle()
                        )
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 12)

                if library.items.isEmpty {
                    VitrDownloadsEmptyCard()
                } else {
                    ForEach(
                        library.items
                    ) { item in
                        VitrDownloadedRow(
                            item: item,
                            onPlay: {
                                _ = playback.playDownloaded(
                                    item,
                                    queue: library.items
                                )
                            },
                            onDelete: {
                                library.remove(
                                    item
                                )
                            }
                        )
                    }
                }

                Color.clear
                    .frame(
                        height: 150
                    )
            }
            .padding(
                .horizontal,
                16
            )
        }
        .sheet(
            isPresented:
                $showingSync
        ) {
            VitrDeviceSyncView()
        }
        .confirmationDialog(
            "Delete All Downloads?",
            isPresented: $showingDeleteAll,
            titleVisibility: .visible
        ) {
            Button(
                "Delete All Downloads",
                role: .destructive
            ) {
                playback.clearLocalPlaybackState()
                library.removeAll()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(
                "This removes downloaded music from this device only. Your playlists and other local library settings are kept."
            )
        }
        .onAppear {
            library.refresh()
        }
    }


}

private struct VitrDownloadsEmptyCard: View {
    var body: some View {
        VStack(
            spacing: 12
        ) {
            Image(
                systemName:
                    "arrow.down.circle"
            )
            .font(
                .system(
                    size: 34,
                    weight: .medium
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
                "No downloads yet"
            )
            .font(
                .headline
            )

            Text(
                "Downloaded or synced tracks will appear here."
            )
            .font(
                .caption
            )
            .foregroundStyle(
                .secondary
            )
            .multilineTextAlignment(
                .center
            )
        }
        .frame(
            maxWidth: .infinity
        )
        .padding(
            28
        )
        .background(
            .ultraThinMaterial,
            in:
                RoundedRectangle(
                    cornerRadius: 26,
                    style: .continuous
                )
        )
        .overlay(
            RoundedRectangle(
                cornerRadius: 26,
                style: .continuous
            )
            .stroke(
                .white.opacity(0.16),
                lineWidth: 1
            )
        )
    }
}

private struct VitrDownloadedRow: View {
    let item: VitrDownloadedItem
    let onPlay: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(
            spacing: 12
        ) {
            ZStack {
                LinearGradient(
                    colors: [
                        Color(
                            red: 1.0,
                            green: 0.28,
                            blue: 0.44
                        ),
                        Color(
                            red: 0.28,
                            green: 0.42,
                            blue: 0.82
                        )
                    ],
                    startPoint:
                        .topLeading,
                    endPoint:
                        .bottomTrailing
                )

                Image(
                    systemName:
                        "waveform"
                )
                .foregroundStyle(
                    .white.opacity(
                        0.85
                    )
                )
            }
            .frame(
                width: 54,
                height: 54
            )
            .clipShape(
                RoundedRectangle(
                    cornerRadius: 15,
                    style: .continuous
                )
            )

            VStack(
                alignment: .leading,
                spacing: 3
            ) {
                Text(
                    item.title
                )
                .font(
                    .subheadline
                        .weight(
                            .semibold
                        )
                )
                .lineLimit(1)

                Text(
                    item.artist
                )
                .font(.caption)
                .foregroundStyle(
                    .secondary
                )
                .lineLimit(1)

                Text(
                    "\(item.format) • \(item.quality)"
                )
                .font(.caption2)
                .foregroundStyle(
                    .secondary
                )
            }

            Spacer()

            Button(
                action: onPlay
            ) {
                Image(
                    systemName:
                        "play.fill"
                )
                .frame(
                    width: 36,
                    height: 36
                )
                .background(
                    .white.opacity(
                        0.09
                    ),
                    in: Circle()
                )
            }
            .buttonStyle(.plain)

            Button(
                role: .destructive,
                action: onDelete
            ) {
                Image(
                    systemName:
                        "trash"
                )
                .frame(
                    width: 36,
                    height: 36
                )
            }
            .buttonStyle(.plain)
        }
        .padding(10)
        .background(
            .ultraThinMaterial,
            in:
                RoundedRectangle(
                    cornerRadius: 20,
                    style: .continuous
                )
        )
        .overlay(
            RoundedRectangle(
                cornerRadius: 20,
                style: .continuous
            )
            .stroke(
                .white.opacity(0.14),
                lineWidth: 1
            )
        )
    }
}
