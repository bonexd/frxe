package com.frxe.music.save

object InspectedDownloadMatchingPolicy {

    fun matches(
        currentUrl: String,
        inspectedUrl: String
    ): Boolean {
        val current =
            DownloadQueuePolicy.normalizeSource(currentUrl)
        val inspected =
            DownloadQueuePolicy.normalizeSource(inspectedUrl)

        return current.isNotBlank() &&
            inspected.isNotBlank() &&
            current == inspected
    }
}
