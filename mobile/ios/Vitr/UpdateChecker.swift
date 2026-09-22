import Foundation
import Combine

struct GitHubRelease: Decodable {
    let tagName: String
    let htmlURL: URL
    let name: String?
    let body: String?

    enum CodingKeys: String, CodingKey {
        case tagName = "tag_name"
        case htmlURL = "html_url"
        case name
        case body
    }
}

enum UpdateState: Equatable {
    case idle
    case checking
    case upToDate(String)
    case available(String, URL)
    case unavailable(String)
}

@MainActor
final class UpdateChecker: ObservableObject {
    @Published private(set) var state: UpdateState = .idle

    var currentVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
    }

    func check() async {
        state = .checking
        var request = URLRequest(url: VitrLinks.releasesAPI)
        request.timeoutInterval = 10
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("2022-11-28", forHTTPHeaderField: "X-GitHub-Api-Version")
        request.setValue("Vitr/\(currentVersion) iOS", forHTTPHeaderField: "User-Agent")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                state = .unavailable("GitHub update check failed.")
                return
            }

            let releases = try JSONDecoder().decode([GitHubRelease].self, from: data)
            guard let release = releases.first else {
                state = .upToDate(currentVersion)
                return
            }

            let latest = release.tagName.trimmingCharacters(in: CharacterSet(charactersIn: "vV"))
            if compare(latest, currentVersion) == .orderedDescending {
                state = .available(latest, release.htmlURL)
            } else {
                state = .upToDate(latest)
            }
        } catch {
            state = .unavailable("Could not check for updates.")
        }
    }

    private func compare(_ lhs: String, _ rhs: String) -> ComparisonResult {
        lhs.compare(rhs, options: .numeric)
    }
}
