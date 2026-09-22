package com.frxe.music.save

enum class DownloadResolverKind {
    InnerTube,
    NewPipe,
    YtDlp
}

fun downloadResolverOrder(): List<DownloadResolverKind> = listOf(
    DownloadResolverKind.InnerTube,
    DownloadResolverKind.NewPipe,
    DownloadResolverKind.YtDlp
)
