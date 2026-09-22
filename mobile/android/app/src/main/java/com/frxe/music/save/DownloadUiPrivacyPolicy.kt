package com.frxe.music.save

object DownloadUiPrivacyPolicy {
    private val hiddenBackendNames =
        listOf(
            "yt-dlp",
            "aria2c",
            "ffmpeg",
            "mutagen",
            "innertube",
            "newpipe"
        )

    fun sanitize(rawMessage: String): String {
        val message = rawMessage.trim()
        if (message.isBlank()) {
            return "Processing download…"
        }

        val lower = message.lowercase()
        if (hiddenBackendNames.none(lower::contains)) {
            return message
        }

        return when {
            "fail" in lower ||
                "unavailable" in lower ||
                "not configured" in lower ->
                "Download failed. Try again."

            "ready" in lower ->
                "Download source ready"

            "try" in lower ||
                "prepar" in lower ||
                "resolv" in lower ->
                "Preparing a download source…"

            else ->
                "Processing download…"
        }
    }
}
