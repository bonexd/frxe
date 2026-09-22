package com.frxe.music.save

enum class SaveFormat(val extension: String, val mimeType: String, val displayName: String) {
    M4A("m4a", "audio/mp4", "M4A"),
    MP3("mp3", "audio/mpeg", "MP3"),
    FLAC("flac", "audio/flac", "FLAC"),
    WAV("wav", "audio/wav", "WAV")
}

enum class SaveQuality(val label: String) {
    Mp3K128("128 kbps"),
    Mp3K192("192 kbps"),
    Mp3K256("256 kbps"),
    Mp3K320("320 kbps"),
    Lossless44k("44.1 kHz"),
    Lossless48k("48 kHz")
}

data class SaveRequest(
    val sourceUrl: String,
    val title: String,
    val artist: String,
    val format: SaveFormat,
    val quality: SaveQuality
)

data class SaveMetadata(
    val album: String? = null,
    val playlistTitle: String? = null,
    val trackNumber: Int? = null,
    val discNumber: Int? = null,
    val releaseYear: Int? = null,
    val sourceUrl: String? = null
)

enum class SaveStage { Idle, Validating, Downloading, Converting, Exporting, Complete, Failed, Cancelled }

data class SaveUiState(
    val stage: SaveStage = SaveStage.Idle,
    val progress: Float = 0f,
    val message: String = "Ready",
    val savedUri: String? = null,
    val savedTitle: String? = null,
    val backend: DownloadBackend? = null
) {
    val isBusy: Boolean get() = stage in setOf(
        SaveStage.Validating,
        SaveStage.Downloading,
        SaveStage.Converting,
        SaveStage.Exporting
    )
}

data class SaveResult(
    val uri: String,
    val title: String,
    val artist: String,
    val format: SaveFormat
)

fun qualityOptionsFor(format: SaveFormat): List<SaveQuality> = when (format) {
    SaveFormat.M4A, SaveFormat.MP3 -> listOf(
        SaveQuality.Mp3K128,
        SaveQuality.Mp3K192,
        SaveQuality.Mp3K256,
        SaveQuality.Mp3K320
    )
    SaveFormat.FLAC, SaveFormat.WAV -> listOf(
        SaveQuality.Lossless44k,
        SaveQuality.Lossless48k
    )
}

fun defaultQualityFor(format: SaveFormat): SaveQuality = when (format) {
    SaveFormat.M4A, SaveFormat.MP3 -> SaveQuality.Mp3K320
    SaveFormat.FLAC, SaveFormat.WAV -> SaveQuality.Lossless48k
}
